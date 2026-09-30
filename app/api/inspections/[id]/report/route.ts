import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { enforceApiRateLimit } from '@/lib/api-rate-limit'
import { assertSameOrigin } from '@/lib/origin'
import { inspectionResultOptions, expectedChecklistKeys } from '@/lib/inspection-report'
import { getInspectionReport, saveInspectionReport } from '@/lib/inspection-report-store'

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession()
  if (!session || (session.role !== 'customer' && session.role !== 'inspector')) {
    return NextResponse.json({ error: 'يجب تسجيل الدخول لعرض التقرير' }, { status: 401 })
  }

  try {
    const { id } = await context.params
    const report = await getInspectionReport({
      inspectionId: id,
      requesterId: session.sub,
      role: session.role,
    })
    if (!report) return NextResponse.json({ error: 'التقرير غير متاح لهذا الحساب أو لم يصدر بعد' }, { status: 404 })
    return NextResponse.json(report, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    console.error('Error loading inspection report:', error)
    return NextResponse.json({ error: 'تعذر تحميل التقرير حاليًا' }, { status: 503 })
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const originError = assertSameOrigin(request)
  if (originError) return originError

  const session = await getSession()
  if (!session || session.role !== 'inspector') {
    return NextResponse.json({ error: 'حفظ التقرير متاح للفاحص المسند إليه الطلب فقط' }, { status: 401 })
  }
  const rateLimitResponse = await enforceApiRateLimit(request, 'inspection-report-save', session.sub, {
    user: 40,
    ip: 120,
    windowMs: 60 * 60_000,
  })
  if (rateLimitResponse) return rateLimitResponse

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'بيانات التقرير غير صالحة' }, { status: 400 })
  }
  if (!body || typeof body !== 'object' || !('checklist' in body) || !('notes' in body) ||
    !('submit' in body) || !body.checklist || typeof body.checklist !== 'object' ||
    Array.isArray(body.checklist) || typeof body.notes !== 'string' ||
    body.notes.length > 2000 || typeof body.submit !== 'boolean') {
    return NextResponse.json({ error: 'تحقق من بيانات التقرير والملاحظات' }, { status: 400 })
  }

  const checklist = body.checklist as Record<string, unknown>
  if (Object.entries(checklist).some(([key, value]) =>
    !expectedChecklistKeys.includes(key) ||
    typeof value !== 'string' ||
    !(inspectionResultOptions as readonly string[]).includes(value)
  )) {
    return NextResponse.json({ error: 'تحتوي قائمة الفحص على بند أو نتيجة غير صالحة' }, { status: 400 })
  }

  try {
    const { id } = await context.params
    const status = await saveInspectionReport({
      inspectionId: id,
      inspectorId: session.sub,
      checklist: checklist as Record<string, string>,
      notes: body.notes,
      submit: body.submit,
    })
    if (status === 'ok') return NextResponse.json({ success: true, submitted: body.submit })
    if (status === 'incomplete_report') {
      return NextResponse.json({ error: 'أكمل جميع بنود الفحص قبل إرسال التقرير' }, { status: 400 })
    }
    const statusCode = status === 'not_found' ? 404 : status === 'forbidden' ? 403 : 409
    return NextResponse.json({ error: 'لا يمكن حفظ التقرير في حالة الطلب الحالية' }, { status: statusCode })
  } catch (error) {
    console.error('Error saving inspection report:', error)
    return NextResponse.json({ error: 'تعذر حفظ التقرير حاليًا' }, { status: 503 })
  }
}
