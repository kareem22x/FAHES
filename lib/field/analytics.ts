/**
 * Derived field metrics: analytics and the wallet ledger.
 *
 * Both are pure functions over the inspections list. That is a deliberate
 * choice: the numbers an inspector sees about their own earnings and their own
 * completion rate should be reproducible from the same rows the rest of the app
 * already trusts, not from a separate aggregation table that can drift. There
 * is no cache to invalidate and no second source of truth to reconcile.
 *
 * Prices come from the accepted offer when there is one — that is the number
 * the inspector actually agreed to — and fall back to a city-level rate only
 * when the offer was accepted before prices were recorded.
 */

import type {
  AnalyticsPoint,
  AnalyticsRange,
  FieldAnalytics,
  WalletEntry,
  WalletSummary,
} from '@/lib/field/types'

/**
 * The slice of `StoredInspection` these functions need, so tests can build rows
 * by hand.
 *
 * `offers` is optional because the inspector-facing reads strip the offer list
 * (an inspector does not need to see what their colleagues bid) and expose only
 * `myOffer`. The payout therefore resolves the accepted price from `acceptedOffer`
 * when the caller has it, and falls back to the flat rate when it does not.
 */
export type CompletableInspection = {
  id: string
  city: string
  scheduledAt: string
  createdAt: number
  status: string
  vehicle: { make: string; model: string; year: number }
  acceptedOfferId: string | null
  offers?: Array<{ id: string; status: string; price: number }>
  /** The inspector's own accepted offer, when the read has been offer-stripped. */
  acceptedOffer?: { id: string; price: number } | null
}

/** Fallback per-inspection payout when the accepted offer price is unavailable, in SAR. */
const FALLBACK_PRICE_SAR = 150

const ARABIC_DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'] as const

const ARABIC_MONTH_NAMES = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
] as const

/**
 * Start of the ISO week (Sunday) for a given moment, in local time.
 *
 * `getDay()` is used rather than an epoch-day modulus because Saudi Arabia
 * observes no daylight-saving transitions, so weeks are exactly 7×24h and the
 * only thing that matters is aligning to the local Sunday boundary.
 */
function startOfWeek(date: Date): Date {
  const clone = new Date(date)
  clone.setHours(0, 0, 0, 0)
  clone.setDate(clone.getDate() - clone.getDay())
  return clone
}

function startOfDay(date: Date): Date {
  const clone = new Date(date)
  clone.setHours(0, 0, 0, 0)
  return clone
}

/**
 * Bucket completed inspections into the series the analytics panel draws.
 *
 * The buckets are *always* emitted, even when empty — a bar chart that omits
 * zero days reads as "no data" rather than "no work", which is a meaningful
 * difference to an inspector reviewing a quiet week.
 */
function buildSeries(
  inspections: CompletableInspection[],
  range: AnalyticsRange,
): AnalyticsPoint[] {
  const now = new Date()

  if (range === 'week') {
    const weekStart = startOfWeek(now)
    const days: Array<{ start: Date; label: string; completed: number; cancelled: number; minutes: number[] }> = []
    for (let index = 0; index < 7; index += 1) {
      const start = new Date(weekStart)
      start.setDate(start.getDate() + index)
      days.push({ start, label: ARABIC_DAY_NAMES[start.getDay()], completed: 0, cancelled: 0, minutes: [] })
    }

    for (const inspection of inspections) {
      const moment = new Date(inspection.scheduledAt)
      if (Number.isNaN(moment.getTime())) continue
      if (moment < weekStart) continue
      const dayIndex = Math.floor((startOfDay(moment).getTime() - weekStart.getTime()) / 86_400_000)
      const bucket = days[dayIndex]
      if (!bucket) continue
      if (inspection.status === 'completed') bucket.completed += 1
      if (inspection.status === 'cancelled') bucket.cancelled += 1
    }

    return days.map((day) => ({
      label: day.label,
      completed: day.completed,
      cancelled: day.cancelled,
      averageMinutes: day.minutes.length === 0
        ? null
        : Math.round(day.minutes.reduce((total, value) => total + value, 0) / day.minutes.length),
    }))
  }

  // Month range: the last 6 months including the current one, oldest first.
  const months: Array<{ year: number; month: number; completed: number; cancelled: number }> = []
  const cursor = new Date(now.getFullYear(), now.getMonth(), 1)
  cursor.setMonth(cursor.getMonth() - 5)
  for (let index = 0; index < 6; index += 1) {
    months.push({ year: cursor.getFullYear(), month: cursor.getMonth(), completed: 0, cancelled: 0 })
    cursor.setMonth(cursor.getMonth() + 1)
  }
  const first = new Date(months[0].year, months[0].month, 1)

  for (const inspection of inspections) {
    const moment = new Date(inspection.scheduledAt)
    if (Number.isNaN(moment.getTime()) || moment < first) continue
    const bucket = months.find(
      (item) => item.year === moment.getFullYear() && item.month === moment.getMonth(),
    )
    if (!bucket) continue
    if (inspection.status === 'completed') bucket.completed += 1
    if (inspection.status === 'cancelled') bucket.cancelled += 1
  }

  return months.map((month) => ({
    label: ARABIC_MONTH_NAMES[month.month] ?? String(month.month + 1),
    completed: month.completed,
    cancelled: month.cancelled,
    averageMinutes: null,
  }))
}

/** Hours between the moment the order was placed and the hour it was scheduled for. */
function turnaroundMinutes(inspection: CompletableInspection): number | null {
  const scheduled = Date.parse(inspection.scheduledAt)
  if (!Number.isFinite(scheduled) || !Number.isFinite(inspection.createdAt)) return null
  const minutes = Math.round((scheduled - inspection.createdAt) / 60_000)
  // A negative or absurd value means the row was edited after the fact, which
  // should not drag the average around; drop it rather than clamping it to 0.
  if (minutes < 0 || minutes > 60 * 24 * 3) return null
  return minutes
}

/**
 * Field performance for the selected range.
 *
 * `approvalRate` is intentionally nullable: without a rejection signal in the
 * data there is no honest way to compute a rate, and showing 100% for an
 * inspector whose reports have simply never been reviewed would be a lie the
 * leaderboard acts on. Null renders as "—".
 */
export function buildFieldAnalytics(
  inspections: CompletableInspection[],
  range: AnalyticsRange,
): FieldAnalytics {
  const now = new Date()
  const windowStart = range === 'week' ? startOfWeek(now) : new Date(now.getFullYear(), now.getMonth(), 1)

  const inWindow = inspections.filter((inspection) => {
    const moment = new Date(inspection.scheduledAt)
    return !Number.isNaN(moment.getTime()) && moment >= windowStart
  })

  const completed = inWindow.filter((inspection) => inspection.status === 'completed').length
  const cancelled = inWindow.filter((inspection) => inspection.status === 'cancelled').length
  const decided = completed + cancelled
  const completionRate = decided === 0 ? 100 : Math.round((completed / decided) * 100)

  const turnarounds = inspections
    .filter((inspection) => inspection.status === 'completed')
    .map(turnaroundMinutes)
    .filter((value): value is number => value !== null)

  return {
    range,
    completed,
    cancelled,
    completionRate,
    averageTurnaroundMinutes: turnarounds.length === 0
      ? null
      : Math.round(turnarounds.reduce((total, value) => total + value, 0) / turnarounds.length),
    approvalRate: null,
    verifiedInspections: completed,
    series: buildSeries(inspections, range),
  }
}

/**
 * The wallet is a *projection* of completed work, not a stored balance.
 *
 * Every completed inspection produces one entry. Status is derived from age:
 * work finished within the last 48 hours is settling, after that it is
 * available. An inspector can see exactly which job each riyal came from, which
 * is the only way a payout dispute is ever resolved quickly.
 */
const SETTLEMENT_WINDOW_MS = 48 * 60 * 60 * 1000

export function buildWalletFromInspections(inspections: CompletableInspection[]): WalletSummary {
  const now = Date.now()

  const entries: WalletEntry[] = inspections
    .filter((inspection) => inspection.status === 'completed')
    .map((inspection) => {
      const accepted = inspection.offers
        ? inspection.offers.find((offer) => offer.id === inspection.acceptedOfferId) ?? null
        : inspection.acceptedOffer ?? null
      const amount = accepted && Number.isFinite(accepted.price) ? accepted.price : FALLBACK_PRICE_SAR
      const completedMs = Date.parse(inspection.scheduledAt)
      const settled = Number.isFinite(completedMs) && now - completedMs > SETTLEMENT_WINDOW_MS
      return {
        id: inspection.id,
        inspectionId: inspection.id,
        vehicleLabel: `${inspection.vehicle.make} ${inspection.vehicle.model} ${inspection.vehicle.year}`,
        amount,
        status: settled ? ('available' as const) : ('pending' as const),
        completedAt: inspection.scheduledAt,
      }
    })
    .sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt))

  const sum = (status: WalletEntry['status']) =>
    entries.filter((entry) => entry.status === status).reduce((total, entry) => total + entry.amount, 0)

  const availableBalance = sum('available')
  const pendingBalance = sum('pending')
  const requestedBalance = sum('requested')

  return {
    netBalance: availableBalance + pendingBalance + requestedBalance,
    availableBalance,
    pendingBalance,
    requestedBalance,
    lifetimeTotal: entries.reduce((total, entry) => total + entry.amount, 0),
    entries,
    lastPayoutRequestAt: null,
  }
}

/** A stable, human-checkable reference for a payout request. */
export function payoutReference(inspectorId: string, requestedAt: string): string {
  const compact = requestedAt.replace(/[^0-9]/g, '').slice(0, 14)
  const suffix = inspectorId.replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase() || 'FAHS'
  return `PO-${compact}-${suffix}`
}
