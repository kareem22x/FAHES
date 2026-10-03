import 'server-only'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import type { AuditEventRow, InspectionOfferRow, Json } from '@/lib/supabase/database.types'
import { listCustomerInspections, listAllInspections, type InspectionStatus, type StoredInspection } from '@/lib/inspection-store'
import { getUserById, listUsers } from '@/lib/user-store'
import type { AppUser } from '@/types/domain'
import type { ReviewDecision } from '@/lib/admin/labels'

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(`Supabase admin operation failed: ${error.message}`)
}

/* ------------------------------------------------------------------ counts */

type CountFilter = (builder: {
  eq: (column: string, value: string) => unknown
  in: (column: string, values: string[]) => unknown
}) => unknown

/** Counting happens in the database — never by loading rows into memory. */
async function headCount(table: string, filter?: CountFilter) {
  const builder = getSupabaseAdmin().from(table).select('*', { count: 'exact', head: true })
  const target = (filter ? filter(builder as never) : builder) as unknown as PromiseLike<{
    count: number | null
    error: { message: string } | null
  }>
  const resolved = await target
  throwIfError(resolved.error)
  return resolved.count ?? 0
}

export type AdminOverview = {
  users: number
  customers: number
  inspectors: number
  pendingInspectors: number
  admins: number
  inspections: number
  openInspections: number
  activeInspections: number
  completedInspections: number
  cancelledInspections: number
  offers: number
  pendingOffers: number
  reports: number
  media: number
  flaggedInspections: number
}

export async function adminOverview(): Promise<AdminOverview> {
  const [
    users,
    customers,
    inspectors,
    pendingInspectors,
    admins,
    inspections,
    openInspections,
    activeInspections,
    completedInspections,
    cancelledInspections,
    offers,
    pendingOffers,
    reports,
    media,
  ] = await Promise.all([
    headCount('user_profiles'),
    headCount('user_profiles', (q) => q.eq('role', 'customer')),
    headCount('user_profiles', (q) => q.eq('role', 'inspector')),
    headCount('user_profiles', (q) => q.eq('inspector_status', 'pending')),
    headCount('user_profiles', (q) => q.eq('role', 'admin')),
    headCount('inspections'),
    headCount('inspections', (q) => q.eq('status', 'open')),
    headCount('inspections', (q) => q.in('status', ['assigned', 'on_the_way', 'arrived', 'inspecting'])),
    headCount('inspections', (q) => q.eq('status', 'completed')),
    headCount('inspections', (q) => q.eq('status', 'cancelled')),
    headCount('inspection_offers'),
    headCount('inspection_offers', (q) => q.eq('status', 'pending')),
    headCount('inspection_reports'),
    headCount('inspection_media'),
  ])

  const annotations = await listInspectionAnnotations()
  const flaggedInspections = [...annotations.values()].filter((a) => a.decision === 'flagged').length

  return {
    users,
    customers,
    inspectors,
    pendingInspectors,
    admins,
    inspections,
    openInspections,
    activeInspections,
    completedInspections,
    cancelledInspections,
    offers,
    pendingOffers,
    reports,
    media,
    flaggedInspections,
  }
}

/* ------------------------------------------------------------------- trends */

export type TrendPoint = { date: string; users: number; inspections: number }

/**
 * 14-day activity series for the KPI sparklines. Buckets are computed in
 * memory from the timestamp column; at this scale that is cheaper than 14
 * round-trips, and it keeps the query to one per table.
 */
export async function activityTrend(days = 14): Promise<TrendPoint[]> {
  const since = new Date(Date.now() - (days - 1) * 86_400_000)
  since.setHours(0, 0, 0, 0)

  const [usersResult, inspectionsResult] = await Promise.all([
    getSupabaseAdmin().from('user_profiles').select('created_at').gte('created_at', since.toISOString()).limit(5000),
    getSupabaseAdmin().from('inspections').select('created_at').gte('created_at', since.toISOString()).limit(5000),
  ])
  throwIfError(usersResult.error)
  throwIfError(inspectionsResult.error)

  const buckets = new Map<string, TrendPoint>()
  for (let index = 0; index < days; index += 1) {
    const date = new Date(since.getTime() + index * 86_400_000)
    const key = date.toISOString().slice(0, 10)
    buckets.set(key, { date: key, users: 0, inspections: 0 })
  }
  for (const row of usersResult.data ?? []) {
    const bucket = buckets.get(String(row.created_at).slice(0, 10))
    if (bucket) bucket.users += 1
  }
  for (const row of inspectionsResult.data ?? []) {
    const bucket = buckets.get(String(row.created_at).slice(0, 10))
    if (bucket) bucket.inspections += 1
  }
  return [...buckets.values()]
}

/* -------------------------------------------------------------- inspections */

export const inspectionStatusFilters: { value: InspectionStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'الكل' },
  { value: 'open', label: 'بانتظار العروض' },
  { value: 'assigned', label: 'تم اختيار الفاحص' },
  { value: 'on_the_way', label: 'في الطريق' },
  { value: 'arrived', label: 'وصل الموقع' },
  { value: 'inspecting', label: 'جارٍ الفحص' },
  { value: 'completed', label: 'اكتمل' },
  { value: 'cancelled', label: 'ملغي' },
]

export { listAllInspections }
export type { StoredInspection, InspectionStatus }

/* ------------------------------------------------------ admin annotations */

export type InspectionAnnotation = {
  inspectionId: string
  decision: ReviewDecision | null
  note: string
  updatedAt: string
  actorId: string | null
}

/**
 * Review decisions and admin notes are stored as **append-only audit events**
 * rather than as mutable columns.
 *
 * Two reasons: the schema cannot be altered here (no DDL access), and an
 * append-only annotation stream is genuinely better for this use case — it
 * keeps the full history of who changed a decision and when, which a single
 * mutable `notes` column would destroy. The latest event per inspection is the
 * current state.
 */
export async function listInspectionAnnotations(): Promise<Map<string, InspectionAnnotation>> {
  const { data, error } = await getSupabaseAdmin()
    .from('audit_events')
    .select('*')
    .in('event_type', ['admin.inspection_reviewed', 'admin.inspection_flagged', 'admin.inspection_note'])
    .eq('resource_type', 'inspection')
    .order('created_at', { ascending: false })
    .limit(1000)
  throwIfError(error)

  const result = new Map<string, InspectionAnnotation>()
  for (const event of data ?? []) {
    const id = event.resource_id
    if (!id) continue
    const existing = result.get(id)
    const metadata = (event.metadata ?? {}) as Record<string, Json | undefined>
    const decision = metadata.decision
    const note = metadata.note
    // Events are newest-first, so merge: the newest decision and the newest
    // non-empty note each win independently.
    result.set(id, {
      inspectionId: id,
      decision:
        existing?.decision ??
        (decision === 'approved' || decision === 'rejected' || decision === 'flagged' ? decision : null),
      note: existing?.note || (typeof note === 'string' ? note : ''),
      updatedAt: existing?.updatedAt ?? event.created_at,
      actorId: existing?.actorId ?? event.actor_id,
    })
  }
  return result
}

/* -------------------------------------------------------------------- users */

export type UserRow = AppUser & {
  inspectionCount: number
  lastInspectionAt: number | null
}

/** Users plus a per-user inspection count, computed from a single query. */
export async function listUsersWithActivity(): Promise<UserRow[]> {
  const [users, inspections] = await Promise.all([
    listUsers(),
    getSupabaseAdmin().from('inspections').select('customer_id, created_at').limit(5000),
  ])
  throwIfError(inspections.error)

  const counts = new Map<string, { count: number; last: number }>()
  for (const row of inspections.data ?? []) {
    const current = counts.get(row.customer_id) ?? { count: 0, last: 0 }
    current.count += 1
    const at = Date.parse(row.created_at)
    if (!Number.isNaN(at)) current.last = Math.max(current.last, at)
    counts.set(row.customer_id, current)
  }

  return users.map((user) => {
    const stats = counts.get(user.id)
    return {
      ...user,
      inspectionCount: stats?.count ?? 0,
      lastInspectionAt: stats?.last || null,
    }
  })
}

export type UserDetail = {
  user: AppUser
  inspections: StoredInspection[]
  offers: InspectionOfferRow[]
  auditTrail: AuditEventRow[]
}

/**
 * Read-only detail for the "view as" drawer. Deliberately never returns
 * credentials, tokens or anything from the auth provider — only the profile the
 * product itself displays, plus the user's own activity.
 */
export async function getUserDetail(userId: string): Promise<UserDetail | null> {
  const user = await getUserById(userId)
  if (!user) return null

  const [inspections, offersResult, auditResult] = await Promise.all([
    listCustomerInspections(userId),
    getSupabaseAdmin()
      .from('inspection_offers')
      .select('*')
      .eq('inspector_id', userId)
      .order('created_at', { ascending: false })
      .limit(50),
    getSupabaseAdmin()
      .from('audit_events')
      .select('*')
      .eq('resource_id', userId)
      .order('created_at', { ascending: false })
      .limit(50),
  ])
  throwIfError(offersResult.error)
  throwIfError(auditResult.error)

  return {
    user,
    inspections,
    offers: offersResult.data ?? [],
    auditTrail: auditResult.data ?? [],
  }
}

/* -------------------------------------------------------------------- audit */

export type AuditFeedOptions = {
  limit?: number
  eventType?: string
  prefix?: string
  actorId?: string
  resourceId?: string
}

export async function listAuditEvents(options: AuditFeedOptions = {}): Promise<AuditEventRow[]> {
  let query = getSupabaseAdmin().from('audit_events').select('*')
  if (options.eventType) query = query.eq('event_type', options.eventType)
  if (options.prefix) query = query.like('event_type', `${options.prefix}%`)
  if (options.actorId) query = query.eq('actor_id', options.actorId)
  if (options.resourceId) query = query.eq('resource_id', options.resourceId)
  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(options.limit ?? 100, 1), 500))
  throwIfError(error)
  return data ?? []
}

export async function listAuditEventTypes(): Promise<string[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('audit_events')
    .select('event_type')
    .order('created_at', { ascending: false })
    .limit(500)
  throwIfError(error)
  return [...new Set((data ?? []).map((row) => row.event_type))].sort()
}

export async function listAuditActors(): Promise<string[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('audit_events')
    .select('actor_id')
    .not('actor_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(500)
  throwIfError(error)
  return [...new Set((data ?? []).map((row) => row.actor_id).filter((id): id is string => Boolean(id)))]
}
