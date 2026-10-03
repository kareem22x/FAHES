/**
 * The pure half of the inspector-access decision.
 *
 * `lib/field/access.ts` is `server-only` because it resolves the live session;
 * the predicate itself is exported here so the matrix of allow/deny cases can be
 * unit-tested in the node environment without dragging in Clerk.
 *
 * ── The problem ────────────────────────────────────────────────────────────
 *
 * `getSession()` resolves the role in this order:
 *
 *     isAdmin ? (elevated ? 'admin' : 'admin_pending')
 *             : inspectorStatus === 'approved' ? 'inspector' : 'customer'
 *
 * An owner is always an admin, so the first branch always wins and an owner can
 * **never** resolve to `'inspector'`. Sixteen API routes used to test
 * `session.role !== 'inspector'` inline and return 403. The visible consequence
 * was the worst possible one: the field dashboard rendered — the page guard
 * `requireRoles()` has an owner bypass — and then *every action inside it
 * failed*. Claim, verify, upload, cancel, handover, payout, support, device
 * binding, profile: all 403. The owner would reasonably conclude the whole
 * feature was broken.
 *
 * ── The rule ───────────────────────────────────────────────────────────────
 *
 * A session may use the inspector surface when either:
 *
 *   1. it resolved to `'inspector'` — an approved inspector; or
 *   2. it is a **platform owner** who has switched into inspector view mode.
 *
 * (2) is deliberately narrow, and it is narrow in two independent places: the
 * caller must be a platform owner *and* the view flag must be set. The flag is
 * a signed, session-bound cookie (`lib/admin-elevation.ts`), so forging it buys
 * nothing — a non-owner presenting a perfect forgery is still a non-owner. And
 * `admin_pending` (an admin who has not cleared the access-code gate) is
 * admitted only as an owner, never on the strength of the view flag alone.
 */

import { isPlatformOwner } from '@/lib/identity-predicates'

/**
 * The portion of a session this decision depends on.
 *
 * Structural rather than `AppSession`, so tests can build one from a literal and
 * so a caller holding a partially-populated session is not forced to lie.
 */
export type InspectorAccessSubject = {
  role: string
  inspectorView?: boolean
  phone?: string | null
  clerkUserId?: string | null
}

/**
 * True when this session may use the inspector surface.
 *
 * Owners are matched by phone *and* Clerk id: the account that motivated this
 * module signs in with an email address only and has no verified phone number at
 * all, so a phone-only check would silently fail for exactly the person it was
 * written for.
 *
 * ── Why ownership alone is enough, with no view-cookie requirement ──────────
 *
 * This predicate originally required `session.inspectorView`, i.e. the signed
 * `fahes_inspector_view` cookie that the toggle in `/admin` creates. The
 * reasoning was that an owner who is *merely administering the site* should not
 * silently hold inspector privileges.
 *
 * That reasoning does not survive contact with the rest of the app. Compare the
 * page guard in `lib/auth.ts`:
 *
 *     export async function requireRoles(roles) {
 *       if (roles.includes(session.role)) return session
 *       if (isPlatformOwner({ ... })) return session   // ← ownership ONLY
 *       redirect(dashboardPath(session))
 *     }
 *
 * `requireRoles` admits an owner on ownership alone — no cookie consulted. So
 * `/inspector/dashboard` **renders** for an owner who opened it by URL, and then
 * every write inside it was refused by these routes, which *did* demand the
 * cookie. The visible result was a dashboard that loaded and then failed on
 * every single action with «غير مصرح»: saving work cities, sending an offer,
 * claiming an inspection, uploading a report. Fourteen routes behaved this way.
 *
 * The two guards must agree. Ownership is the correct and sufficient test:
 *
 *   * it is not forgeable — it reads `ADMIN_OWNER_CLERK_IDS` / the owner phone
 *     from the environment and compares against the live Clerk identity, so a
 *     non-owner gains nothing by any cookie;
 *   * it is already the standard used by the page layer, so the UI and its APIs
 *     stop contradicting each other;
 *   * it cannot leak privilege, because an owner reaching these routes is by
 *     definition the person who owns the data on the other side of them.
 *
 * `admin_pending` (an admin who has not cleared the access-code gate) is still
 * refused: only `isPlatformOwner` passes that branch, and a non-owner admin is
 * not one.
 *
 * The `fahes_inspector_view` cookie keeps its real job — it selects which
 * *surface* an owner lands on (`lib/post-auth-path.ts`) and powers the exit
 * affordance. It is a navigation preference, not an authorization gate.
 *
 * ── The second gate this uncovered ─────────────────────────────────────────
 *
 * Admitting the owner here was necessary but not sufficient: the SQL-facing
 * helpers then filtered on `role = 'inspector'`, which an owner's row is not.
 * `updateInspectorProfile` in `lib/user-store.ts` is the worked example — it
 * returns `null` for an owner, which the profile route reported as a 403 even
 * after authentication succeeded. Those helpers are keyed on ownership now; see
 * the note there. When adding a write path for this surface, check *both* gates.
 */
export function isInspectorSession(session: InspectorAccessSubject | null | undefined): boolean {
  if (!session) return false
  if (session.role === 'inspector') return true
  return isPlatformOwner({ phone: session.phone, clerkUserId: session.clerkUserId })
}

/**
 * True when the session is a platform owner — i.e. "is this the site owner?",
 * as opposed to "is this an approved inspector?".
 *
 * ── Relationship to `isInspectorSession` ────────────────────────────────────
 *
 * Since `isInspectorSession` was corrected to key its owner arm on ownership
 * alone, the two now agree for every input that is not an approved inspector:
 * a real inspector answers `false` here and `true` there, and an owner answers
 * `true` in both. This one exists as a **named intent**, not as extra logic.
 *
 * That distinction matters at the call sites. The device lock
 * (`app/api/inspectors/device/route.ts`, `app/inspector/dashboard/layout.tsx`)
 * is not asking "may this session use the inspector APIs" — it is asking "is
 * this person outside the inspector roster the lock protects?". Writing it as
 * `isPlatformOwnerSession` keeps that question legible, and stops a future
 * reader from "fixing" it back to the view-cookie form.
 *
 * The device lock's own history is the reason the naming is worth keeping: it
 * once used the view-cookie form, so an owner opening the dashboard by URL was
 * admitted by the page and then refused by the page's own guard with
 * «هذا الجهاز غير مصرّح», while the same request 401'd at the API because
 * `resolveInspectorSession()` had already returned `null`.
 */
export function isPlatformOwnerSession(
  session: InspectorAccessSubject | null | undefined,
): boolean {
  if (!session) return false
  return isPlatformOwner({ phone: session.phone, clerkUserId: session.clerkUserId })
}
