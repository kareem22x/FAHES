import { NextRequest, NextResponse } from 'next/server'
import { resolveInspectorSession } from '@/lib/field/access'
import { enforceApiRateLimit } from '@/lib/api-rate-limit'
import { assertSameOrigin } from '@/lib/origin'
import { advanceInspectionStatus } from '@/lib/inspection-report-store'

const allowedTransitions = ['on_the_way', 'arrived', 'inspecting'] as const

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
  const rateLimitResponse = await enforceApiRateLimit(request, 'inspection-status', session.sub, {
    user: 40,
    ip: 120,
    windowMs: 60 * 60_000,
  })
  if (rateLimitResponse) return rateLimitResponse

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'بيانات الحالة غير صالحة' }, { status: 400 })
  }
  if (!body || typeof body !== 'object' || !('status' in body) ||
    typeof body.status !== 'string' ||
    !allowedTransitions.includes(body.status as typeof allowedTransitions[number])) {
    return NextResponse.json({ error: 'حالة الزيارة غير صالحة' }, { status: 400 })
  }

  try {
    const { id } = await context.params
    const result = await advanceInspectionStatus({
      inspectionId: id,
      inspectorId: session.sub,
      nextStatus: body.status as typeof allowedTransitions[number],
    })
    if (result === 'ok') return NextResponse.json({ success: true, status: body.status })
    const statusCode = result === 'not_found' ? 404 : result === 'forbidden' ? 403 : 409
    return NextResponse.json({ error: 'تعذر تحديث حالة الزيارة؛ حدّث الصفحة وحاول مجددًا' }, { status: statusCode })
  } catch (error) {
    console.error('Error advancing inspection status:', error)
    return NextResponse.json({ error: 'خدمة الطلبات غير متاحة حاليًا' }, { status: 503 })
  }
}
