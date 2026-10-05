/**
 * Coarse, human-readable durations in Arabic.
 *
 * ── Why this lives in `lib/` and not next to the component ─────────────────
 *
 * Two reasons, both about correctness rather than tidiness.
 *
 * First, hydration. A component that calls `Date.now()` while rendering
 * produces one string on the server and a slightly different one in the
 * browser; if the two land on opposite sides of a boundary ("أقل من يوم" vs
 * "يوم واحد") React reports a hydration mismatch and re-renders the subtree.
 * So the *caller* passes `now` explicitly — the server computes the label once
 * and ships a plain string.
 *
 * Second, testability. `lib/**` is the only tree the node test runner covers
 * (`vitest.config.mjs`), and boundary logic like "30 days is a month" is
 * exactly what a test should pin down.
 *
 * ── Why the granularity is coarse ──────────────────────────────────────────
 *
 * These labels answer "is this a brand-new account or a long-standing one?" and
 * "when did they last show up?". Days, then months, then years is enough to
 * answer both; an exact day count has never changed the reply to a ticket, and
 * it would go stale in the tab anyway.
 */

const DAY_MS = 86_400_000

function plural(count: number, one: string, few: string, many: string) {
  // Arabic pluralisation: 1 singular, 2 dual, 3–10 plural, 11+ singular again.
  if (count === 1) return one
  if (count === 2) return few
  if (count >= 3 && count <= 10) return many
  return one
}

/**
 * How long ago `from` was, as of `now`. Never negative: a clock skew or a row
 * written with a future timestamp reads as "الآن" rather than "-3 يوم".
 */
export function describeAge(from: number, now: number): string {
  const elapsed = now - from
  if (!Number.isFinite(elapsed) || elapsed < 0) return 'الآن'

  const days = Math.floor(elapsed / DAY_MS)
  if (days < 1) return 'أقل من يوم'
  if (days < 30) return `${days} ${plural(days, 'يوم', 'يومان', 'أيام')}`

  // The year boundary is 365 days, not "twelve thirty-day months" (360).
  //
  // Deriving the year from `months < 12` put the seam in the wrong place: a
  // 360-day-old account was announced as a year old, while a 350-day-old one
  // read "11 أشهر" — so the label jumped by a month and overstated the age for
  // five days of every year. Counting days directly keeps both readings honest.
  if (days < 365) {
    const months = Math.floor(days / 30)
    return `${months} ${plural(months, 'شهر', 'شهران', 'أشهر')}`
  }

  const years = Math.floor(days / 365)
  const remainderMonths = Math.floor((days % 365) / 30)
  const yearsLabel = `${years} ${plural(years, 'سنة', 'سنتان', 'سنوات')}`
  if (remainderMonths === 0) return yearsLabel
  return `${yearsLabel} و${remainderMonths} ${plural(remainderMonths, 'شهر', 'شهران', 'أشهر')}`
}

/**
 * Account age as a phrase, or `null` when the row has no creation timestamp
 * (a hand-seeded or migrated account). Returning `null` rather than a guess
 * lets the caller omit the row instead of printing "منذ ٥٥ سنة" for epoch 0.
 *
 * `now` is optional and defaults here rather than at the call site: a React
 * component that reads the clock while rendering trips the purity lint rule,
 * and more importantly the value must be resolved **once** — the server renders
 * the string and ships it, so the browser never recomputes it. Tests pass an
 * explicit `now` to stay deterministic.
 */
export function formatAccountAge(
  createdAt: number | null | undefined,
  now: number = Date.now(),
): string | null {
  if (typeof createdAt !== 'number' || !Number.isFinite(createdAt) || createdAt <= 0) return null
  return describeAge(createdAt, now)
}

/**
 * Last-seen as a phrase. Distinct from `formatAccountAge` because a missing
 * `lastLoginAt` is common and meaningful — it means the account has never
 * signed in since the column was added, which is worth saying out loud rather
 * than hiding.
 */
export function formatLastSeen(
  lastLoginAt: number | null | undefined,
  now: number = Date.now(),
): string {
  if (typeof lastLoginAt !== 'number' || !Number.isFinite(lastLoginAt) || lastLoginAt <= 0) {
    return 'لا يوجد تسجيل دخول مسجّل'
  }
  return describeAge(lastLoginAt, now)
}
