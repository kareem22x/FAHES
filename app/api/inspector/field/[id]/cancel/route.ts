import { NextRequest, NextResponse } from 'next/server'
import { resolveInspectorSession } from '@/lib/field/access'
import { enforceApiRateLimit } from '@/lib/api-rate-limit'
import { assertSameOrigin } from '@/lib/origin'
import { logAuditEvent } from '@/lib/audit'
import { hashFieldAction } from '@/lib/field/chain'
import { getLiveClaimForInspector, recordFieldAction, releaseFieldClaim } from '@/lib/field/store'
import type { CancelReason } from '@/lib/field/types'

/**
 * The reasons a cancel is permitted, mirroring the CHECK constraint on
 * `inspector_claims.cancel_reason`. Kept in sync by hand because a mismatch
 * would mean a request that validates here and fails at the database.
 */
const cancelReasons: CancelReason[] = [
  'vehicle_missing',
  'vehicle_sold',
  'showroom_denied',
  'location_mismatch',
  'safety_concern',
  'other',
]

/**
 * Emergency cancellation with a structured reason.
 *
 * Any still-pending handover for the same claim is cancelled in the same breath
 * — otherwise the order returns to the pool *and* stays in the handover feed,
 * and a third inspector could accept a swap for a job that is already open.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const originError = assertSameOrigin(request)
  if (originError) return originError

  const session = await resolveInspectorSession()
  if (!session) {
    return NextResponse.json({ error: 'هذه العملية للفاحص المعتمد فقط' }, { status: 401 })
  }

  const rateLimitResponse = await enforceApiRateLimit(request, 'field-cancel', session.sub, {
    user: 20,
    ip: 60,
    windowMs: 60 * 60_000,
  })
  if (rateLimitResponse) return rateLimitResponse

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'بيانات الإلغاء غير صالحة' }, { status: 400 })
  }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'بيانات الإلغاء غير صالحة' }, { status: 400 })
  }

  const input = body as Record<string, unknown>
  if (typeof input.reason !== 'string' || !cancelReasons.includes(input.reason as CancelReason)) {
    return NextResponse.json({ error: 'يجب اختيار سبب إلغاء صالح' }, { status: 400 })
  }

  const { id } = await context.params
  const note = typeof input.note === 'string' ? input.note.slice(0, 1000) : ''
  const latitude = typeof input.latitude === 'number' ? input.latitude : null
  const longitude = typeof input.longitude === 'number' ? input.longitude : null
  const accuracy = typeof input.accuracy === 'number' ? input.accuracy : null

  const claim = await getLiveClaimForInspector(session.sub, id)
  if (!claim) {
    return NextResponse.json({ error: 'لا توجد مطالبة فعّالة لهذا الطلب' }, { status: 403 })
  }

  try {
    // Seal the cancel into the chain *before* releasing, so the reason and the
    // coordinates are on record even if the release path later fails.
    const recordedAt = new Date().toISOString()
    await recordFieldAction({
      claimId: claim.id,
      inspectorId: session.sub,
      actionType: 'cancel',
      actionDetail: input.reason,
      recordedAtRfc3339: recordedAt,
      deviceMonotonicMs: null,
      latitude,
      longitude,
      accuracy,
      offlineQueued: false,
      payload: { reason: input.reason, note },
      contentHash: await hashFieldAction({
        claimId: claim.id,
        inspectionId: id,
        inspectorId: session.sub,
        actionType: 'cancel',
        actionDetail: input.reason,
        recordedAtRfc3339: recordedAt,
        latitude,
        longitude,
        accuracy,
        payload: { reason: input.reason, note },
        prevHash: '',
      }),
    })

    const result = await releaseFieldClaim({
      claimId: claim.id,
      inspectorId: session.sub,
      reason: input.reason as CancelReason,
      note,
      handedOverTo: null,
    })
    if (result.status !== 'ok') {
      return NextResponse.json({ error: 'تعذّر إلغاء الطلب' }, { status: 409 })
    }

    await logAuditEvent({
      actorId: session.sub,
      eventType: 'field.cancel',
      resourceType: 'inspection',
      resourceId: id,
      metadata: { reason: input.reason, note, latitude, longitude, claimId: claim.id },
    })

    return NextResponse.json({ status: 'ok' })
  } catch (error) {
    console.error('Error cancelling field claim:', error)
    return NextResponse.json({ error: 'خدمة الإلغاء غير متاحة حاليًا' }, { status: 503 })
  }
}
