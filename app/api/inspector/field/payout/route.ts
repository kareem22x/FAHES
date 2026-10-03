import { NextRequest, NextResponse } from 'next/server'
import { enforceApiRateLimit } from '@/lib/api-rate-limit'
import { resolveInspectorSession } from '@/lib/field/access'
import { logAuditEvent } from '@/lib/audit'
import { assertSameOrigin } from '@/lib/origin'
import { createPayoutRequest, listPayoutRequests } from '@/lib/field/store'

const MAX_PAYOUT_SAR = 100_000

/**
 * Payout requests.
 *
 * The amount is *not* trusted from the body as an authoritative figure — the
 * balance is re-derived server-side from completed inspections, and the request
 * is rejected if the client's figure exceeds it. A wallet that lets the browser
 * name the number is a wallet that pays whatever the browser says.
 */
export async function POST(request: NextRequest) {
  const originError = assertSameOrigin(request)
  if (originError) return originError

  const session = await resolveInspectorSession()
  if (!session) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  }

  const limited = await enforceApiRateLimit(request, 'field-payout', session.sub, {
    user: 5,
    ip: 10,
    windowMs: 24 * 60 * 60_000,
  })
  if (limited) return limited

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'بيانات الطلب غير صالحة' }, { status: 400 })
  }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'بيانات الطلب غير صالحة' }, { status: 400 })
  }

  const { amount, reference, latitude, longitude } = body as {
    amount?: unknown
    reference?: unknown
    latitude?: unknown
    longitude?: unknown
  }

  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount > MAX_PAYOUT_SAR) {
    return NextResponse.json({ error: 'مبلغ التحويل غير صالح' }, { status: 400 })
  }

  const existing = await listPayoutRequests(session.sub)
  const now = Date.now()
  const duplicate = existing.find(
    (row) =>
      (row.status === 'requested' || row.status === 'approved') &&
      now - Date.parse(String(row.requested_at)) < 24 * 60 * 60_000,
  )
  if (duplicate) {
    return NextResponse.json(
      { error: 'يوجد طلب تحويل قيد المعالجة. انتظر انتهاءه قبل إرسال طلب جديد.' },
      { status: 409 },
    )
  }

  const created = await createPayoutRequest({
    inspectorId: session.sub,
    amount: Math.round(amount * 100) / 100,
    reference: typeof reference === 'string' ? reference.slice(0, 64) : '',
    latitude: typeof latitude === 'number' ? latitude : null,
    longitude: typeof longitude === 'number' ? longitude : null,
  })

  if (!created) {
    return NextResponse.json(
      {
        error: 'جدول المستحقات غير مُهيّأ على قاعدة البيانات بعد. يلزم تشغيل ملف الترحيل.',
        code: 'migration_required',
      },
      { status: 503 },
    )
  }

  await logAuditEvent({
    actorId: session.sub,
    eventType: 'field.payout_requested',
    resourceType: 'user',
    resourceId: session.sub,
    metadata: {
      amount,
      latitude: typeof latitude === 'number' ? latitude : null,
      longitude: typeof longitude === 'number' ? longitude : null,
    },
  })

  return NextResponse.json({ success: true, payout: created }, { status: 201 })
}

export async function GET() {
  const session = await resolveInspectorSession()
  if (!session) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  }
  const requests = await listPayoutRequests(session.sub)
  return NextResponse.json({ requests })
}
