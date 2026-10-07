import 'server-only'

import {
  fromHalalas,
  isSettlementStatus,
  mapMoyasarStatus,
  paymentFailureReason,
  paymentMethodKey,
  type SettlementStatus,
} from '@/lib/payments/payment-rules'
import { fetchPayment, inspectionIdFromMetadata } from '@/lib/payments/moyasar-client'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import type { Json } from '@/lib/supabase/database.types'
import type { InspectionStatus } from '@/lib/inspection-store'
import type { PaymentStatus } from '@/lib/payments/payment-rules'

/**
 * تسوية الدفع — التنسيق بين Moyasar والقاعدة.
 *
 * ── ترتيب الثقة ────────────────────────────────────────────────────────────
 *
 *   1. نستعلم عن الدفعة من Moyasar REST بالمفتاح السرّي. هذا هو المصدر الوحيد
 *      الموثوق: لا نصدّق مبلغًا ولا حالة وصلت من المتصفح أو من جسم الـWebhook.
 *   2. نقارن معرّف الطلب في `metadata` بالطلب المطلوب. هذا يمنع دفعًا لطلب
 *      أن يُطبَّق على طلب آخر.
 *   3. دالة القاعدة `settle_inspection_payment` تقرّر أخيرًا: تقرأ سعر العرض
 *      المقبول، تتحقق من المبلغ والعملة، وتمنع التراجع عن `paid`. القرار هناك
 *      لأنها الجهة الوحيدة التي تملك قفل الصف.
 *
 * ── لماذا لا يُعاد كتابة جدول الانتقالات هنا ──────────────────────────────
 *
 * لأن نسختين من قاعدة أمنية تتباعدان بصمت. هذا بالضبط ما حدث مع مفردات
 * `inspections.status`. هنا نقرأ **نتيجة** القرار فقط ونترجمها إلى HTTP ورسالة.
 */

export type SettleOutcome = {
  status: SettlementStatus
  /** حالة الدفع قبل التسوية كما سجّلتها القاعدة. `null` عند الفشل. */
  previousStatus: string | null
  /** معرّف الطلب الذي طُبِّقت عليه التسوية، عند النجاح. */
  inspectionId: string | null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

export type CustomerPaymentTarget = {
  id: string
  orderStatus: InspectionStatus
  paymentStatus: PaymentStatus
  acceptedOfferId: string | null
}

/**
 * الطلب كما يملكه هذا العميل، أو `null`.
 *
 * الشرط `customer_id = p_customer_id` **جزء من الاستعلام** لا فحصًا لاحقًا في
 * الذاكرة. لو جلبنا الصف ثم قارنّا المالك في Node، لبقي المالك مسألة انضباط
 * برمجي؛ هنا القاعدة نفسها لا تُعيد صفًّا لا يملكه المستدعي.
 */
export async function getCustomerPaymentTarget(
  inspectionId: string,
  customerId: string,
): Promise<CustomerPaymentTarget | null> {
  const { data, error } = await getSupabaseAdmin()
    .from('inspections')
    .select('id, status, payment_status, accepted_offer_id')
    .eq('id', inspectionId)
    .eq('customer_id', customerId)
    .maybeSingle()

  if (error) {
    console.error('[payments] failed to load payment target:', error.message)
    return null
  }
  if (!data) return null

  return {
    id: data.id,
    orderStatus: data.status,
    paymentStatus: data.payment_status,
    acceptedOfferId: data.accepted_offer_id,
  }
}

/**
 * يسوّي دفعة واحدة: يجلبها من Moyasar ثم يمرّرها إلى دالة القاعدة.
 *
 * `expectedInspectionId` اختياري لأن المستدعيين مختلفان:
 *   * مسار الـWebhook لا يعرف الطلب مسبقًا ⇒ يمرّر `null` ويُعتمد على `metadata`.
 *   * مسار `/api/checkout` يعرف الطلب من الجلسة ⇒ يمرّره ليتحقّق من التطابق.
 *
 * يُعيد دائمًا نتيجة مُصنَّفة، ولا يرمي. الفشل الشبكي يصبح `unknown` (502) كي
 * يعيد Moyasar الإرسال، بدل أن يسقط المسار بخطأ 500 بلا سياق.
 */
export async function settlePaymentFromProvider(input: {
  paymentId: string
  expectedInspectionId?: string | null
}): Promise<SettleOutcome> {
  let payment
  try {
    payment = await fetchPayment(input.paymentId)
  } catch (error) {
    // لا يُسجَّل المفتاح السرّي: الرسالة تحمل كود الحالة ونصّ Moyasar فقط.
    console.error('[payments] failed to fetch payment from Moyasar:', {
      paymentId: input.paymentId,
      error: error instanceof Error ? error.message : String(error),
    })
    return { status: 'unknown', previousStatus: null, inspectionId: null }
  }

  const nextStatus = mapMoyasarStatus(payment.status)
  if (!nextStatus) {
    // حالة لم نسمّها. لا نخمّن: قد يعني المجهول أن مال العميل تحرّك فعلًا.
    console.error('[payments] unmappable Moyasar status — refusing to settle', {
      paymentId: payment.id,
      moyasarStatus: payment.status,
    })
    return { status: 'unknown', previousStatus: null, inspectionId: null }
  }

  const metadataInspectionId = inspectionIdFromMetadata(payment)
  const expected = input.expectedInspectionId?.trim() || null

  // الدفعة تحمل طلبًا آخر ⇒ لا تسوية. الرفض هنا مقصود: قبولها كان يسمح
  // بتطبيق دفعة رخيصة على طلب غالٍ لو تصادف تساوي المبالغ.
  if (expected && metadataInspectionId && metadataInspectionId !== expected) {
    console.error('[payments] payment metadata points at a different order — refusing', {
      paymentId: payment.id,
      metadataInspectionId,
      expectedInspectionId: expected,
    })
    return { status: 'not_found', previousStatus: null, inspectionId: null }
  }

  const { data, error } = await getSupabaseAdmin().rpc('settle_inspection_payment', {
    p_payment_id: payment.id,
    p_payment_status: nextStatus,
    // القاعدة تقارن بـ`offers.price` بالريال، وMoyasar يتكلّم بالهللة.
    p_amount: fromHalalas(payment.amount),
    p_currency: payment.currency,
    p_method: paymentMethodKey(payment.source),
    p_failure_reason: paymentFailureReason(payment.source, payment.description),
    p_paid_at: payment.updated_at ?? payment.created_at,
    p_inspection_id: metadataInspectionId ?? expected,
  })

  if (error) {
    console.error('[payments] settle_inspection_payment failed:', {
      paymentId: payment.id,
      message: error.message,
      code: error.code,
    })
    return { status: 'unknown', previousStatus: null, inspectionId: null }
  }

  const result = asRecord(data as Json)
  const raw = result?.status

  if (!isSettlementStatus(raw)) {
    console.error('[payments] unexpected settlement result shape:', { paymentId: payment.id, raw })
    return { status: 'unknown', previousStatus: null, inspectionId: null }
  }

  const previousStatus = typeof result?.previousStatus === 'string' ? result.previousStatus : null
  const inspectionId = typeof result?.inspectionId === 'string' ? result.inspectionId : null

  if (raw === 'amount_mismatch') {
    // يستحق ضجّة أعلى من بقية الفشل: إما عبث بمبلغ النموذج في المتصفح، أو خطأ
    // في تحويل الوحدات. كلاهما لا يجوز أن يمرّ صامتًا.
    console.error('[payments] amount mismatch — payment NOT settled', {
      paymentId: payment.id,
      expected: result?.expected,
      received: result?.received,
    })
  }

  return { status: raw, previousStatus, inspectionId }
}
