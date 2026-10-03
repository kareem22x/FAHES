import { NextRequest, NextResponse } from 'next/server'
import { resolveInspectorSession } from '@/lib/field/access'
import { enforceApiRateLimit } from '@/lib/api-rate-limit'
import { assertSameOrigin } from '@/lib/origin'
import { hashFieldAction } from '@/lib/field/chain'
import { getLiveClaimForInspector, recordFieldAction, updateClaimProgress } from '@/lib/field/store'

/**
 * Pre-inspection verification: odometer reading and plate confirmation.
 *
 * Partial updates are allowed and expected — the inspector types the odometer,
 * blurs the field, and this is called; the checkbox is a separate call. Both
 * write into the same chain so the trail shows the order the two happened in.
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

  const rateLimitResponse = await enforceApiRateLimit(request, 'field-verify', session.sub, {
    user: 200,
    ip: 300,
    windowMs: 60 * 60_000,
  })
  if (rateLimitResponse) return rateLimitResponse

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'بيانات التحقق غير صالحة' }, { status: 400 })
  }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'بيانات التحقق غير صالحة' }, { status: 400 })
  }

  const input = body as Record<string, unknown>
  const { id } = await context.params

  const odometerKm = typeof input.odometerKm === 'number' ? input.odometerKm : undefined
  const plateConfirmed = typeof input.plateConfirmed === 'boolean' ? input.plateConfirmed : undefined

  if (odometerKm === undefined && plateConfirmed === undefined) {
    return NextResponse.json({ error: 'لا يوجد تغيير لحفظه' }, { status: 400 })
  }
  if (odometerKm !== undefined && (!Number.isInteger(odometerKm) || odometerKm < 0 || odometerKm > 2_000_000)) {
    return NextResponse.json({ error: 'قراءة العداد خارج النطاق المسموح' }, { status: 400 })
  }

  const claim = await getLiveClaimForInspector(session.sub, id)
  if (!claim) {
    return NextResponse.json({ error: 'لا توجد مطالبة فعّالة لهذا الطلب' }, { status: 403 })
  }

  const patch: Parameters<typeof updateClaimProgress>[0]['patch'] = {}
  if (odometerKm !== undefined) patch.odometerKm = odometerKm
  if (plateConfirmed !== undefined) patch.plateConfirmed = plateConfirmed

  // Verification is "complete" only when all three preconditions hold. Recompute
  // from the merged state rather than trusting the client's word for it.
  const mergedOdometer = odometerKm ?? claim.odometer_km
  const mergedPlate = plateConfirmed ?? claim.plate_confirmed
  const nowComplete = mergedOdometer !== null && mergedPlate === true
  if (nowComplete && !claim.verification_completed_at) {
    patch.verificationCompletedAt = new Date().toISOString()
  }

  try {
    await updateClaimProgress({ claimId: claim.id, inspectorId: session.sub, patch })

    const recordedAt = new Date().toISOString()
    const payload: Record<string, unknown> = {}
    if (odometerKm !== undefined) payload.odometerKm = odometerKm
    if (plateConfirmed !== undefined) payload.plateConfirmed = plateConfirmed
    if (patch.verificationCompletedAt) payload.verificationCompleted = true

    await recordFieldAction({
      claimId: claim.id,
      inspectorId: session.sub,
      actionType: 'verify',
      actionDetail: patch.verificationCompletedAt ? 'اكتمل التحقق المبدئي' : 'تحديث بيانات التحقق',
      recordedAtRfc3339: recordedAt,
      deviceMonotonicMs: null,
      latitude: null,
      longitude: null,
      accuracy: null,
      offlineQueued: false,
      payload,
      contentHash: await hashFieldAction({
        claimId: claim.id,
        inspectionId: id,
        inspectorId: session.sub,
        actionType: 'verify',
        actionDetail: '',
        recordedAtRfc3339: recordedAt,
        latitude: null,
        longitude: null,
        accuracy: null,
        payload,
        prevHash: '',
      }),
    })

    return NextResponse.json({ success: true, complete: nowComplete })
  } catch (error) {
    console.error('Error saving field verification:', error)
    return NextResponse.json({ error: 'تعذّر حفظ بيانات التحقق' }, { status: 503 })
  }
}
