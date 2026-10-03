import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { enforceApiRateLimit } from '@/lib/api-rate-limit'
import { acceptInspectionOffer } from '@/lib/inspection-store'
import { assertSameOrigin } from '@/lib/origin'

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; offerId: string }> },
) {
  const originError = assertSameOrigin(request)
  if (originError) return originError

  const session = await getSession()
  if (!session || session.role !== 'customer') {
    return NextResponse.json({ error: 'يجب تسجيل الدخول كعميل' }, { status: 401 })
  }
  const rateLimitResponse = await enforceApiRateLimit(request, 'inspection-offer-accept', session.sub, {
    user: 20,
    ip: 60,
    windowMs: 60 * 60_000,
  })
  if (rateLimitResponse) return rateLimitResponse

  const { id, offerId } = await context.params
  const result = await acceptInspectionOffer({ inspectionId: id, offerId, customerId: session.sub })
  if ('error' in result) return acceptErrorResponse(result.error ?? 'unknown')

  return NextResponse.json({ success: true, inspectorName: result.offer.inspectorName })
}

/**
 * نفس مبدأ مسار تقديم العرض: رسالة واحدة لكل سبب.
 *
 * كان `forbidden` (الطلب ليس لك) و`closed` (أُسند للتوّ) و`not_found` تُترجم
 * جميعًا إلى «تعذر قبول العرض؛ ربما تم إسناد الطلب بالفعل». عميل ينظر إلى
 * طلب ليس له يقرأ أن أحدًا سبقه — وهذا تشخيص خاطئ يمنعه من البحث عن السبب
 * الصحيح. الآن كل سبب يقول نفسه.
 */
function acceptErrorResponse(reason: string): NextResponse {
  switch (reason) {
    case 'not_found':
      return NextResponse.json(
        { error: 'لم يُعثر على الطلب. ربما حُذف أو تغيّر رابطه.', reason },
        { status: 404 },
      )

    case 'offer_not_found':
      return NextResponse.json(
        { error: 'لم يُعثر على هذا العرض — ربما سحبه الفاحص.', reason },
        { status: 404 },
      )

    case 'forbidden':
      return NextResponse.json(
        { error: 'هذا الطلب ليس ضمن طلباتك.', reason },
        { status: 403 },
      )

    case 'closed':
      return NextResponse.json(
        { error: 'أُسند هذا الطلب لفاحص آخر بالفعل.', reason },
        { status: 409 },
      )

    default:
      return NextResponse.json(
        { error: 'تعذّر قبول العرض. أعد المحاولة، وإن تكرّر فالأمر يحتاج مراجعة.', reason },
        { status: 502 },
      )
  }
}
