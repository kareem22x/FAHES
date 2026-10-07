/**
 * What an inspector's presence status should say.
 *
 * The map's colour, the console's "يفحص الآن" count and the roster's badges all
 * read from this one decision, so it is made once, here, rather than being
 * re-derived from the claim list in each place that wants it. Getting it wrong is
 * invisible: `available` and `inspecting` differ by one enum member and both
 * render as a working map.
 *
 * ── Why the status is derived rather than stored ───────────────────────────
 * The obvious alternative is a column the inspector sets by hand. It drifts the
 * moment someone forgets to flip it back after a job, and a stale "يفحص الآن"
 * badge is worse than no badge — it tells an operator that work is happening when
 * nobody is on shift. Claim state is already the truth; this just reads it.
 */

/** The vocabulary `inspector_locations.status` accepts. */
export type FieldPresenceStatus = 'available' | 'en_route' | 'inspecting' | 'offline'

/** The part of a claim this decision needs. `FieldOrderWithClaim` satisfies it. */
type ClaimLike = { status: string } | null

/**
 * Claims that mean the inspector is working, most specific first.
 *
 * `handed_over` and `cancelled` are deliberately absent: both are endings, and an
 * inspector whose only claim was cancelled is back on the market.
 */
const WORKING_CLAIM_STATUSES: Record<string, FieldPresenceStatus> = {
  in_progress: 'inspecting',
  // Claimed but not yet started — the inspector is on their way to the vehicle.
  claimed: 'en_route',
}

export function deriveFieldStatus(
  orders: ReadonlyArray<{ claim: ClaimLike }>,
  isOnline: boolean,
): FieldPresenceStatus {
  let verdict: FieldPresenceStatus | null = null

  for (const order of orders) {
    const status = order.claim ? WORKING_CLAIM_STATUSES[order.claim.status] : undefined
    if (status === 'inspecting') return 'inspecting'
    if (status === 'en_route') verdict = 'en_route'
  }

  if (verdict) return verdict
  return isOnline ? 'available' : 'offline'
}
