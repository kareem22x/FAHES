/**
 * Hash chain for the field audit trail.
 *
 * ── Why a chain and not just a hash ─────────────────────────────────────────
 *
 * A per-row SHA-256 proves that a row has not been edited since it was written.
 * It does not prove that a row was *not removed*, and it does not prove the
 * order of events — the two things that actually matter when a photo of an
 * odometer is being used to settle a dispute.
 *
 * Chaining fixes both: each action commits to the hash of the action before it.
 * Deleting a row breaks every hash after it, and reordering two rows breaks
 * both. The cost is that the chain must be extended under a lock (the
 * `record_field_action` RPC does this), which is why the hashing itself is a
 * pure function here and the locking lives in SQL.
 *
 * The canonical serialisation is deliberately explicit and stable: field order
 * is fixed, numbers are normalised, and the payload is key-sorted. Hashing
 * `JSON.stringify(obj)` directly would make the hash depend on property
 * insertion order, so two clients could produce different hashes for the same
 * logical action and a valid trail would look forged.
 */

import type { FieldActionContent } from './types'

/** Bump only with a migration; the version is part of the hashed content. */
export const FIELD_CHAIN_VERSION = 'fahes-field-v1'

/**
 * Round coordinates to 7 decimal places (~1.1 cm at the equator).
 *
 * GPS receivers jitter in the last digits between two reads of the same
 * standing position. Hashing the raw float would mean a re-hash of the same
 * physical action never matches, which defeats the point. 7 dp is far finer
 * than any automotive inspection needs and coarse enough to be stable.
 */
export function normalizeCoordinate(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null
  return Math.round(value * 1e7) / 1e7
}

/**
 * Round accuracy to whole metres. The browser reports a float that varies
 * run-to-run for the same fix; a metre is the resolution anyone cares about.
 */
export function normalizeAccuracy(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null
  return Math.round(value)
}

/**
 * Stable JSON: object keys sorted at every depth, arrays kept in order.
 * `undefined` members are dropped so that `{a:1}` and `{a:1,b:undefined}`
 * hash identically — a distinction JavaScript makes and JSON does not.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`
}

/**
 * The exact bytes that get hashed.
 *
 * Exported so a test can pin the serialisation: if someone reorders a field
 * here, every previously written hash becomes unverifiable, and the test is
 * the thing that catches it before that reaches production.
 */
export function canonicalActionString(content: FieldActionContent): string {
  return stableStringify({
    v: FIELD_CHAIN_VERSION,
    claimId: content.claimId,
    inspectionId: content.inspectionId,
    inspectorId: content.inspectorId,
    actionType: content.actionType,
    actionDetail: content.actionDetail,
    recordedAt: content.recordedAtRfc3339,
    latitude: normalizeCoordinate(content.latitude),
    longitude: normalizeCoordinate(content.longitude),
    accuracy: normalizeAccuracy(content.accuracy),
    payload: content.payload,
    prevHash: content.prevHash,
  })
}

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let out = ''
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0')
  return out
}

/**
 * SHA-256 of the canonical string, chained to `prevHash`.
 *
 * Prefixed with `sha256:` so a future migration to another digest is visible in
 * the stored value rather than silent — a verifier can then tell "old algorithm"
 * apart from "tampered".
 */
export async function hashFieldAction(content: FieldActionContent): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalActionString(content))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return `sha256:${toHex(digest)}`
}

/**
 * Recompute a stored action's hash from its own fields and compare.
 *
 * Used by the archive verifier. A `false` here is not proof of tampering on its
 * own (the reader may be on an older chain version), so the caller reports the
 * version alongside the verdict.
 */
export async function verifyFieldAction(
  action: Omit<FieldActionContent, 'payload'> & { payload: Record<string, unknown>; contentHash: string },
): Promise<{ valid: boolean; expected: string }> {
  const expected = await hashFieldAction({
    claimId: action.claimId,
    inspectionId: action.inspectionId,
    inspectorId: action.inspectorId,
    actionType: action.actionType,
    actionDetail: action.actionDetail,
    recordedAtRfc3339: action.recordedAtRfc3339,
    latitude: action.latitude,
    longitude: action.longitude,
    accuracy: action.accuracy,
    payload: action.payload,
    prevHash: action.prevHash,
  })
  return { valid: expected === action.contentHash, expected }
}

/** True when the chain links are intact, i.e. each row points at its parent. */
export function verifyChainLinks(
  actions: ReadonlyArray<{ id: number; prevHash: string; contentHash: string }>,
): { linked: boolean; brokenAt: number | null } {
  const ordered = [...actions].sort((a, b) => a.id - b.id)
  let previous = ''
  for (const action of ordered) {
    if (action.prevHash !== previous) return { linked: false, brokenAt: action.id }
    previous = action.contentHash
  }
  return { linked: true, brokenAt: null }
}
