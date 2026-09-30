import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { enforceApiRateLimit } from '@/lib/api-rate-limit'
import { listOpenInspectionsForInspector, submitInspectionOffer } from '@/lib/inspection-store'
import { assertSameOrigin } from '@/lib/origin'
import { getUserById } from '@/lib/user-store'

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const originError = assertSameOrigin(request)
  if (originError) return originError

  const session = await getSession()
  if (!session || session.role !== 'inspector') {
    return NextResponse.json({ error: 'يجب تسجيل الدخول كفاحص معتمد' }, { status: 401 })
  }
  const rateLimitResponse = await enforceApiRateLimit(request, 'inspection-offer', session.sub, {
    user: 20,
    ip: 60,
    windowMs: 60 * 60_000,
  })
  if (rateLimitResponse) return rateLimitResponse

  const user = await getUserById(session.sub)
  if (!user || user.role !== 'inspector' || user.inspectorStatus !== 'approved') {
    return NextResponse.json({ error: 'حساب الفاحص غير معتمد' }, { status: 403 })
  }
  if (!user.inspectorProfile?.isOnline) {
    return NextResponse.json({ error: 'فعّل حالة التوفر قبل تقديم عرض' }, { status: 409 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'بيانات العرض غير صالحة' }, { status: 400 })
  }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'بيانات العرض غير صالحة' }, { status: 400 })
  }

  const { price, note } = body as { price?: unknown; note?: unknown }
  if (
    typeof price !== 'number' || !Number.isFinite(price) || price < 50 || price > 100_000 ||
    (note !== undefined && (typeof note !== 'string' || note.length > 500))
  ) {
    return NextResponse.json({ error: 'أدخل سعرًا بين 50 و100,000 ريال، وملاحظة لا تتجاوز 500 حرف' }, { status: 400 })
  }

  const { id } = await context.params
  const eligible = await listOpenInspectionsForInspector(user.id, user.inspectorProfile.cities)
  if (!eligible.some((inspection) => inspection.id === id)) {
    return NextResponse.json({ error: 'الطلب غير متاح في مدن عملك أو لم يعد مفتوحًا' }, { status: 404 })
  }

  const result = await submitInspectionOffer({
    inspectionId: id,
    inspectorId: user.id,
    inspectorName: user.name,
    price,
    note: typeof note === 'string' ? note.trim() : '',
    cities: user.inspectorProfile.cities,
  })
  if ('error' in result) {
    const status = result.error === 'not_found' ? 404 : result.error === 'duplicate' ? 409 : 409
    return NextResponse.json({
      error: result.error === 'duplicate' ? 'سبق أن قدمت عرضًا لهذا الطلب' : 'الطلب لم يعد متاحًا',
    }, { status })
  }

  return NextResponse.json({ success: true, offerId: result.offer.id }, { status: 201 })
}
