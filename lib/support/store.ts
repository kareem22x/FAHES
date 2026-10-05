import 'server-only'
import { getSupabaseAdmin, isMissingRelationError } from '@/lib/supabase/server'
import type { Json } from '@/lib/supabase/database.types'

/**
 * Support ticketing — the single data layer for both the user-facing panel and
 * the admin console.
 *
 * ── Why everything goes through the service role ─────────────────────────────
 *
 * Migration 05 forces RLS on the ticket tables and revokes anon/authenticated
 * outright (the same convention as the rest of this schema). No browser ever
 * queries them directly; ownership is checked here, against the session id the
 * route already resolved. The upside is that a user physically cannot reach
 * another user's thread — there is no client-side query to tamper with.
 *
 * Every read degrades to an empty result when the tables are absent, so a
 * database without migration 05 still renders the console instead of a 500.
 */

export type TicketStatus = 'open' | 'in_progress' | 'waiting_for_user' | 'resolved' | 'closed'
export type TicketPriority = 'critical' | 'high' | 'medium' | 'low'
export type TicketCategory = 'inspection_issue' | 'payment' | 'app_bug' | 'account_lock' | 'other'
export type TicketRole = 'customer' | 'inspector' | 'admin'
export type EscalationTarget = 'admin' | 'operations'

export const TICKET_STATUSES: TicketStatus[] = ['open', 'in_progress', 'waiting_for_user', 'resolved', 'closed']
export const TICKET_PRIORITIES: TicketPriority[] = ['critical', 'high', 'medium', 'low']
export const TICKET_CATEGORIES: TicketCategory[] = [
  'inspection_issue',
  'payment',
  'app_bug',
  'account_lock',
  'other',
]

/**
 * First-response SLA per priority. Critical tickets must be answered inside 15
 * minutes; the console paints anything past `slaDueAt` red.
 */
export const SLA_MINUTES: Record<TicketPriority, number> = {
  critical: 15,
  high: 60,
  medium: 4 * 60,
  low: 24 * 60,
}

/** A resolved/closed ticket can be re-opened by the user for this long. */
export const REOPEN_WINDOW_HOURS = 48

export type SupportTicket = {
  id: string
  ticketNumber: string
  requesterId: string
  requesterRole: TicketRole
  subject: string
  category: TicketCategory
  priority: TicketPriority
  status: TicketStatus
  body: string
  inspectionId: string | null
  assignedTo: string | null
  deviceInfo: Record<string, unknown>
  latitude: number | null
  longitude: number | null
  escalatedTo: EscalationTarget | null
  firstResponseAt: number | null
  slaDueAt: number | null
  resolvedAt: number | null
  closedAt: number | null
  reopenDeadline: number | null
  satisfactionRating: number | null
  satisfactionNote: string
  createdAt: number
  updatedAt: number
}

export type SupportMessage = {
  id: string
  ticketId: string
  authorId: string
  authorRole: TicketRole
  body: string
  isInternal: boolean
  attachmentPath: string | null
  attachmentName: string | null
  attachmentMime: string | null
  attachmentSize: number | null
  deletedAt: number | null
  createdAt: number
}

export type SupportEvent = {
  id: number
  eventType: string
  fromValue: string | null
  toValue: string | null
  note: string
  createdAt: number
}

export type CannedResponse = {
  id: string
  label: string
  body: string
  category: string | null
}

type Row = Record<string, unknown>

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function num(value: unknown): number | null {
  return typeof value === 'number' ? value : null
}

function time(value: unknown): number | null {
  return typeof value === 'string' ? Date.parse(value) : null
}

function toTicket(row: Row): SupportTicket {
  return {
    id: str(row.id),
    ticketNumber: str(row.ticket_number),
    requesterId: str(row.requester_id),
    requesterRole: (str(row.requester_role, 'customer') as TicketRole),
    subject: str(row.subject),
    category: str(row.category, 'other') as TicketCategory,
    priority: str(row.priority, 'medium') as TicketPriority,
    status: str(row.status, 'open') as TicketStatus,
    body: str(row.body),
    inspectionId: typeof row.inspection_id === 'string' ? row.inspection_id : null,
    assignedTo: typeof row.assigned_to === 'string' ? row.assigned_to : null,
    deviceInfo: (row.device_info as Record<string, unknown>) ?? {},
    latitude: num(row.latitude),
    longitude: num(row.longitude),
    escalatedTo: (typeof row.escalated_to === 'string' ? row.escalated_to : null) as EscalationTarget | null,
    firstResponseAt: time(row.first_response_at),
    slaDueAt: time(row.sla_due_at),
    resolvedAt: time(row.resolved_at),
    closedAt: time(row.closed_at),
    reopenDeadline: time(row.reopen_deadline),
    satisfactionRating: num(row.satisfaction_rating),
    satisfactionNote: str(row.satisfaction_note),
    createdAt: time(row.created_at) ?? Date.now(),
    updatedAt: time(row.updated_at) ?? Date.now(),
  }
}

function toMessage(row: Row): SupportMessage {
  return {
    id: str(row.id),
    ticketId: str(row.ticket_id),
    authorId: str(row.author_id),
    authorRole: str(row.author_role, 'customer') as TicketRole,
    body: str(row.body),
    isInternal: row.is_internal === true,
    attachmentPath: typeof row.attachment_path === 'string' ? row.attachment_path : null,
    attachmentName: typeof row.attachment_name === 'string' ? row.attachment_name : null,
    attachmentMime: typeof row.attachment_mime === 'string' ? row.attachment_mime : null,
    attachmentSize: num(row.attachment_size),
    deletedAt: time(row.deleted_at),
    createdAt: time(row.created_at) ?? Date.now(),
  }
}

/* ── Reads ──────────────────────────────────────────────────────────────────── */

export async function listTicketsForRequester(userId: string): Promise<SupportTicket[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('support_tickets')
    .select('*')
    .eq('requester_id', userId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (isMissingRelationError(error)) return []
  if (error) throw new Error(`Supabase tickets read failed: ${error.message}`)
  return ((data ?? []) as Row[]).map(toTicket)
}

export type AdminTicketFilter = {
  status?: TicketStatus | 'all'
  priority?: TicketPriority | 'all'
  assignedTo?: string | 'all' | 'unassigned'
  search?: string
}

export async function listTicketsForAdmin(filter: AdminTicketFilter = {}): Promise<SupportTicket[]> {
  let query = getSupabaseAdmin().from('support_tickets').select('*')

  if (filter.status && filter.status !== 'all') query = query.eq('status', filter.status)
  if (filter.priority && filter.priority !== 'all') query = query.eq('priority', filter.priority)
  if (filter.assignedTo === 'unassigned') query = query.is('assigned_to', null)
  else if (filter.assignedTo && filter.assignedTo !== 'all') query = query.eq('assigned_to', filter.assignedTo)
  if (filter.search) query = query.or(`subject.ilike.%${filter.search}%,ticket_number.ilike.%${filter.search}%`)

  const { data, error } = await query.order('created_at', { ascending: false }).limit(300)
  if (isMissingRelationError(error)) return []
  if (error) throw new Error(`Supabase tickets read failed: ${error.message}`)
  return ((data ?? []) as Row[]).map(toTicket)
}

export async function getTicket(id: string): Promise<SupportTicket | null> {
  const { data, error } = await getSupabaseAdmin().from('support_tickets').select('*').eq('id', id).maybeSingle()
  if (isMissingRelationError(error)) return null
  if (error) throw new Error(`Supabase ticket read failed: ${error.message}`)
  return data ? toTicket(data as Row) : null
}

/** Ownership-checked read. Returns null when the ticket belongs to someone else. */
export async function getTicketForRequester(id: string, userId: string): Promise<SupportTicket | null> {
  const ticket = await getTicket(id)
  if (!ticket || ticket.requesterId !== userId) return null
  return ticket
}

export async function listMessages(ticketId: string, includeInternal: boolean): Promise<SupportMessage[]> {
  let query = getSupabaseAdmin()
    .from('support_ticket_messages')
    .select('*')
    .eq('ticket_id', ticketId)
    .is('deleted_at', null)
  if (!includeInternal) query = query.eq('is_internal', false)

  const { data, error } = await query.order('created_at', { ascending: true }).limit(500)
  if (isMissingRelationError(error)) return []
  if (error) throw new Error(`Supabase messages read failed: ${error.message}`)
  return ((data ?? []) as Row[]).map(toMessage)
}

export async function listEvents(ticketId: string): Promise<SupportEvent[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('support_ticket_events')
    .select('id, event_type, from_value, to_value, note, created_at')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true })
    .limit(200)
  if (isMissingRelationError(error)) return []
  if (error) throw new Error(`Supabase events read failed: ${error.message}`)
  return ((data ?? []) as Row[]).map((row) => ({
    id: typeof row.id === 'number' ? row.id : Number(row.id ?? 0),
    eventType: str(row.event_type),
    fromValue: typeof row.from_value === 'string' ? row.from_value : null,
    toValue: typeof row.to_value === 'string' ? row.to_value : null,
    note: str(row.note),
    createdAt: time(row.created_at) ?? Date.now(),
  }))
}

export async function listCannedResponses(): Promise<CannedResponse[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('support_canned_responses')
    .select('id, label, body, category')
    .order('label', { ascending: true })
  if (isMissingRelationError(error)) return []
  if (error) throw new Error(`Supabase canned responses read failed: ${error.message}`)
  return ((data ?? []) as Row[]).map((row) => ({
    id: str(row.id),
    label: str(row.label),
    body: str(row.body),
    category: typeof row.category === 'string' ? row.category : null,
  }))
}

export type SupportStats = {
  open: number
  inProgress: number
  waiting: number
  resolved: number
  closed: number
  unassigned: number
  slaBreached: number
  criticalOpen: number
  avgFirstResponseMinutes: number | null
  avgSatisfaction: number | null
  /**
   * Unresolved tickets per priority, over the same rows as the counters above.
   *
   * Scoped to unresolved on purpose: a distribution that included closed tickets
   * would describe the archive rather than the queue an agent is actually
   * working, which is the question the console is answering. A critical ticket
   * from last month is not load.
   */
  openByPriority: Record<TicketPriority, number>
}

export async function supportStats(): Promise<SupportStats> {
  return computeSupportStats(await listTicketsForAdmin({}))
}

/**
 * "Still on someone's plate". Defined once at module scope because the counters
 * in `computeSupportStats` and the per-agent workload both ask the same question,
 * and a single drifting copy of this rule is how a dashboard starts disagreeing
 * with its own table.
 */
export function isOpenTicket(ticket: SupportTicket): boolean {
  return !['resolved', 'closed'].includes(ticket.status)
}

/**
 * Per-agent workload, for the staff profile.
 *
 * Reuses `listTicketsForAdmin` with an `assignedTo` filter rather than issuing a
 * bespoke `count(*)` query: the filter is already indexed and the console caps at
 * a few hundred rows, so this stays one cheap read that cannot disagree with the
 * console's own numbers.
 */
export async function agentWorkload(adminId: string): Promise<{ assignedOpen: number; resolved: number }> {
  const tickets = await listTicketsForAdmin({ assignedTo: adminId })
  const open = tickets.filter(isOpenTicket).length
  return { assignedOpen: open, resolved: tickets.length - open }
}

/**
 * Pure aggregation over an already-loaded ticket list. Exposed so the console can
 * derive its stat cards from the same rows it renders, instead of issuing a second
 * identical query.
 */
export function computeSupportStats(tickets: SupportTicket[]): SupportStats {
  const now = Date.now()

  const isOpen = isOpenTicket

  const resolvedWithResponse = tickets.filter((t) => t.firstResponseAt !== null)
  const avgFirstResponseMinutes = resolvedWithResponse.length
    ? Math.round(
        resolvedWithResponse.reduce((sum, t) => sum + ((t.firstResponseAt as number) - t.createdAt), 0) /
          resolvedWithResponse.length /
          60_000,
      )
    : null

  const rated = tickets.filter((t) => t.satisfactionRating !== null)
  const avgSatisfaction = rated.length
    ? Math.round((rated.reduce((sum, t) => sum + (t.satisfactionRating as number), 0) / rated.length) * 10) / 10
    : null

  const openTickets = tickets.filter(isOpen)
  const countOpen = (priority: TicketPriority) =>
    openTickets.filter((t) => t.priority === priority).length

  return {
    open: tickets.filter((t) => t.status === 'open').length,
    inProgress: tickets.filter((t) => t.status === 'in_progress').length,
    waiting: tickets.filter((t) => t.status === 'waiting_for_user').length,
    resolved: tickets.filter((t) => t.status === 'resolved').length,
    closed: tickets.filter((t) => t.status === 'closed').length,
    unassigned: tickets.filter((t) => t.assignedTo === null && isOpen(t)).length,
    slaBreached: tickets.filter(
      (t) => t.firstResponseAt === null && t.slaDueAt !== null && t.slaDueAt < now && isOpen(t),
    ).length,
    criticalOpen: countOpen('critical'),
    avgFirstResponseMinutes,
    avgSatisfaction,
    openByPriority: {
      critical: countOpen('critical'),
      high: countOpen('high'),
      medium: countOpen('medium'),
      low: countOpen('low'),
    },
  }
}

/* ── Writes ─────────────────────────────────────────────────────────────────── */

export type CreateTicketInput = {
  requesterId: string
  requesterRole: TicketRole
  subject: string
  category: TicketCategory
  priority: TicketPriority
  body: string
  inspectionId?: string | null
  deviceInfo?: Record<string, unknown>
  latitude?: number | null
  longitude?: number | null
}

export type CreateTicketResult =
  | { ok: true; ticket: SupportTicket }
  | { ok: false; reason: 'invalid' | 'unavailable' }

export async function createTicket(input: CreateTicketInput): Promise<CreateTicketResult> {
  const subject = input.subject.trim()
  const body = input.body.trim()
  if (subject.length < 3 || body.length < 1) return { ok: false, reason: 'invalid' }

  const slaDueAt = new Date(Date.now() + SLA_MINUTES[input.priority] * 60_000).toISOString()

  const { data, error } = await getSupabaseAdmin()
    .from('support_tickets')
    .insert({
      requester_id: input.requesterId,
      requester_role: input.requesterRole,
      subject: subject.slice(0, 200),
      category: input.category,
      priority: input.priority,
      body: body.slice(0, 4000),
      inspection_id: input.inspectionId ?? null,
      device_info: (input.deviceInfo ?? {}) as never,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      sla_due_at: slaDueAt,
    })
    .select('*')
    .single()

  if (isMissingRelationError(error)) return { ok: false, reason: 'unavailable' }
  if (error) throw new Error(`Supabase ticket create failed: ${error.message}`)

  const ticket = toTicket(data as Row)
  await recordEvent(ticket.id, input.requesterId, 'created', null, 'open')
  return { ok: true, ticket }
}

export async function recordEvent(
  ticketId: string,
  actorId: string | null,
  eventType: string,
  fromValue: string | null,
  toValue: string | null,
  note = '',
): Promise<void> {
  const { error } = await getSupabaseAdmin().from('support_ticket_events').insert({
    ticket_id: ticketId,
    actor_id: actorId,
    event_type: eventType,
    from_value: fromValue,
    to_value: toValue,
    note: note.slice(0, 1000),
  })
  if (isMissingRelationError(error)) return
  if (error) throw new Error(`Supabase ticket event failed: ${error.message}`)
}

export type AddMessageInput = {
  ticketId: string
  authorId: string
  authorRole: TicketRole
  body: string
  isInternal?: boolean
  attachmentPath?: string | null
  attachmentName?: string | null
  attachmentMime?: string | null
  attachmentSize?: number | null
}

export async function addMessage(input: AddMessageInput): Promise<SupportMessage | null> {
  const { data, error } = await getSupabaseAdmin()
    .from('support_ticket_messages')
    .insert({
      ticket_id: input.ticketId,
      author_id: input.authorId,
      author_role: input.authorRole,
      body: input.body.slice(0, 8000),
      is_internal: input.isInternal ?? false,
      attachment_path: input.attachmentPath ?? null,
      attachment_name: input.attachmentName ?? null,
      attachment_mime: input.attachmentMime ?? null,
      attachment_size: input.attachmentSize ?? null,
    })
    .select('*')
    .single()

  if (isMissingRelationError(error)) return null
  if (error) throw new Error(`Supabase message create failed: ${error.message}`)
  return toMessage(data as Row)
}

/**
 * Records the first agent reply and clears the SLA clock. Called after an admin
 * message lands; a no-op when a response was already logged.
 */
export async function markFirstResponse(ticketId: string): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from('support_tickets')
    .update({ first_response_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', ticketId)
    .is('first_response_at', null)
  if (isMissingRelationError(error)) return
  if (error) throw new Error(`Supabase first-response stamp failed: ${error.message}`)
}

export async function updateTicketStatus(
  ticketId: string,
  actorId: string,
  next: TicketStatus,
): Promise<boolean> {
  const current = await getTicket(ticketId)
  if (!current) return false

  const patch: Record<string, Json | undefined> = { status: next, updated_at: new Date().toISOString() }
  if (next === 'resolved') {
    patch.resolved_at = new Date().toISOString()
    patch.reopen_deadline = new Date(Date.now() + REOPEN_WINDOW_HOURS * 3_600_000).toISOString()
  }
  if (next === 'closed') patch.closed_at = new Date().toISOString()
  if (next === 'open' || next === 'in_progress') {
    patch.resolved_at = null
    patch.closed_at = null
  }

  const { error } = await getSupabaseAdmin().from('support_tickets').update(patch).eq('id', ticketId)
  if (error) throw new Error(`Supabase ticket status update failed: ${error.message}`)

  await recordEvent(ticketId, actorId, 'status_changed', current.status, next)
  return true
}

export async function assignTicket(ticketId: string, actorId: string, adminId: string): Promise<boolean> {
  const current = await getTicket(ticketId)
  if (!current) return false
  const { error } = await getSupabaseAdmin()
    .from('support_tickets')
    .update({ assigned_to: adminId, updated_at: new Date().toISOString() })
    .eq('id', ticketId)
  if (error) throw new Error(`Supabase ticket assign failed: ${error.message}`)
  await recordEvent(ticketId, actorId, current.assignedTo ? 'reassigned' : 'assigned', current.assignedTo, adminId)
  return true
}

export async function escalateTicket(
  ticketId: string,
  actorId: string,
  target: EscalationTarget,
  note = '',
): Promise<boolean> {
  const current = await getTicket(ticketId)
  if (!current) return false
  const { error } = await getSupabaseAdmin()
    .from('support_tickets')
    .update({
      escalated_to: target,
      escalated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', ticketId)
  if (error) throw new Error(`Supabase ticket escalate failed: ${error.message}`)
  await recordEvent(ticketId, actorId, 'escalated', current.escalatedTo, target, note)
  return true
}

export async function rateTicket(
  ticketId: string,
  userId: string,
  rating: number,
  note: string,
): Promise<boolean> {
  if (rating < 1 || rating > 5) return false
  const ticket = await getTicketForRequester(ticketId, userId)
  if (!ticket) return false
  const { error } = await getSupabaseAdmin()
    .from('support_tickets')
    .update({
      satisfaction_rating: rating,
      satisfaction_note: note.slice(0, 1000),
      updated_at: new Date().toISOString(),
    })
    .eq('id', ticketId)
  if (error) throw new Error(`Supabase ticket rating failed: ${error.message}`)
  await recordEvent(ticketId, userId, 'rated', null, String(rating))
  return true
}

/**
 * Re-opens a resolved/closed ticket when the requester replies inside the 48-hour
 * window. Returns the RPC verdict so the caller can distinguish "too late".
 */
export async function reopenTicket(ticketId: string, userId: string): Promise<string> {
  const { data, error } = await getSupabaseAdmin().rpc('reopen_support_ticket', {
    p_ticket_id: ticketId,
    p_user_id: userId,
  })
  if (error) {
    if (/could not find the function|schema cache/i.test(error.message)) return 'unavailable'
    throw new Error(`Supabase ticket reopen failed: ${error.message}`)
  }
  return typeof data === 'string' ? data : 'unavailable'
}

/** Atomically claims an unassigned ticket for an agent. */
export async function claimTicket(ticketId: string, adminId: string): Promise<string> {
  const { data, error } = await getSupabaseAdmin().rpc('claim_support_ticket', {
    p_ticket_id: ticketId,
    p_admin_id: adminId,
  })
  if (error) {
    if (/could not find the function|schema cache/i.test(error.message)) return 'unavailable'
    throw new Error(`Supabase ticket claim failed: ${error.message}`)
  }
  return typeof data === 'string' ? data : 'unavailable'
}
