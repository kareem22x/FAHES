import { NextRequest, NextResponse } from 'next/server'
import { resolveInspectorSession } from '@/lib/field/access'
import { enforceApiRateLimit } from '@/lib/api-rate-limit'
import { assertSameOrigin } from '@/lib/origin'
import { logAuditEvent } from '@/lib/audit'
import { claimInspectionForField } from '@/lib/field/store'
import { hashFieldAction } from '@/lib/field/chain'
import { recordFieldAction } from '@/lib/field/store'
import { getUserById } from '@/lib/user-store'

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * Atomic, distance-aware claim.
 *
 * The whole decision — is the order still open, is the inspector in coverage,
 * are they close enough — happens inside one serialised database transaction.
 * This route's job is to authenticate, validate the shape of the input, and
 * then write the `claim` action into the hash chain so the claim itself is
 * timestamped and located.
 */
export async function POST(request: NextRequest) {
  const originError = assertSameOrigin(request)
  if (originError) return originError

  const session = await resolveInspectorSession()
  if (!session) {
    return NextResponse.json({ error: 'هذه العملية للفاحص المعتمد فقط' }, { status: 401 })
  }

  const rateLimitResponse = await enforceApiRateLimit(request, 'field-claim', session.sub, {
    user: 60,
    ip: 120,
    windowMs: 60 * 60_000,
  })
  if (rateLimitResponse) return rateLimitResponse

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'بيانات الطلب غير صالحة' }, { status: 400 })
  }
  if (!body || typeof body !== 'object' || !('inspectionId' in body) || typeof body.inspectionId !== 'string') {
    return NextResponse.json({ error: 'رقم الطلب مطلوب' }, { status: 400 })
  }

  const user = await getUserById(session.sub)
  if (!user || user.inspectorStatus !== 'approved') {
    return NextResponse.json({ error: 'حسابك لم يُعتمد بعد كفاحص ميداني' }, { status: 403 })
  }

  const inspectionId = body.inspectionId
  const latitude = numberOrNull((body as Record<string, unknown>).latitude)
  const longitude = numberOrNull((body as Record<string, unknown>).longitude)
  const accuracy = numberOrNull((body as Record<string, unknown>).accuracy)
  const maxDistance = numberOrNull((body as Record<string, unknown>).maxDistanceMeters)

  try {
    const verdict = await claimInspectionForField({
      inspectionId,
      inspectorId: session.sub,
      latitude,
      longitude,
      accuracy,
      maxDistanceMeters: maxDistance,
    })

    if (verdict.status === 'ok' || verdict.status === 'already_yours') {
      // Write the claim into the chain. A failure here must not undo a claim
      // that already succeeded, so it is logged and the claim is returned.
      try {
        const recordedAt = new Date().toISOString()
        const content = {
          claimId: verdict.claimId,
          inspectionId,
          inspectorId: session.sub,
          actionType: 'claim' as const,
          actionDetail: '',
          recordedAtRfc3339: recordedAt,
          latitude,
          longitude,
          accuracy,
          payload: { distanceMeters: verdict.status === 'ok' ? verdict.distanceMeters : null },
          prevHash: '',
        }
        await recordFieldAction({
          claimId: verdict.claimId,
          inspectorId: session.sub,
          actionType: 'claim',
          actionDetail: '',
          recordedAtRfc3339: recordedAt,
          deviceMonotonicMs: null,
          latitude,
          longitude,
          accuracy,
          offlineQueued: false,
          payload: content.payload,
          contentHash: await hashFieldAction(content),
        })
      } catch (chainError) {
        console.error('field_claim_chain_write_failed', chainError)
      }

      await logAuditEvent({
        actorId: session.sub,
        eventType: 'field.claim',
        resourceType: 'inspection',
        resourceId: inspectionId,
        metadata: {
          claimId: verdict.claimId,
          distanceMeters: verdict.status === 'ok' ? verdict.distanceMeters : null,
          latitude,
          longitude,
        },
      })
    }

    const httpStatus =
      verdict.status === 'ok' || verdict.status === 'already_yours'
        ? 200
        : verdict.status === 'not_found'
          ? 404
          : verdict.status === 'unavailable'
            ? 503
            : 409

    return NextResponse.json(verdict, { status: httpStatus })
  } catch (error) {
    console.error('Error claiming inspection for field:', error)
    return NextResponse.json({ error: 'خدمة الاستلام الميداني غير متاحة حاليًا' }, { status: 503 })
  }
}
