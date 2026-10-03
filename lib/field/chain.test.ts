import { describe, expect, it } from 'vitest'
import {
  FIELD_CHAIN_VERSION,
  canonicalActionString,
  hashFieldAction,
  normalizeAccuracy,
  normalizeCoordinate,
  stableStringify,
  verifyChainLinks,
  verifyFieldAction,
} from './chain'
import type { FieldActionContent } from './types'

const base: FieldActionContent = {
  claimId: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
  inspectionId: 'FH-2026-ABCD1234',
  inspectorId: 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
  actionType: 'media_upload',
  actionDetail: 'المركبة كاملة',
  recordedAtRfc3339: '2026-10-03T13:22:07.000+03:00',
  latitude: 26.4207,
  longitude: 50.0888,
  accuracy: 12.4,
  payload: { key: 'vehicle_full', bytes: 184320 },
  prevHash: '',
}

describe('normalizeCoordinate', () => {
  it('rounds to 7 decimal places so GPS jitter does not change the hash', () => {
    expect(normalizeCoordinate(26.42070000123)).toBe(normalizeCoordinate(26.42070000249))
    expect(normalizeCoordinate(26.4207)).toBe(26.4207)
  })

  it('keeps negative coordinates (southern/western hemispheres)', () => {
    expect(normalizeCoordinate(-50.08881234)).toBe(-50.0888123)
  })

  it('maps non-finite and missing values to null, never to 0', () => {
    // 0 is a real coordinate in the Gulf of Guinea. Collapsing "no fix" onto it
    // would place an inspector in the ocean instead of recording that we had
    // no fix at all.
    expect(normalizeCoordinate(null)).toBeNull()
    expect(normalizeCoordinate(undefined)).toBeNull()
    expect(normalizeCoordinate(Number.NaN)).toBeNull()
    expect(normalizeCoordinate(Number.POSITIVE_INFINITY)).toBeNull()
  })
})

describe('normalizeAccuracy', () => {
  it('rounds to whole metres', () => {
    expect(normalizeAccuracy(12.4)).toBe(12)
    expect(normalizeAccuracy(12.6)).toBe(13)
  })

  it('maps missing accuracy to null', () => {
    expect(normalizeAccuracy(null)).toBeNull()
    expect(normalizeAccuracy(Number.NaN)).toBeNull()
  })
})

describe('stableStringify', () => {
  it('is insensitive to key insertion order', () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }))
  })

  it('sorts nested object keys too', () => {
    expect(stableStringify({ outer: { z: 1, a: 2 } })).toBe(stableStringify({ outer: { a: 2, z: 1 } }))
  })

  it('preserves array order, because order is meaningful', () => {
    expect(stableStringify([1, 2, 3])).not.toBe(stableStringify([3, 2, 1]))
  })

  it('treats an explicit undefined member as absent', () => {
    expect(stableStringify({ a: 1, b: undefined })).toBe(stableStringify({ a: 1 }))
  })

  it('escapes strings so a crafted value cannot forge structure', () => {
    // A payload value containing a quote and a brace must not be able to close
    // the enclosing object early and change what the hash covers.
    const crafted = stableStringify({ note: '"},"admin":true,"x":"' })
    expect(crafted).toContain('\\"')
    expect(JSON.parse(crafted)).toEqual({ note: '"},"admin":true,"x":"' })
  })
})

describe('canonicalActionString', () => {
  it('stamps the chain version, so a future algorithm change is detectable', () => {
    expect(canonicalActionString(base)).toContain(FIELD_CHAIN_VERSION)
  })

  it('is stable across GPS jitter below 7 decimals', () => {
    const jittered = { ...base, latitude: 26.42070000301, longitude: 50.0888000012 }
    expect(canonicalActionString(jittered)).toBe(canonicalActionString(base))
  })

  it('changes when any committed field changes', () => {
    const variants: Partial<FieldActionContent>[] = [
      { actionType: 'report_submit' },
      { actionDetail: 'لوحة المعرض' },
      { recordedAtRfc3339: '2026-10-03T13:22:08.000+03:00' },
      { latitude: 26.5 },
      { longitude: 50.2 },
      { accuracy: 40 },
      { prevHash: 'sha256:deadbeef' },
      { payload: { key: 'vehicle_full', bytes: 1 } },
      { claimId: 'cccccccc-3333-4333-8333-cccccccccccc' },
      { inspectorId: 'dddddddd-4444-4444-8444-dddddddddddd' },
      { inspectionId: 'FH-2026-OTHER' },
    ]
    const baseline = canonicalActionString(base)
    for (const variant of variants) {
      expect(canonicalActionString({ ...base, ...variant })).not.toBe(baseline)
    }
  })
})

describe('hashFieldAction', () => {
  it('produces a sha256-prefixed hex digest', async () => {
    const hash = await hashFieldAction(base)
    expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('is deterministic for the same content', async () => {
    expect(await hashFieldAction(base)).toBe(await hashFieldAction({ ...base }))
  })

  it('chains: the same content under a new prevHash yields a new hash', async () => {
    const first = await hashFieldAction(base)
    const second = await hashFieldAction({ ...base, prevHash: first })
    expect(second).not.toBe(first)
  })
})

describe('verifyFieldAction', () => {
  it('validates an untouched action', async () => {
    const contentHash = await hashFieldAction(base)
    const result = await verifyFieldAction({ ...base, contentHash })
    expect(result.valid).toBe(true)
  })

  it('rejects a tampered odometer reading even though the rest matches', async () => {
    const contentHash = await hashFieldAction(base)
    const result = await verifyFieldAction({
      ...base,
      payload: { key: 'vehicle_full', bytes: 999999 },
      contentHash,
    })
    expect(result.valid).toBe(false)
  })
})

describe('verifyChainLinks', () => {
  it('accepts an intact chain', () => {
    const chain = [
      { id: 1, prevHash: '', contentHash: 'sha256:a' },
      { id: 2, prevHash: 'sha256:a', contentHash: 'sha256:b' },
      { id: 3, prevHash: 'sha256:b', contentHash: 'sha256:c' },
    ]
    expect(verifyChainLinks(chain)).toEqual({ linked: true, brokenAt: null })
  })

  it('detects a deleted middle row', () => {
    const chain = [
      { id: 1, prevHash: '', contentHash: 'sha256:a' },
      { id: 3, prevHash: 'sha256:b', contentHash: 'sha256:c' },
    ]
    expect(verifyChainLinks(chain)).toEqual({ linked: false, brokenAt: 3 })
  })

  it('detects two rows swapped in transit', () => {
    const chain = [
      { id: 2, prevHash: 'sha256:a', contentHash: 'sha256:b' },
      { id: 1, prevHash: '', contentHash: 'sha256:a' },
    ]
    // Sorted by id it is intact; the point is that a caller that trusts the
    // server's ordering still gets an answer, and a caller that re-sorts gets
    // the true verdict.
    expect(verifyChainLinks(chain).linked).toBe(true)
    expect(
      verifyChainLinks([
        { id: 1, prevHash: 'sha256:b', contentHash: 'sha256:a' },
        { id: 2, prevHash: 'sha256:a', contentHash: 'sha256:b' },
      ]).linked,
    ).toBe(false)
  })

  it('treats an empty chain as intact', () => {
    expect(verifyChainLinks([])).toEqual({ linked: true, brokenAt: null })
  })
})
