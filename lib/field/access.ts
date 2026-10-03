import 'server-only'

import { getSession, type AppSession } from '@/lib/auth'
import { isInspectorSession } from '@/lib/field/inspector-access'

/**
 * The request-level half of the inspector-access decision.
 *
 * The rule itself — who counts, and why an owner can never resolve to
 * `'inspector'` — lives in `lib/field/inspector-access.ts`, which is a pure
 * module so the allow/deny matrix stays unit-testable. This file adds the one
 * thing that needs a live request: reading the session.
 */

export { isInspectorSession, type InspectorAccessSubject } from '@/lib/field/inspector-access'

/**
 * Resolve the session, or return `null` if it may not use the inspector surface.
 *
 * Returning `null` rather than throwing keeps every caller's error envelope
 * byte-identical: these routes answer in Arabic JSON with a message and status
 * chosen per surface, and a shared guard has no business overwriting that.
 * Each caller still shapes its own 401/403 body from the `null`.
 */
export async function resolveInspectorSession(): Promise<AppSession | null> {
  const session = await getSession()
  return isInspectorSession(session) ? session : null
}
