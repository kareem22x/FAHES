import { NextRequest, NextResponse } from 'next/server'
import { resolveInspectorSession } from '@/lib/field/access'
import { enforceApiRateLimit } from '@/lib/api-rate-limit'
import { assertSameOrigin } from '@/lib/origin'
import { logAuditEvent } from '@/lib/audit'
import { hashFieldAction } from '@/lib/field/chain'
import { createHandoverRequest, getLiveClaimForInspector, listIncomingHandovers, recordFieldAction } from '@/lib/field/store'
import type { HandoverRequest } from '@/lib/field/types'
import { getUserById } from '@/lib/user-store'

const handoverReasons: HandoverRequest['reason'][] = [
  'emergency',
  'vehicle_unavailable',
  'showroom_denied',
  'safety',
  'other',
]

/**
 * Request an immediate shift swap.
 *
 * The order stays assigned to the requesting inspector until someone accepts —
 * a handover must not open a window where the customer sees the job bounce back
 * to "unassigned" and a third party could take it out from under the swap.
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

  const rateLimitResponse = await enforceApiRateLimit(request, 'field-handover', session.sub, {
    user: 20,
    ip: 60,
    windowMs: 60 * 60_000,
  })
  if (rateLimitResponse) return rateLimitResponse

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'بيانات التبديل غير صالحة' }, { status: 400 })
  }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'بيانات التبديل غير صالحة' }, { status: 400 })
  }

  const input = body as Record<string, unknown>
  if (typeof input.reason !== 'string' || !handoverReasons.includes(input.reason as HandoverRequest['reason'])) {
    return NextResponse.json({ error: 'يجب اختيار سبب صالح للتبديل' }, { status: 400 })
  }

  const { id } = await context.params
  const user = await getUserById(session.sub)
  const cities = user?.inspectorProfile?.cities ?? []

  const claim = await getLiveClaimForInspector(session.sub, id)
  if (!claim) {
    return NextResponse.json({ error: 'لا توجد مطالبة فعّالة لهذا الطلب' }, { status: 403 })
  }

  try {
    const existing = await listIncomingHandovers(session.sub, cities)
    if (existing.some((item) => item.claim_id === claim.id)) {
      return NextResponse.json({ error: 'يوجد طلب تبديل معلّق لهذا الفحص بالفعل' }, { status: 409 })
    }

    const note = typeof input.note === 'string' ? input.note.slice(0, 1000) : ''
    const latitude = typeof input.latitude === 'number' ? input.latitude : null
    const longitude = typeof input.longitude === 'number' ? input.longitude : null
    const accuracy = typeof input.accuracy === 'number' ? input.accuracy : null

    const recordedAt = new Date().toISOString()
    const payload = { reason: input.reason, note, city: claim.city }
    await recordFieldAction({
      claimId: claim.id,
      inspectorId: session.sub,
      actionType: 'handover_request',
      actionDetail: input.reason,
      recordedAtRfc3339: recordedAt,
      deviceMonotonicMs: null,
      latitude,
      longitude,
      accuracy,
      offlineQueued: false,
      payload,
      contentHash: await hashFieldAction({
        claimId: claim.id,
        inspectionId: id,
        inspectorId: session.sub,
        actionType: 'handover_request',
        actionDetail: input.reason,
        recordedAtRfc3339: recordedAt,
        latitude,
        longitude,
        accuracy,
        payload,
        prevHash: '',
      }),
    })

    const created = await createHandoverRequest({
      claimId: claim.id,
      inspectionId: id,
      city: claim.city,
      fromInspectorId: session.sub,
      reason: input.reason as HandoverRequest['reason'],
      note,
      latitude,
      longitude,
    })
    if (!created) {
      return NextResponse.json({ error: 'خدمة التبديل غير مفعّلة على هذه البيئة' }, { status: 503 })
    }

    await logAuditEvent({
      actorId: session.sub,
      eventType: 'field.handover_requested',
      resourceType: 'inspection',
      resourceId: id,
      metadata: { reason: input.reason, note, city: claim.city },
    })

    return NextResponse.json({ status: 'ok', handoverId: created.id })
  } catch (error) {
    console.error('Error creating handover request:', error)
    return NextResponse.json({ error: 'خدمة التبديل غير متاحة حاليًا' }, { status: 503 })
  }
}
