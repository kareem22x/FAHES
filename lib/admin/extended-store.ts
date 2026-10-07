import 'server-only'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { isMissingRelationError } from '@/lib/supabase/server'
import type { Json } from '@/lib/supabase/database.types'

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(`Supabase admin operation failed: ${error.message}`)
}

/* ──────────────────────────────────────────────────────────────────────
 * Inspector Live Locations (Module 1, 4, 18) — GPS tracking
 * ────────────────────────────────────────────────────────────────────── */

export type InspectorLocation = {
  id: string
  inspector_id: string
  inspector_name?: string
  inspector_phone?: string
  latitude: number
  longitude: number
  heading: number
  speed: number
  status: 'available' | 'en_route' | 'inspecting' | 'offline'
  battery_level: number | null
  is_mock_location: boolean
  accuracy_m: number | null
  recorded_at: string
  updated_at: string
}

export async function listInspectorLocations(): Promise<{
  locations: InspectorLocation[]
  migrationPending: boolean
}> {
  const { data, error } = await getSupabaseAdmin()
    .from('inspector_locations')
    .select('*, inspector:inspector_id(name, phone)')
    .order('updated_at', { ascending: false })
    .limit(200)

  if (isMissingRelationError(error)) return { locations: [], migrationPending: true }
  throwIfError(error)

  const locations = (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    inspector_id: row.inspector_id as string,
    inspector_name: (row.inspector as { name?: string } | null)?.name ?? 'فاحص',
    inspector_phone: (row.inspector as { phone?: string } | null)?.phone ?? '',
    latitude: row.latitude as number,
    longitude: row.longitude as number,
    heading: (row.heading as number) ?? 0,
    speed: (row.speed as number) ?? 0,
    status: (row.status as InspectorLocation['status']) ?? 'offline',
    battery_level: (row.battery_level as number | null) ?? null,
    is_mock_location: (row.is_mock_location as boolean) ?? false,
    accuracy_m: (row.accuracy_m as number | null) ?? null,
    recorded_at: row.recorded_at as string,
    updated_at: row.updated_at as string,
  }))

  return { locations, migrationPending: false }
}

/* ──────────────────────────────────────────────────────────────────────
 * Inspector Violations (Module 9) — violation log with classifications
 * ────────────────────────────────────────────────────────────────────── */

export type InspectorViolation = {
  id: string
  inspector_id: string
  inspector_name?: string
  inspection_id: string | null
  violation_type: 'fake_gps' | 'tardiness' | 'unexcused_cancel' | 'zone_breach' | 'speed_anomaly' | 'photo_tamper'
  severity: 'low' | 'medium' | 'high' | 'critical'
  details: Json
  auto_detected: boolean
  resolved: boolean
  resolution_note: string
  created_at: string
  resolved_at: string | null
}

export async function listInspectorViolations(filter?: {
  resolved?: boolean
  severity?: string
  violationType?: string
}): Promise<{ violations: InspectorViolation[]; migrationPending: boolean }> {
  let query = getSupabaseAdmin()
    .from('inspector_violations')
    .select('*, inspector:inspector_id(name, phone)')
    .order('created_at', { ascending: false })
    .limit(300)

  if (filter?.resolved !== undefined) query = query.eq('resolved', filter.resolved)
  if (filter?.severity) query = query.eq('severity', filter.severity)
  if (filter?.violationType) query = query.eq('violation_type', filter.violationType)

  const { data, error } = await query

  if (isMissingRelationError(error)) return { violations: [], migrationPending: true }
  throwIfError(error)

  const violations = (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    inspector_id: row.inspector_id as string,
    inspector_name: (row.inspector as { name?: string } | null)?.name ?? 'فاحص',
    inspection_id: (row.inspection_id as string | null) ?? null,
    violation_type: row.violation_type as InspectorViolation['violation_type'],
    severity: (row.severity as InspectorViolation['severity']) ?? 'medium',
    details: (row.details as Json) ?? {},
    auto_detected: (row.auto_detected as boolean) ?? true,
    resolved: (row.resolved as boolean) ?? false,
    resolution_note: (row.resolution_note as string) ?? '',
    created_at: row.created_at as string,
    resolved_at: (row.resolved_at as string | null) ?? null,
  }))

  return { violations, migrationPending: false }
}

/* ──────────────────────────────────────────────────────────────────────
 * Disputes (Module 15) — disputes & refunds
 * ────────────────────────────────────────────────────────────────────── */

export type Dispute = {
  id: string
  inspection_id: string
  client_id: string
  client_name?: string
  reason: string
  status: 'open' | 'under_review' | 'approved' | 'rejected' | 'resolved'
  refund_amount: number
  evidence_urls: string[]
  resolution_note: string
  created_at: string
  resolved_at: string | null
  resolved_by: string | null
}

export async function listDisputes(filter?: {
  status?: string
}): Promise<{ disputes: Dispute[]; migrationPending: boolean }> {
  let query = getSupabaseAdmin()
    .from('disputes')
    .select('*, client:client_id(name)')
    .order('created_at', { ascending: false })
    .limit(200)

  if (filter?.status) query = query.eq('status', filter.status)

  const { data, error } = await query

  if (isMissingRelationError(error)) return { disputes: [], migrationPending: true }
  throwIfError(error)

  const disputes = (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    inspection_id: row.inspection_id as string,
    client_id: row.client_id as string,
    client_name: (row.client as { name?: string } | null)?.name ?? 'عميل',
    reason: row.reason as string,
    status: (row.status as Dispute['status']) ?? 'open',
    refund_amount: Number(row.refund_amount ?? 0),
    evidence_urls: (row.evidence_urls as string[]) ?? [],
    resolution_note: (row.resolution_note as string) ?? '',
    created_at: row.created_at as string,
    resolved_at: (row.resolved_at as string | null) ?? null,
    resolved_by: (row.resolved_by as string | null) ?? null,
  }))

  return { disputes, migrationPending: false }
}

/* ──────────────────────────────────────────────────────────────────────
 * Quality Review Audits (Module 8) — quality review queue
 * ────────────────────────────────────────────────────────────────────── */

export type InspectionAudit = {
  id: string
  inspection_id: string
  auditor_id: string | null
  auditor_name?: string
  status: 'pending' | 'passed' | 'flagged_for_fix' | 'rejected'
  audit_notes: string
  flagged_categories: string[]
  created_at: string
  completed_at: string | null
}

export async function listInspectionAudits(filter?: {
  status?: string
}): Promise<{ audits: InspectionAudit[]; migrationPending: boolean }> {
  let query = getSupabaseAdmin()
    .from('inspection_audits')
    .select('*, auditor:auditor_id(name)')
    .order('created_at', { ascending: false })
    .limit(200)

  if (filter?.status) query = query.eq('status', filter.status)

  const { data, error } = await query

  if (isMissingRelationError(error)) return { audits: [], migrationPending: true }
  throwIfError(error)

  const audits = (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    inspection_id: row.inspection_id as string,
    auditor_id: (row.auditor_id as string | null) ?? null,
    auditor_name: (row.auditor as { name?: string } | null)?.name ?? '',
    status: (row.status as InspectionAudit['status']) ?? 'pending',
    audit_notes: (row.audit_notes as string) ?? '',
    flagged_categories: (row.flagged_categories as string[]) ?? [],
    created_at: row.created_at as string,
    completed_at: (row.completed_at as string | null) ?? null,
  }))

  return { audits, migrationPending: false }
}

/* ──────────────────────────────────────────────────────────────────────
 * System Settings (Module 37) — settings & kill switch
 * ────────────────────────────────────────────────────────────────────── */

export type SystemSetting = {
  key: string
  value: Json
  description: string
  updated_at: string
  updated_by: string | null
}

export async function listSystemSettings(): Promise<{
  settings: SystemSetting[]
  migrationPending: boolean
}> {
  const { data, error } = await getSupabaseAdmin()
    .from('system_settings')
    .select('*')
    .order('key', { ascending: true })

  if (isMissingRelationError(error)) return { settings: [], migrationPending: true }
  throwIfError(error)

  const settings = (data ?? []).map((row: Record<string, unknown>) => ({
    key: row.key as string,
    value: (row.value as Json) ?? {},
    description: (row.description as string) ?? '',
    updated_at: row.updated_at as string,
    updated_by: (row.updated_by as string | null) ?? null,
  }))

  return { settings, migrationPending: false }
}

/* ──────────────────────────────────────────────────────────────────────
 * Broadcast Announcements (Module 27) — targeted announcements
 * ────────────────────────────────────────────────────────────────────── */

export type BroadcastAnnouncement = {
  id: string
  title: string
  body: string
  target_cities: string[]
  priority: 'low' | 'normal' | 'high' | 'emergency'
  is_active: boolean
  expires_at: string | null
  created_by: string
  created_at: string
}

export async function listBroadcasts(): Promise<{
  broadcasts: BroadcastAnnouncement[]
  migrationPending: boolean
}> {
  const { data, error } = await getSupabaseAdmin()
    .from('broadcast_announcements')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  if (isMissingRelationError(error)) return { broadcasts: [], migrationPending: true }
  throwIfError(error)

  const broadcasts = (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    title: row.title as string,
    body: row.body as string,
    target_cities: (row.target_cities as string[]) ?? [],
    priority: (row.priority as BroadcastAnnouncement['priority']) ?? 'normal',
    is_active: (row.is_active as boolean) ?? true,
    expires_at: (row.expires_at as string | null) ?? null,
    created_by: row.created_by as string,
    created_at: row.created_at as string,
  }))

  return { broadcasts, migrationPending: false }
}

/* ──────────────────────────────────────────────────────────────────────
 * Pricing Rules (Module 13) — dynamic pricing
 * ────────────────────────────────────────────────────────────────────── */

export type PricingRule = {
  id: string
  city: string | null
  vehicle_tier: string | null
  peak_hour_start: string | null
  peak_hour_end: string | null
  surge_multiplier: number
  flat_adjustment: number
  is_active: boolean
  priority: number
  created_at: string
}

export async function listPricingRules(): Promise<{
  rules: PricingRule[]
  migrationPending: boolean
}> {
  const { data, error } = await getSupabaseAdmin()
    .from('pricing_rules')
    .select('*')
    .order('priority', { ascending: false })
    .limit(100)

  if (isMissingRelationError(error)) return { rules: [], migrationPending: true }
  throwIfError(error)

  const rules = (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    city: (row.city as string | null) ?? null,
    vehicle_tier: (row.vehicle_tier as string | null) ?? null,
    peak_hour_start: (row.peak_hour_start as string | null) ?? null,
    peak_hour_end: (row.peak_hour_end as string | null) ?? null,
    surge_multiplier: Number(row.surge_multiplier ?? 1),
    flat_adjustment: Number(row.flat_adjustment ?? 0),
    is_active: (row.is_active as boolean) ?? true,
    priority: (row.priority as number) ?? 0,
    created_at: row.created_at as string,
  }))

  return { rules, migrationPending: false }
}

/* ──────────────────────────────────────────────────────────────────────
 * Showrooms (Module 5) — partner showroom network
 * ────────────────────────────────────────────────────────────────────── */

export type Showroom = {
  id: string
  name: string
  city: string
  district: string
  address: string
  phone: string | null
  contact_person: string | null
  total_inspections: number
  avg_turnaround_hours: number | null
  is_partner: boolean
  is_active: boolean
  created_at: string
}

export async function listShowrooms(): Promise<{
  showrooms: Showroom[]
  migrationPending: boolean
}> {
  const { data, error } = await getSupabaseAdmin()
    .from('showrooms')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)

  if (isMissingRelationError(error)) return { showrooms: [], migrationPending: true }
  throwIfError(error)

  const showrooms = (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    name: row.name as string,
    city: row.city as string,
    district: (row.district as string) ?? '',
    address: (row.address as string) ?? '',
    phone: (row.phone as string | null) ?? null,
    contact_person: (row.contact_person as string | null) ?? null,
    total_inspections: (row.total_inspections as number) ?? 0,
    avg_turnaround_hours: (row.avg_turnaround_hours as number | null) ?? null,
    is_partner: (row.is_partner as boolean) ?? false,
    is_active: (row.is_active as boolean) ?? true,
    created_at: row.created_at as string,
  }))

  return { showrooms, migrationPending: false }
}

/* ──────────────────────────────────────────────────────────────────────
 * Inspector Stats (Module 7) — aggregated performance stats
 * ────────────────────────────────────────────────────────────────────── */

export type InspectorStat = {
  inspector_id: string
  inspector_name?: string
  total_inspections: number
  completed_count: number
  cancelled_count: number
  avg_duration_minutes: number | null
  avg_rating: number | null
  accuracy_score: number
  violation_count: number
  total_earnings: number
  last_inspection_at: string | null
  updated_at: string
}

export async function listInspectorStats(): Promise<{
  stats: InspectorStat[]
  migrationPending: boolean
}> {
  const { data, error } = await getSupabaseAdmin()
    .from('inspector_stats')
    .select('*, inspector:inspector_id(name, phone)')
    .order('total_inspections', { ascending: false })
    .limit(200)

  if (isMissingRelationError(error)) return { stats: [], migrationPending: true }
  throwIfError(error)

  const stats = (data ?? []).map((row: Record<string, unknown>) => ({
    inspector_id: row.inspector_id as string,
    inspector_name: (row.inspector as { name?: string } | null)?.name ?? 'فاحص',
    total_inspections: (row.total_inspections as number) ?? 0,
    completed_count: (row.completed_count as number) ?? 0,
    cancelled_count: (row.cancelled_count as number) ?? 0,
    avg_duration_minutes: (row.avg_duration_minutes as number | null) ?? null,
    avg_rating: (row.avg_rating as number | null) ?? null,
    accuracy_score: Number(row.accuracy_score ?? 100),
    violation_count: (row.violation_count as number) ?? 0,
    total_earnings: Number(row.total_earnings ?? 0),
    last_inspection_at: (row.last_inspection_at as string | null) ?? null,
    updated_at: row.updated_at as string,
  }))

  return { stats, migrationPending: false }
}

/* ──────────────────────────────────────────────────────────────────────
 * Geofence Zones (Module 2, 13) — geographic zone management
 * ────────────────────────────────────────────────────────────────────── */

export type GeofenceZone = {
  id: string
  city_name: string
  zone_name: string
  boundary_polygon: Json
  base_price: number
  is_active: boolean
  created_at: string
}

export async function listGeofenceZones(): Promise<{
  zones: GeofenceZone[]
  migrationPending: boolean
}> {
  const { data, error } = await getSupabaseAdmin()
    .from('geofence_zones')
    .select('*')
    .order('city_name', { ascending: true })
    .limit(100)

  if (isMissingRelationError(error)) return { zones: [], migrationPending: true }
  throwIfError(error)

  const zones = (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    city_name: row.city_name as string,
    zone_name: row.zone_name as string,
    boundary_polygon: (row.boundary_polygon as Json) ?? {},
    base_price: Number(row.base_price ?? 250),
    is_active: (row.is_active as boolean) ?? true,
    created_at: row.created_at as string,
  }))

  return { zones, migrationPending: false }
}

/* ──────────────────────────────────────────────────────────────────────
 * Inspection Templates (Module 28) — no-code form templates
 * ────────────────────────────────────────────────────────────────────── */

export type InspectionTemplate = {
  id: string
  name: string
  version: number
  schema: Json
  is_active: boolean
  created_at: string
  updated_at: string
}

export async function listInspectionTemplates(): Promise<{
  templates: InspectionTemplate[]
  migrationPending: boolean
}> {
  const { data, error } = await getSupabaseAdmin()
    .from('inspection_templates')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(100)

  if (isMissingRelationError(error)) return { templates: [], migrationPending: true }
  throwIfError(error)

  const templates = (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    name: row.name as string,
    version: (row.version as number) ?? 1,
    schema: (row.schema as Json) ?? {},
    is_active: (row.is_active as boolean) ?? true,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }))

  return { templates, migrationPending: false }
}

/* ──────────────────────────────────────────────────────────────────────
 * AI Photo Analyses (Module 31) — photo analysis results
 * ────────────────────────────────────────────────────────────────────── */

export type AiPhotoAnalysis = {
  id: string
  media_id: string | null
  inspection_id: string | null
  clarity_score: number | null
  blur_detected: boolean
  angle_ok: boolean
  issues: string[]
  ocr_plate_text: string | null
  ocr_vin_text: string | null
  model_version: string
  created_at: string
}

export async function listAiPhotoAnalyses(limit = 100): Promise<{
  analyses: AiPhotoAnalysis[]
  migrationPending: boolean
}> {
  const { data, error } = await getSupabaseAdmin()
    .from('ai_photo_analyses')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (isMissingRelationError(error)) return { analyses: [], migrationPending: true }
  throwIfError(error)

  const analyses = (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    media_id: (row.media_id as string | null) ?? null,
    inspection_id: (row.inspection_id as string | null) ?? null,
    clarity_score: (row.clarity_score as number | null) ?? null,
    blur_detected: (row.blur_detected as boolean) ?? false,
    angle_ok: (row.angle_ok as boolean) ?? true,
    issues: (row.issues as string[]) ?? [],
    ocr_plate_text: (row.ocr_plate_text as string | null) ?? null,
    ocr_vin_text: (row.ocr_vin_text as string | null) ?? null,
    model_version: (row.model_version as string) ?? '',
    created_at: row.created_at as string,
  }))

  return { analyses, migrationPending: false }
}

/* ──────────────────────────────────────────────────────────────────────
 * Support Tickets (existing table — inspector_support_tickets)
 * ────────────────────────────────────────────────────────────────────── */

export type SupportTicket = {
  id: string
  inspector_id: string
  inspector_name?: string
  inspector_phone?: string
  inspection_id: string | null
  claim_id: string | null
  category: 'technical' | 'showroom_dispute' | 'location_mismatch' | 'payment' | 'safety' | 'account' | 'other'
  subject: string
  body: string
  status: 'open' | 'in_review' | 'resolved' | 'closed'
  priority: 'low' | 'normal' | 'high' | 'urgent'
  latitude: number | null
  longitude: number | null
  created_at: string
  updated_at: string
  resolved_at: string | null
  resolution_note: string
}

export async function listSupportTickets(filter?: {
  status?: string
  category?: string
  priority?: string
}): Promise<SupportTicket[]> {
  let query = getSupabaseAdmin()
    .from('inspector_support_tickets')
    .select('*, inspector:inspector_id(name, phone)')
    .order('created_at', { ascending: false })
    .limit(300)

  if (filter?.status) query = query.eq('status', filter.status as 'open' | 'in_review' | 'resolved' | 'closed')
  if (filter?.category) query = query.eq('category', filter.category)
  if (filter?.priority) query = query.eq('priority', filter.priority as 'low' | 'normal' | 'high' | 'urgent')

  const { data, error } = await query

  if (isMissingRelationError(error)) return []
  throwIfError(error)

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    inspector_id: row.inspector_id as string,
    inspector_name: (row.inspector as { name?: string } | null)?.name ?? 'فاحص',
    inspector_phone: (row.inspector as { phone?: string } | null)?.phone ?? '',
    inspection_id: (row.inspection_id as string | null) ?? null,
    claim_id: (row.claim_id as string | null) ?? null,
    category: row.category as SupportTicket['category'],
    subject: row.subject as string,
    body: (row.body as string) ?? '',
    status: (row.status as SupportTicket['status']) ?? 'open',
    priority: (row.priority as SupportTicket['priority']) ?? 'normal',
    latitude: (row.latitude as number | null) ?? null,
    longitude: (row.longitude as number | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    resolved_at: (row.resolved_at as string | null) ?? null,
    resolution_note: (row.resolution_note as string) ?? '',
  }))
}

/* ──────────────────────────────────────────────────────────────────────
 * Inspection Reports (existing table) — for reports page
 * ────────────────────────────────────────────────────────────────────── */

export type InspectionReportSummary = {
  id: string
  inspection_id: string
  created_at: string
}

export async function listInspectionReports(limit = 200): Promise<InspectionReportSummary[]> {
  // `inspection_reports` keeps the checklist in the JSONB `checklist` column —
  // there is no `report_data` column. Selecting one that does not exist makes
  // Postgres answer 42703, which `isMissingRelationError` deliberately swallows,
  // so the page would silently render "no reports" forever. Read only columns
  // that exist.
  const { data, error } = await getSupabaseAdmin()
    .from('inspection_reports')
    .select('id, inspection_id, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (isMissingRelationError(error)) return []
  throwIfError(error)

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    inspection_id: (row.inspection_id as string) ?? '',
    created_at: row.created_at as string,
  }))
}

/* ──────────────────────────────────────────────────────────────────────
 * Extended Analytics — aggregated metrics for analytics page
 * ────────────────────────────────────────────────────────────────────── */

export type AnalyticsSummary = {
  totalInspections: number
  completedRate: number
  cancellationRate: number
  totalUsers: number
  totalInspectors: number
  activeInspectors: number
  pendingApprovals: number
  totalRevenue: number
  avgDuration: number | null
  violationCount: number
  openDisputes: number
  openTickets: number
  cityDistribution: { city: string; count: number }[]
  inspectionTrend: { date: string; count: number; completed: number }[]
  inspectorPerformance: { name: string; total: number; completed: number; rating: number | null }[]
}

export async function getAnalyticsSummary(): Promise<AnalyticsSummary> {
  const supabase = getSupabaseAdmin()

  const [
    inspectionsResult,
    completedResult,
    cancelledResult,
    usersResult,
    inspectorsResult,
    activeInspectorsResult,
    pendingResult,
    violationsResult,
    disputesResult,
    ticketsResult,
    inspectorStatsResult,
  ] = await Promise.all([
    supabase.from('inspections').select('*', { count: 'exact', head: true }),
    supabase.from('inspections').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
    supabase.from('inspections').select('*', { count: 'exact', head: true }).eq('status', 'cancelled'),
    supabase.from('user_profiles').select('*', { count: 'exact', head: true }),
    supabase.from('user_profiles').select('*', { count: 'exact', head: true }).eq('role', 'inspector'),
    supabase.from('user_profiles').select('*', { count: 'exact', head: true }).eq('inspector_status', 'approved'),
    supabase.from('user_profiles').select('*', { count: 'exact', head: true }).eq('inspector_status', 'pending'),
    supabase.from('inspector_violations').select('*', { count: 'exact', head: true }).eq('resolved', false),
    supabase.from('disputes').select('*', { count: 'exact', head: true }).in('status', ['open', 'under_review']),
    supabase.from('inspector_support_tickets').select('*', { count: 'exact', head: true }).in('status', ['open', 'in_review']),
    supabase.from('inspector_stats').select('inspector:inspector_id(name), total_inspections, completed_count, avg_rating').order('total_inspections', { ascending: false }).limit(10),
  ])

  const totalInspections = inspectionsResult.count ?? 0
  const completed = completedResult.count ?? 0
  const cancelled = cancelledResult.count ?? 0
  const completedRate = totalInspections > 0 ? Math.round((completed / totalInspections) * 100) : 0
  const cancellationRate = totalInspections > 0 ? Math.round((cancelled / totalInspections) * 100) : 0

  // City distribution from inspections
  const cityResult = await supabase.from('inspections').select('city').limit(5000)
  const cityMap = new Map<string, number>()
  for (const row of cityResult.data ?? []) {
    const city = (row as { city?: string }).city ?? 'غير محدد'
    cityMap.set(city, (cityMap.get(city) ?? 0) + 1)
  }
  const cityDistribution = [...cityMap.entries()]
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count)

  // 14-day inspection trend
  const since = new Date(Date.now() - 13 * 86_400_000)
  since.setHours(0, 0, 0, 0)
  const trendResult = await supabase
    .from('inspections')
    .select('created_at, status')
    .gte('created_at', since.toISOString())
    .limit(5000)

  const buckets = new Map<string, { date: string; count: number; completed: number }>()
  for (let i = 0; i < 14; i++) {
    const date = new Date(since.getTime() + i * 86_400_000).toISOString().slice(0, 10)
    buckets.set(date, { date, count: 0, completed: 0 })
  }
  for (const row of trendResult.data ?? []) {
    const key = String((row as { created_at?: string }).created_at ?? '').slice(0, 10)
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.count += 1
      if ((row as { status?: string }).status === 'completed') bucket.completed += 1
    }
  }
  const inspectionTrend = [...buckets.values()]

  // Inspector performance from inspector_stats (if table exists)
  const inspectorPerformance = (inspectorStatsResult.data ?? []).map((row: Record<string, unknown>) => ({
    name: (row.inspector as { name?: string } | null)?.name ?? 'فاحص',
    total: (row.total_inspections as number) ?? 0,
    completed: (row.completed_count as number) ?? 0,
    rating: (row.avg_rating as number | null) ?? null,
  }))

  return {
    totalInspections,
    completedRate,
    cancellationRate,
    totalUsers: usersResult.count ?? 0,
    totalInspectors: inspectorsResult.count ?? 0,
    activeInspectors: activeInspectorsResult.count ?? 0,
    pendingApprovals: pendingResult.count ?? 0,
    totalRevenue: 0, // Would need pricing data to compute
    avgDuration: null,
    violationCount: violationsResult.count ?? 0,
    openDisputes: disputesResult.count ?? 0,
    openTickets: ticketsResult.count ?? 0,
    cityDistribution,
    inspectionTrend,
    inspectorPerformance,
  }
}
