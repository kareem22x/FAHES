import { NextRequest, NextResponse } from 'next/server'
import {
  parseWebhookEvent,
  settlementHttpStatus,
  settlementIsSuccess,
  settlementMessage,
  verifyWebhookSecret,
  webhookHttpStatus,
  webhookMessage,
  type WebhookRejection,
} from '@/lib/payments/payment-rules'
import { settlePaymentFromProvider } from '@/lib/payments/payment-store'

/**
 * إشعارات دفع Moyasar.
 *
 * ── المصادقة ───────────────────────────────────────────────────────────────
 *
 * لا يوجد توقيع HMAC في ترويسة. Moyasar يضع رمزًا سرًّا **حقلًا عاديًا داخل
 * جسم JSON** باسم `secret_token`، ويجب لصق نفس القيمة في لوحة Moyasar
 * (Settings ← Webhooks ← Secret Token). المقارنة في زمن ثابت (`verifyWebhookSecret`)،
 * والفشل مُغلق: رمز غير مضبوط عندنا ⇒ رفض كل الإشعارات.
 *
 * ── لماذا لا يُصدَّق الجسم ─────────────────────────────────────────────────
 *
 * الرمز يثبت أن الإشعار من Moyasar، لكنه لا يجعل قيمه صحيحة الآن: إشعار قد
 * يتأخّر، ويصل بعد غيره، أو يصف حالة تجاوزها الزمن. لذلك نأخذ من الجسم
 * **معرّف الدفعة فقط**، ثم نعيد جلب الدفعة من REST ونحسم من حالتها الحقيقية.
 *
 * ── سرعة الردّ ─────────────────────────────────────────────────────────────
 *
 * Moyasar ينتظر 2xx ثم يعيد المحاولة خمس مرات إضافية قبل أن يُسقط الإشعار.
 * لذلك العمل هنا محصور في نداءين: جلب الدفعة، ثم نداء دالة التسوية. لا بريد،
 * ولا إشعارات، ولا أي عمل خلفي مؤجَّل.
 *
 * ── ترميز الردّ ────────────────────────────────────────────────────────────
 *
 * نفس `settlementHttpStatus` المستخدم في `/api/checkout` — مصدر واحد لترميز
 * نتائج التسوية، فلا يتباعد المساران:
 *
 *   200 نجاح (أو مدفوع سلفًا)      — لا إعادة محاولة
 *   404 لا طلب مرتبط بالدفعة        — يظهر في لوحة Moyasar
 *   409 مبلغ/عرض غير مطابق          — يظهر في لوحة Moyasar
 *   502 تعذّر الجلب أو حالة مجهولة  — إعادة المحاولة مطلوبة فعلًا
 */

function reject(reason: WebhookRejection): NextResponse {
  return NextResponse.json(
    { ok: false, error: webhookMessage(reason), reason },
    { status: webhookHttpStatus(reason) },
  )
}

export async function POST(request: NextRequest) {
  // الرمز يُقرأ من البيئة هنا لا في وحدة نقية: `lib/payments/payment-rules.ts`
  // تبقى بلا `process.env` لتظلّ قابلة للاختبار مباشرةً.
  const expectedSecret = process.env.MOYASAR_WEBHOOK_SECRET

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return reject('malformed_body')
  }

  // الرمز يُفحص قبل الشكل: لو فحصنا الشكل أولًا لقرأ من يضبط الـWebhook لأول
  // مرة «جسم غير صالح» بينما المشكلة رمز خاطئ — وهو الخطأ الأكثر شيوعًا هنا.
  const received = body && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>).secret_token
    : undefined
  if (!verifyWebhookSecret(received, expectedSecret)) {
    console.error('[payments:webhook] rejected — secret token mismatch or not configured', {
      configured: Boolean(expectedSecret?.trim()),
      // لا يُطبع الرمز ولا جزء منه.
    })
    return reject(expectedSecret?.trim() ? 'invalid_secret' : 'not_configured')
  }

  const parsed = parseWebhookEvent(body)
  if (!parsed.ok) {
    console.error('[payments:webhook] rejected — could not read the payload', {
      reason: parsed.reason,
    })
    return reject(parsed.reason)
  }

  const { event } = parsed

  // الحسم من المصدر لا من الإشعار. `event.declaredStatus` و`event.eventType`
  // تلميحات للتسجيل فقط؛ لا يُبنى عليهما قرار.
  const outcome = await settlePaymentFromProvider({ paymentId: event.paymentId })

  const ok = settlementIsSuccess(outcome.status)

  if (!ok) {
    console.error('[payments:webhook] settlement did not complete', {
      paymentId: event.paymentId,
      declaredInspectionId: event.inspectionId,
      eventType: event.eventType,
      declaredStatus: event.declaredStatus,
      live: event.live,
      settlement: outcome.status,
    })
  }

  return NextResponse.json(
    {
      ok,
      reason: outcome.status,
      message: settlementMessage(outcome.status),
    },
    { status: settlementHttpStatus(outcome.status) },
  )
}

/**
 * Moyasar لا يرسل GET إلى هذا العنوان. الردّ الصريح يمنع أي وسيط من تفسير
 * 405 الافتراضي كأنه عطل في النشر.
 */
export function GET() {
  return NextResponse.json(
    { ok: false, error: 'هذا العنوان يستقبل إشعارات POST من Moyasar فقط.', reason: 'method_not_allowed' },
    { status: 405 },
  )
}
