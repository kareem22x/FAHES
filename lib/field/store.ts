import 'server-only'

import { getSupabaseAdmin, isMissingRelationError } from '@/lib/supabase/server'
import type { Json } from '@/lib/supabase/database.types'
import type {
  AnalyticsRange,
  BadgeKey,
  CancelReason,
  ClaimStatus,
  FieldActionType,
  HandoverRequest,
  SupportTicket,
  SupportTicketCategory,
} from '@/lib/field/types'

/**
 * Field dashboard data access.
 *
 * Conventions mirror `lib/inspection-store.ts`:
 *   · every write goes through `getSupabaseAdmin()` — the field surface has no
 *     RLS-readable tables;
 *   · anything that must be atomic is an RPC, never a read-then-write;
 *   · `throwIfError` so a real failure surfaces instead of silently rendering
 *     an empty list, except where the migration may not be applied yet, where
 *     `isMissingRelationError` degrades to an empty result.
 */

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(`Supabase field operation failed: ${error.message}`)
}

function resultRecord(value: Json): Record<string, Json | undefined> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Supabase returned an invalid field operation result')
  }
  return value as Record<string, Json | undefined>
}

// ---------------------------------------------------------------------------
// Claim
// ---------------------------------------------------------------------------

export type ClaimVerdict =
  | { status: 'ok'; claimId: string; distanceMeters: number | null }
  | { status: 'already_yours'; claimId: string }
  | { status: 'already_claimed' }
  | { status: 'out_of_zone'; city: string }
  | { status: 'too_far'; distanceMeters: number }
  | { status: 'not_approved' }
  | { status: 'closed'; current: string }
  | { status: 'not_found' }
  | { status: 'unknown_inspector' }
  | { status: 'unavailable'; reason: string }

/**
 * Atomic claim. The serialisation and the distance check happen inside the
 * `claim_inspection_for_field` RPC, under `for update` on the inspection row —
 * see the migration for why this cannot be done client-side.
 */
export async function claimInspectionForField(input: {
  inspectionId: string
  inspectorId: string
  latitude: number | null
  longitude: number | null
  accuracy: number | null
  maxDistanceMeters: number | null
}): Promise<ClaimVerdict> {
  const { data, error } = await getSupabaseAdmin().rpc('claim_inspection_for_field', {
    p_inspection_id: input.inspectionId,
    p_inspector_id: input.inspectorId,
    p_lat: input.latitude,
    p_lng: input.longitude,
    p_accuracy_m: input.accuracy,
    p_max_distance_m: input.maxDistanceMeters,
  })

  if (error) {
    // A deployed-but-unmigrated environment should say so plainly rather than
    // reporting every claim as "someone beat you to it".
    if (isMissingRelationError(error)) {
      return { status: 'unavailable', reason: 'migration_required' }
    }
    throwIfError(error)
  }

  const result = resultRecord(data as Json)
  const status = typeof result.status === 'string' ? result.status : 'unavailable'

  switch (status) {
    case 'ok':
      return {
        status: 'ok',
        claimId: String(result.claimId),
        distanceMeters: typeof result.distanceM === 'number' ? result.distanceM : null,
      }
    case 'already_yours':
      return { status: 'already_yours', claimId: String(result.claimId) }
    case 'already_claimed':
      return { status: 'already_claimed' }
    case 'out_of_zone':
      return { status: 'out_of_zone', city: String(result.city ?? '') }
    case 'too_far':
      return { status: 'too_far', distanceMeters: typeof result.distanceM === 'number' ? result.distanceM : 0 }
    case 'not_approved':
      return { status: 'not_approved' }
    case 'closed':
      return { status: 'closed', current: String(result.current ?? '') }
    case 'not_found':
      return { status: 'not_found' }
    case 'unknown_inspector':
      return { status: 'unknown_inspector' }
    default:
      return { status: 'unavailable', reason: status }
  }
}

export async function releaseFieldClaim(input: {
  claimId: string
  inspectorId: string
  reason: CancelReason | null
  note: string
  handedOverTo: string | null
}) {
  const { data, error } = await getSupabaseAdmin().rpc('release_field_claim', {
    p_claim_id: input.claimId,
    p_inspector_id: input.inspectorId,
    p_reason: input.reason,
    p_note: input.note,
    p_handed_over_to: input.handedOverTo,
  })
  if (error) {
    if (isMissingRelationError(error)) return { status: 'unavailable' } as const
    throwIfError(error)
  }
  const result = resultRecord(data as Json)
  return { status: typeof result.status === 'string' ? result.status : 'unavailable' } as const
}

export type FieldClaimRow = {
  id: string
  inspection_id: string
  inspector_id: string
  city: string
  status: ClaimStatus
  claimed_at: string
  claim_lat: number | null
  claim_lng: number | null
  claim_accuracy_m: number | null
  claim_distance_m: number | null
  odometer_km: number | null
  plate_confirmed: boolean
  verification_completed_at: string | null
  started_at: string | null
  completed_at: string | null
  cancelled_at: string | null
  cancel_reason: CancelReason | null
  cancel_note: string
  handed_over_to: string | null
}

export async function getLiveClaimForInspector(inspectorId: string, inspectionId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('inspector_claims')
    .select('*')
    .eq('inspector_id', inspectorId)
    .eq('inspection_id', inspectionId)
    .in('status', ['claimed', 'in_progress'])
    .maybeSingle()
  if (error) {
    if (isMissingRelationError(error)) return null
    throwIfError(error)
  }
  return data as FieldClaimRow | null
}

/**
 * Claim progress writes. The caller speaks camelCase like the rest of the app;
 * the column names are mapped here so no component has to know the schema.
 */
export async function updateClaimProgress(input: {
  claimId: string
  inspectorId: string
  patch: {
    odometerKm?: number
    plateConfirmed?: boolean
    verificationCompletedAt?: string
    status?: ClaimStatus
    startedAt?: string
    completedAt?: string
  }
}) {
  const patch: {
    updated_at: string
    odometer_km?: number
    plate_confirmed?: boolean
    verification_completed_at?: string
    status?: ClaimStatus
    started_at?: string
    completed_at?: string
  } = { updated_at: new Date().toISOString() }
  if (input.patch.odometerKm !== undefined) patch.odometer_km = input.patch.odometerKm
  if (input.patch.plateConfirmed !== undefined) patch.plate_confirmed = input.patch.plateConfirmed
  if (input.patch.verificationCompletedAt !== undefined) {
    patch.verification_completed_at = input.patch.verificationCompletedAt
  }
  if (input.patch.status !== undefined) patch.status = input.patch.status
  if (input.patch.startedAt !== undefined) patch.started_at = input.patch.startedAt
  if (input.patch.completedAt !== undefined) patch.completed_at = input.patch.completedAt

  const { error } = await getSupabaseAdmin()
    .from('inspector_claims')
    .update(patch)
    .eq('id', input.claimId)
    .eq('inspector_id', input.inspectorId)
  throwIfError(error)
}

// ---------------------------------------------------------------------------
// Field actions (hash chain)
// ---------------------------------------------------------------------------

export type FieldActionRow = {
  id: number
  claim_id: string
  inspection_id: string
  inspector_id: string
  action_type: FieldActionType
  action_detail: string
  recorded_at: string
  recorded_at_rfc3339: string
  device_monotonic_ms: number | null
  latitude: number | null
  longitude: number | null
  accuracy_m: number | null
  offline_queued: boolean
  payload: Json
  prev_hash: string
  content_hash: string
  created_at: string
}

/**
 * Extend the chain. Returns the action id and the previous hash, so the client
 * can confirm it hashed onto the tip it expected.
 */
export async function recordFieldAction(input: {
  claimId: string
  inspectorId: string
  actionType: FieldActionType
  actionDetail: string
  recordedAtRfc3339: string
  deviceMonotonicMs: number | null
  latitude: number | null
  longitude: number | null
  accuracy: number | null
  offlineQueued: boolean
  payload: Record<string, unknown>
  contentHash: string
}) {
  const { data, error } = await getSupabaseAdmin().rpc('record_field_action', {
    p_claim_id: input.claimId,
    p_inspector_id: input.inspectorId,
    p_action_type: input.actionType,
    p_action_detail: input.actionDetail,
    p_recorded_at: input.recordedAtRfc3339,
    p_device_monotonic_ms: input.deviceMonotonicMs,
    p_lat: input.latitude,
    p_lng: input.longitude,
    p_accuracy_m: input.accuracy,
    p_offline_queued: input.offlineQueued,
    p_payload: input.payload as Json,
    p_content_hash: input.contentHash,
  })
  if (error) {
    if (isMissingRelationError(error)) return { status: 'unavailable' } as const
    throwIfError(error)
  }
  const result = resultRecord(data as Json)
  return {
    status: typeof result.status === 'string' ? result.status : 'unavailable',
    actionId: typeof result.actionId === 'number' ? result.actionId : null,
    prevHash: typeof result.prevHash === 'string' ? result.prevHash : '',
  } as const
}

export async function listFieldActions(claimId: string, limit = 200) {
  const { data, error } = await getSupabaseAdmin()
    .from('field_actions')
    .select('*')
    .eq('claim_id', claimId)
    .order('id', { ascending: true })
    .limit(limit)
  if (error) {
    if (isMissingRelationError(error)) return []
    throwIfError(error)
  }
  return (data ?? []) as FieldActionRow[]
}

/** Every action recorded against an inspection, across all claims. */
export async function listInspectionAuditTrail(inspectionId: string, limit = 400) {
  const { data, error } = await getSupabaseAdmin()
    .from('field_actions')
    .select('*')
    .eq('inspection_id', inspectionId)
    .order('id', { ascending: true })
    .limit(limit)
  if (error) {
    if (isMissingRelationError(error)) return []
    throwIfError(error)
  }
  return (data ?? []) as FieldActionRow[]
}

// ---------------------------------------------------------------------------
// Support tickets
// ---------------------------------------------------------------------------

export async function createSupportTicket(input: {
  inspectorId: string
  inspectionId: string | null
  claimId: string | null
  category: SupportTicketCategory
  subject: string
  body: string
  priority: SupportTicket['priority']
  latitude: number | null
  longitude: number | null
}) {
  const { data, error } = await getSupabaseAdmin()
    .from('inspector_support_tickets')
    .insert({
      inspector_id: input.inspectorId,
      inspection_id: input.inspectionId,
      claim_id: input.claimId,
      category: input.category,
      subject: input.subject,
      body: input.body,
      priority: input.priority,
      latitude: input.latitude,
      longitude: input.longitude,
    })
    .select('*')
    .maybeSingle()
  if (error) {
    if (isMissingRelationError(error)) return null
    throwIfError(error)
  }
  return data
}

export async function listSupportTickets(inspectorId: string, limit = 50) {
  const { data, error } = await getSupabaseAdmin()
    .from('inspector_support_tickets')
    .select('*')
    .eq('inspector_id', inspectorId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) {
    if (isMissingRelationError(error)) return []
    throwIfError(error)
  }
  return data ?? []
}

// ---------------------------------------------------------------------------
// Handover
// ---------------------------------------------------------------------------

export async function createHandoverRequest(input: {
  claimId: string
  inspectionId: string
  city: string
  fromInspectorId: string
  reason: HandoverRequest['reason']
  note: string
  latitude: number | null
  longitude: number | null
}) {
  const { data, error } = await getSupabaseAdmin()
    .from('inspector_handover_requests')
    .insert({
      claim_id: input.claimId,
      inspection_id: input.inspectionId,
      city: input.city,
      from_inspector_id: input.fromInspectorId,
      reason: input.reason,
      note: input.note,
      latitude: input.latitude,
      longitude: input.longitude,
    })
    .select('*')
    .maybeSingle()
  if (error) {
    if (isMissingRelationError(error)) return null
    throwIfError(error)
  }
  return data
}

/**
 * Pending handovers in the inspector's cities, excluding their own requests.
 * This is the "someone near you needs cover" feed.
 */
export async function listIncomingHandovers(inspectorId: string, cities: string[], limit = 30) {
  if (cities.length === 0) return []
  const { data, error } = await getSupabaseAdmin()
    .from('inspector_handover_requests')
    .select('*')
    .eq('status', 'pending')
    .in('city', cities)
    .neq('from_inspector_id', inspectorId)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) {
    if (isMissingRelationError(error)) return []
    throwIfError(error)
  }
  return data ?? []
}

export async function listOutgoingHandovers(inspectorId: string, limit = 30) {
  const { data, error } = await getSupabaseAdmin()
    .from('inspector_handover_requests')
    .select('*')
    .eq('from_inspector_id', inspectorId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) {
    if (isMissingRelationError(error)) return []
    throwIfError(error)
  }
  return data ?? []
}

/**
 * Accept a handover: the receiving inspector claims the order and the
 * original claim is closed as handed over. Both writes are ordered so the
 * order is never unassigned while nobody else holds it.
 */
export async function acceptHandover(input: {
  handoverId: string
  inspectorId: string
  latitude: number | null
  longitude: number | null
  accuracy: number | null
}) {
  const db = getSupabaseAdmin()
  const { data: request, error: readError } = await db
    .from('inspector_handover_requests')
    .select('*')
    .eq('id', input.handoverId)
    .maybeSingle()
  if (readError) {
    if (isMissingRelationError(readError)) return { status: 'unavailable' } as const
    throwIfError(readError)
  }
  if (!request) return { status: 'not_found' } as const
  if (request.status !== 'pending') return { status: 'already_resolved' } as const
  if (request.from_inspector_id === input.inspectorId) return { status: 'own_request' } as const

  const claimed = await claimInspectionForField({
    inspectionId: request.inspection_id,
    inspectorId: input.inspectorId,
    latitude: input.latitude,
    longitude: input.longitude,
    accuracy: input.accuracy,
    maxDistanceMeters: null,
  })
  if (claimed.status !== 'ok' && claimed.status !== 'already_yours') {
    return { status: claimed.status } as const
  }

  const { error: updateError } = await db
    .from('inspector_handover_requests')
    .update({
      status: 'accepted',
      to_inspector_id: input.inspectorId,
      responded_at: new Date().toISOString(),
    })
    .eq('id', input.handoverId)
  throwIfError(updateError)

  const { error: releaseError } = await db
    .from('inspector_claims')
    .update({
      status: 'handed_over',
      handed_over_to: input.inspectorId,
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', request.claim_id)
    .in('status', ['claimed', 'in_progress'])
  throwIfError(releaseError)

  return { status: 'ok', claimId: claimed.claimId, inspectionId: request.inspection_id } as const
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

export async function listInspectorBadges(inspectorId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('inspector_badges')
    .select('*')
    .eq('inspector_id', inspectorId)
    .order('earned_at', { ascending: false })
  if (error) {
    if (isMissingRelationError(error)) return []
    throwIfError(error)
  }
  return (data ?? []) as Array<{ badge_key: BadgeKey; earned_at: string; metric_value: number | null }>
}

export async function awardBadge(input: { inspectorId: string; badgeKey: BadgeKey; metricValue: number | null }) {
  const { error } = await getSupabaseAdmin()
    .from('inspector_badges')
    .upsert(
      { inspector_id: input.inspectorId, badge_key: input.badgeKey, metric_value: input.metricValue },
      { onConflict: 'inspector_id,badge_key', ignoreDuplicates: true },
    )
  if (error && !isMissingRelationError(error)) throwIfError(error)
}

// ---------------------------------------------------------------------------
// Media (verification photos)
// ---------------------------------------------------------------------------

export async function listClaimMedia(claimId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('inspection_media')
    .select('id,category,object_path,mime_type,phase,latitude,longitude,content_hash,captured_at,created_at')
    .eq('claim_id', claimId)
    .order('created_at', { ascending: true })
  if (error) {
    if (isMissingRelationError(error)) return []
    throwIfError(error)
  }
  return data ?? []
}

export function mediaPublicPath(objectPath: string) {
  return objectPath
}

// ---------------------------------------------------------------------------
// Payout requests
// ---------------------------------------------------------------------------

export type PayoutRequestRow = {
  id: string
  inspector_id: string
  amount: number | string
  currency: string
  status: 'requested' | 'approved' | 'paid' | 'rejected' | 'cancelled'
  reference: string
  requested_at: string
  resolved_at: string | null
  resolution_note: string
}

/**
 * Returns `null` when the migration is not applied, so the route can answer 503
 * with a "run the migration" message rather than a generic failure. A silently
 * swallowed insert here would tell an inspector their money is on its way when
 * nothing was written.
 */
export async function createPayoutRequest(input: {
  inspectorId: string
  amount: number
  reference: string
  latitude: number | null
  longitude: number | null
}) {
  const { data, error } = await getSupabaseAdmin()
    .from('inspector_payout_requests')
    .insert({
      inspector_id: input.inspectorId,
      amount: input.amount,
      reference: input.reference,
      latitude: input.latitude,
      longitude: input.longitude,
    })
    .select('*')
    .maybeSingle()
  if (error) {
    if (isMissingRelationError(error)) return null
    // The partial unique index firing means a request is already open — that is
    // a race, not a fault, so report it as the same "already pending" verdict.
    if (error.code === '23505') return null
    throwIfError(error)
  }
  return data as PayoutRequestRow | null
}

export async function listPayoutRequests(inspectorId: string, limit = 20) {
  const { data, error } = await getSupabaseAdmin()
    .from('inspector_payout_requests')
    .select('*')
    .eq('inspector_id', inspectorId)
    .order('requested_at', { ascending: false })
    .limit(limit)
  if (error) {
    if (isMissingRelationError(error)) return []
    throwIfError(error)
  }
  return (data ?? []) as PayoutRequestRow[]
}
