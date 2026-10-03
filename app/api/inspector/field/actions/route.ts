import { NextRequest, NextResponse } from 'next/server'
import { resolveInspectorSession } from '@/lib/field/access'
import { enforceApiRateLimit } from '@/lib/api-rate-limit'
import { assertSameOrigin } from '@/lib/origin'
import { hashFieldAction } from '@/lib/field/chain'
import { getLiveClaimForInspector, recordFieldAction } from '@/lib/field/store'
import type { FieldActionType } from '@/lib/field/types'

const allowedActions: FieldActionType[] = [
  'verify', 'start', 'status_change', 'media_upload', 'media_delete',
  'report_save', 'report_submit', 'cancel', 'handover_request',
  'handover_accept', 'sync', 'note',
]

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * Append a field action to the hash chain.
 *
 * This is the offline queue's landing point. The client hashes and queues an
 * action before it ever has a connection, so by the time it arrives here the
 * hash already exists and the server's job is to extend the chain rather than
 * to recompute it — recomputing would defeat the point, which is that the
 * record was sealed on the device at the moment the action happened.
 *
 * The claim must belong to the caller. Enforced here and again inside the RPC.
 */
export async function POST(request: NextRequest) {
  const originError = assertSameOrigin(request)
  if (originError) return originError

  const session = await resolveInspectorSession()
  if (!session) {
    return NextResponse.json({ error: 'هذه العملية للفاحص المعتمد فقط' }, { status: 401 })
  }

  const rateLimitResponse = await enforceApiRateLimit(request, 'field-action', session.sub, {
    user: 600,
    ip: 900,
    windowMs: 60 * 60_000,
  })
  if (rateLimitResponse) return rateLimitResponse

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'بيانات الإجراء غير صالحة' }, { status: 400 })
  }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'بيانات الإجراء غير صالحة' }, { status: 400 })
  }

  const input = body as Record<string, unknown>
  if (typeof input.claimId !== 'string' || typeof input.inspectionId !== 'string') {
    return NextResponse.json({ error: 'معرّف الطلب أو المطالبة مفقود' }, { status: 400 })
  }
  if (typeof input.actionType !== 'string' || !allowedActions.includes(input.actionType as FieldActionType)) {
    return NextResponse.json({ error: 'نوع الإجراء غير مدعوم' }, { status: 400 })
  }
  if (typeof input.contentHash !== 'string' || !input.contentHash.startsWith('sha256:')) {
    return NextResponse.json({ error: 'بصمة الإجراء مفقودة' }, { status: 400 })
  }
  if (typeof input.recordedAtRfc3339 !== 'string' || Number.isNaN(Date.parse(input.recordedAtRfc3339))) {
    return NextResponse.json({ error: 'وقت الإجراء غير صالح' }, { status: 400 })
  }

  const claim = await getLiveClaimForInspector(session.sub, input.inspectionId)
  if (!claim || claim.id !== input.claimId) {
    return NextResponse.json({ error: 'لا توجد مطالبة فعّالة لهذا الطلب' }, { status: 403 })
  }

  const payload =
    input.payload && typeof input.payload === 'object' && !Array.isArray(input.payload)
      ? (input.payload as Record<string, unknown>)
      : {}

  try {
    const result = await recordFieldAction({
      claimId: claim.id,
      inspectorId: session.sub,
      actionType: input.actionType as FieldActionType,
      actionDetail: typeof input.actionDetail === 'string' ? input.actionDetail : '',
      recordedAtRfc3339: input.recordedAtRfc3339,
      deviceMonotonicMs: numberOrNull(input.deviceMonotonicMs),
      latitude: numberOrNull(input.latitude),
      longitude: numberOrNull(input.longitude),
      accuracy: numberOrNull(input.accuracy),
      offlineQueued: input.offlineQueued === true,
      payload,
      contentHash: input.contentHash,
    })

    if (result.status !== 'ok') {
      return NextResponse.json({ error: 'تعذّر تثبيت الإجراء في السجل' }, { status: 409 })
    }
    return NextResponse.json({ success: true, actionId: result.actionId, prevHash: result.prevHash })
  } catch (error) {
    console.error('Error recording field action:', error)
    return NextResponse.json({ error: 'سجل التدقيق غير متاح حاليًا' }, { status: 503 })
  }
}

/**
 * Also accepts a server-generated hash for an action that originated on the
 * server (a status transition triggered by an API call). Kept as a separate
 * export so the queue path above stays single-purpose.
 */
export async function sealAction(input: {
  claimId: string
  inspectionId: string
  inspectorId: string
  actionType: FieldActionType
  actionDetail: string
  latitude: number | null
  longitude: number | null
  accuracy: number | null
  payload: Record<string, unknown>
}) {
  const recordedAt = new Date().toISOString()
  const contentHash = await hashFieldAction({
    claimId: input.claimId,
    inspectionId: input.inspectionId,
    inspectorId: input.inspectorId,
    actionType: input.actionType,
    actionDetail: input.actionDetail,
    recordedAtRfc3339: recordedAt,
    latitude: input.latitude,
    longitude: input.longitude,
    accuracy: input.accuracy,
    payload: input.payload,
    prevHash: '',
  })
  return recordFieldAction({
    ...input,
    recordedAtRfc3339: recordedAt,
    deviceMonotonicMs: null,
    offlineQueued: false,
    contentHash,
  })
}
