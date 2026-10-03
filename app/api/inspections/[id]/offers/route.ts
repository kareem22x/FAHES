import { NextRequest, NextResponse } from 'next/server'
import { resolveInspectorSession } from '@/lib/field/access'
import { enforceApiRateLimit } from '@/lib/api-rate-limit'
import { listOpenInspectionsForInspector, submitInspectionOffer } from '@/lib/inspection-store'
import { assertSameOrigin } from '@/lib/origin'
import { getUserById, isApprovedInspector } from '@/lib/user-store'

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const originError = assertSameOrigin(request)
  if (originError) return originError

  const session = await resolveInspectorSession()
  if (!session) {
    return NextResponse.json({ error: 'يجب تسجيل الدخول كفاحص معتمد' }, { status: 401 })
  }
  const rateLimitResponse = await enforceApiRateLimit(request, 'inspection-offer', session.sub, {
    user: 20,
    ip: 60,
    windowMs: 60 * 60_000,
  })
  if (rateLimitResponse) return rateLimitResponse

  const user = await getUserById(session.sub)
  if (!user || !isApprovedInspector(user)) {
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

  /**
   * ⚠️ لا تُبنَ الرسالة على نتيجة هذا الاستعلام وحده.
   *
   * كان الكود يعتمد على `listOpenInspectionsForInspector` ليقرّر «متاح أم لا»،
   * ثم يرسل `unavailable` واحدًا لأي سبب آخر. وهذا بالضبط ما أنتج
   * «الطلب لم يعد متاحًا» في الحالات التي كان الطلب فيها متاحًا فعلًا: القائمة
   * المحسوبة هنا لحظية، والدالة في القاعدة تقرأ الحالة الحقيقية داخل قفل.
   *
   * الآن: هذا الاستعلام يبقى **تحسينًا مبكرًا** يوفّر نداء RPC حين يكون الطلب
   * خارج النطاق أو مقفلًا أصلًا، لكنه لا يُنتج رسالة الخطأ النهائية. القرار
   * النهائي للحالة يأتي من `submitInspectionOffer` — وهي وحدها التي تعرف
   * الفرق بين `closed` (لم يعد مفتوحًا) و`forbidden` (خارج مدنك) و
   * `duplicate` (سبق أن قدّمت) و`not_found`.
   */
  const eligible = await listOpenInspectionsForInspector(user.id, user.inspectorProfile.cities)
  const knownHere = eligible.some((inspection) => inspection.id === id)

  const result = await submitInspectionOffer({
    inspectionId: id,
    inspectorId: user.id,
    inspectorName: user.name,
    price,
    note: typeof note === 'string' ? note.trim() : '',
    cities: user.inspectorProfile.cities,
  })

  if ('error' in result) {
    return offerErrorResponse(result.error ?? 'unknown', result.inspectionStatus, knownHere)
  }

  return NextResponse.json({ success: true, offerId: result.offer.id }, { status: 201 })
}

/**
 * ترجمة نتيجة RPC إلى HTTP + نصّ عربي دقيق.
 *
 * كل فرع يعطي المستخدم ما يحتاجه ليتصرّف: أين الخلل بالضبط، وهل يُصلحه هو أم
 * أن الطلب خرج من يده. الغرض أن نتخلّص نهائيًا من الرسالة العامّة التي كانت
 * تُخفي سببين مختلفين تمامًا تحت نصّ واحد.
 */
function offerErrorResponse(
  reason: string,
  inspectionStatus: string | undefined,
  knownHere: boolean,
): NextResponse {
  switch (reason) {
    // الطلب كان مفتوحًا هنا لكنه لم يعد كذلك في القاعدة ⇒ سبقك فاحص آخر.
    // هذا هو الحال الطبيعي الوحيد الذي تستحقّ فيه «لم يعد متاحًا» أن تُقال.
    case 'closed':
      return NextResponse.json(
        {
          error: 'سبقك فاحص آخر — الطلب لم يعد يقبل عروضًا.',
          reason: 'closed',
          inspectionStatus: inspectionStatus ?? null,
        },
        { status: 409 },
      )

    case 'forbidden':
      return NextResponse.json(
        {
          error: 'الطلب خارج مدن عملك. حدّث مدن التغطية من نطاق العمل ثم أعد المحاولة.',
          reason: 'forbidden',
        },
        { status: 403 },
      )

    case 'duplicate':
      return NextResponse.json(
        { error: 'سبق أن قدمت عرضًا على هذا الطلب.', reason: 'duplicate' },
        { status: 409 },
      )

    case 'invalid_price':
      return NextResponse.json(
        { error: 'أدخل سعرًا بين 50 و100,000 ريال.', reason: 'invalid_price' },
        { status: 400 },
      )

    case 'not_found':
      return NextResponse.json(
        { error: 'لم يُعثر على الطلب. ربما حُذف أو تغيّر رابطه.', reason: 'not_found' },
        { status: 404 },
      )

    // حالة RPC غير معروفة: إن كان الطلب غائبًا عن قائمتنا فالأرجح أنه خارج
    // نطاق المدن، وإلا فالمشكلة عندنا لا عند المستخدم — والرسالة تقول ذلك.
    default:
      return NextResponse.json(
        knownHere
          ? { error: 'تعذّر إرسال العرض. أعد المحاولة، وإن تكرّر فالأمر يحتاج مراجعة.', reason }
          : { error: 'الطلب غير متاح في مدن عملك.', reason },
        { status: knownHere ? 502 : 404 },
      )
  }
}
