import type { AppUser, InspectorApplicationRow, InspectorStatus } from '@/types/domain'

/**
 * Who appears in the inspector roster, and why.
 *
 * `/admin/inspectors` answers one question: *who is an inspector*. It used to
 * answer it with `inspectorStatus !== 'none' || role === 'inspector'`, and that
 * one line produced the worst possible page — a roster whose only row could
 * never be acted on.
 *
 * The row was the platform owner. `getSession()` resolves a role as
 * `isAdmin ? … : inspectorStatus === 'approved' ? 'inspector' : 'customer'`, so
 * an owner is always `role = 'admin'` — but migration 11 also sets
 * `inspector_status = 'approved'` on that same account, because that field is
 * what opens the owner's inspector surface. The roster filter therefore matched
 * them, and every button on the row was refused: `setInspectorStatus` filters
 * `.neq('role', 'admin')` on purpose, to stop an inspector decision from
 * demoting an admin. The operator saw «المستخدم غير موجود أو محمي» for
 * اعتماد, رفض and إيقاف alike, on the only row on the page.
 *
 * Two exclusions fix it, and each is a rule rather than a patch:
 *
 *   • `role === 'admin'` — an admin is not an inspector. Standing in the
 *     inspector *surface* is a view the owner switches into; it is not a
 *     membership, and it must not invent a roster entry that no action can
 *     reach. This is also what keeps the `.neq('role', 'admin')` guard honest:
 *     a rule that refuses an action should not be shown a row it refuses.
 *
 *   • `pending` — an applicant waiting for a decision is not yet an inspector.
 *     That question now has its own page (`/admin/inspector-applications`), and
 *     listing the same person in both places is how two pages end up
 *     disagreeing about the same account.
 *
 * Extracted from the page so the rule is testable: `vitest.config.mjs` pins
 * `include: ['lib/**\/*.test.ts']`, so logic left inside a page component is
 * logic nothing can reach. Every admin page is `force-dynamic` and therefore
 * never prerendered, which means a wrong roster is invisible to `tsc`, `eslint`
 * and `next build`.
 */

/** Statuses that mean a decision has been taken. `pending` and `none` are not. */
export const DECIDED_INSPECTOR_STATUSES: readonly InspectorStatus[] = ['approved', 'rejected', 'suspended']

/** One row of the roster, flattened from an account plus its application. */
export type InspectorRosterRow = {
  id: string
  name: string
  phone: string | null
  role: string
  inspectorStatus: InspectorStatus
  experienceYears: number | null
  availability: string | null
  cities: string[]
  specialties: string[]
  qualification: string | null
  hasEquipment: boolean | null
  notes: string | null
  hasApplication: boolean
}

/** True when this account belongs on the roster. */
export function isRosterMember(user: AppUser): boolean {
  if (user.role === 'admin') return false
  return DECIDED_INSPECTOR_STATUSES.includes(user.inspectorStatus) || user.role === 'inspector'
}

/**
 * The roster, newest account first — the order `listUsers()` already returns.
 *
 * Application fields fall back to the inspector profile and then to empty, so a
 * decided account whose application row was never written still renders: the
 * decision is what put them on the roster, not the paperwork.
 */
export function buildInspectorRoster(
  users: AppUser[],
  applications: InspectorApplicationRow[],
): InspectorRosterRow[] {
  const applicationByUser = new Map(applications.map((application) => [application.user_id, application]))

  return users.filter(isRosterMember).map((user) => {
    const application = applicationByUser.get(user.id)
    return {
      id: user.id,
      name: user.name,
      phone: user.phone,
      role: user.role,
      inspectorStatus: user.inspectorStatus,
      experienceYears: application ? application.experience_years : null,
      availability: application?.availability ?? null,
      cities: application?.cities ?? user.inspectorProfile?.cities ?? [],
      specialties: application?.specialties ?? [],
      qualification: application?.qualification ?? null,
      hasEquipment: application ? application.has_equipment : null,
      notes: application?.notes ?? null,
      hasApplication: Boolean(application),
    }
  })
}
