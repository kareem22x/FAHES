import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { enforceApiRateLimit } from '@/lib/api-rate-limit'
import { assertSameOrigin } from '@/lib/origin'
import {
  settlementErrorBody,
  settlementHttpStatus,
  settlementIsSuccess,
  settlementMessage,
  type SettlementStatus,
} from '@/lib/payments/payment-rules'
import { getCustomerPaymentTarget, settlePaymentFromProvider } from '@/lib/payments/payment-store'

/**
 * تأكيد دفع طلب فحص.
 *
 * ── لماذا هذا المسار موجود أصلًا ───────────────────────────────────────────
 *
 * نموذج Moyasar يعمل في المتصفح ويُنشئ الدفعة بمفتاح `publishable` — وهو
 * مفتاح عام بطبيعته. لذلك لا يجوز أن يقرّر المتصفح أن الدفع نجح: كل ما يصل
 * منه قابل للعبث (المبلغ، المعرّف، الحالة). هذا المسار هو الطرف الموثوق:
 * يستعلم عن الدفعة من Moyasar بالمفتاح السرّي، ويتحقّق من ملكية الطلب، ثم
 * يترك دالة القاعدة تقرّر التسوية.
 *
 * ── متى يُنادى ─────────────────────────────────────────────────────────────
 *
 *   * عند العودة من `callback_url` بعد نجاح الدفع (المسار الأساسي).
 *   * من `on_completed` في النموذج، لتأكيد أسرع قبل إعادة التوجيه.
 *
 * النداءان يسوّيان **نفس** الدفعة، لذا التسوية idempotent: الثاني يقرأ
 * `already_paid` ويعتبرها نجاحًا. هذا مقصود — إسقاط أحدهما كان يترك الحالة
 * معلّقة كلما فُقد اتصال أثناء إعادة التوجيه.
 *
 * `/api/*` خارج البادئات التي يحميها `proxy.ts`، فكل الفحوص هنا إلزامية.
 */

/** حدّ أعلى لطول المعرّفات — يمنع تمرير نصّ ضخم إلى استعلام أو عنوان URL. */
const MAX_ID_LENGTH = 128

function asId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed === '' || trimmed.length > MAX_ID_LENGTH) return null
  return trimmed
}

export async function POST(request: NextRequest) {
  const originError = assertSameOrigin(request)
  if (originError) return originError

  const session = await getSession()
  if (!session || session.role !== 'customer') {
    return NextResponse.json(
      { error: 'سجّل الدخول كعميل لتأكيد الدفع.', reason: 'unauthenticated', ok: false },
      { status: 401 },
    )
  }

  const rateLimitResponse = await enforceApiRateLimit(request, 'payment-checkout', session.sub, {
    // سخيّ عن قصد: صفحة العودة قد تُنادى أكثر من مرة عند إعادة التحميل أو
    // الرجوع في المتصفح، والردّ عليها idempotent ورخيص.
    user: 60,
    ip: 120,
    windowMs: 15 * 60_000,
  })
  if (rateLimitResponse) return rateLimitResponse

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'جسم الطلب غير صالح.', reason: 'invalid_body', ok: false },
      { status: 400 },
    )
  }

  const record = body && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {}
  const inspectionId = asId(record.inspectionId)
  const paymentId = asId(record.paymentId)

  if (!inspectionId || !paymentId) {
    return NextResponse.json(
      { error: 'معرّف الطلب ومعرّف الدفعة مطلوبان.', reason: 'invalid_body', ok: false },
      { status: 400 },
    )
  }

  // الملكية أولًا: قبل أي نداء خارجي وقبل أي كتابة. عميل يحاول تسوية دفعة على
  // طلب ليس له يحصل على 404 بلا أن يلمس شيء.
  const target = await getCustomerPaymentTarget(inspectionId, session.sub)
  if (!target) {
    return NextResponse.json(
      { error: 'لم نجد هذا الطلب ضمن طلباتك.', reason: 'not_found', ok: false },
      { status: 404 },
    )
  }

  // مسار مختصر: مدفوع سلفًا ⇒ لا داعي لنداء Moyasar. الردّ يبقى «نجاح» لأن
  // هذا ما يعنيه للمستخدم، وإظهار خطأ هنا كان سيجعل كل إعادة تحميل تبدو عطلًا.
  if (target.paymentStatus === 'paid') {
    return NextResponse.json({
      ok: true,
      reason: 'already_paid' satisfies SettlementStatus,
      message: settlementMessage('already_paid'),
    })
  }

  const outcome = await settlePaymentFromProvider({
    paymentId,
    expectedInspectionId: inspectionId,
  })

  const payload = {
    ok: settlementIsSuccess(outcome.status),
    reason: outcome.status,
    message: settlementMessage(outcome.status),
    ...(settlementIsSuccess(outcome.status) ? {} : settlementErrorBody(outcome.status)),
  }

  return NextResponse.json(payload, { status: settlementHttpStatus(outcome.status) })
}
