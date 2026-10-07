/**
 * حالات نتيجة الدفع — وحدات العرض.
 *
 * منفصلة عن `payment-rules.ts` لسبب واحد: هذه الوحدة **يستوردها مكوّن عميل**.
 * `payment-rules.ts` تستورد `lib/web-crypto.ts` (لمطابقة رمز الـWebhook في زمن
 * ثابت)، ولو استوردها المكوّن لسُحبت `web-crypto` ومنطق التحقق من الـWebhook
 * إلى حزمة المتصفح بلا داع.
 *
 * لا شيء هنا سرّي، ولا شيء منها يقرّر قبولًا أو رفضًا — نصوص وترجمة فقط.
 */

export const PAYMENT_OUTCOMES = ['success', 'failed', 'cancelled', 'pending', 'invalid'] as const
export type PaymentOutcome = (typeof PAYMENT_OUTCOMES)[number]

export function isPaymentOutcome(value: unknown): value is PaymentOutcome {
  return typeof value === 'string' && (PAYMENT_OUTCOMES as readonly string[]).includes(value)
}

/**
 * جملة واحدة لكل حالة. لا تُدمج حالتان في رسالة عامّة.
 *
 * رسالتا `failed` و`cancelled` تُصرّحان صراحةً بعدم الخصم، لأن هذا أول ما
 * يقلق عليه العميل بعد دفع لم يكتمل.
 */
export function paymentOutcomeMessage(outcome: PaymentOutcome): string {
  switch (outcome) {
    case 'success':
      return 'تمت عملية الدفع بنجاح. شكرًا لك، وسيبدأ الفاحص بالتواصل معك.'
    case 'failed':
      return 'لم تكتمل عملية الدفع. لم يُخصم أي مبلغ — يمكنك المحاولة ببطاقة أخرى.'
    case 'cancelled':
      return 'ألغيت عملية الدفع. لم يُخصم أي مبلغ، ويمكنك الدفع في أي وقت.'
    case 'pending':
      return 'الدفعة قيد المعالجة. سنحدّث حالة الطلب تلقائيًا فور تأكيدها.'
    default:
      return 'تعذّر قراءة نتيجة الدفع. تحقّق من حالة الطلب بعد قليل.'
  }
}

export type OutcomeTone = 'success' | 'error' | 'info'

export function paymentOutcomeTone(outcome: PaymentOutcome): OutcomeTone {
  if (outcome === 'success') return 'success'
  if (outcome === 'failed' || outcome === 'invalid') return 'error'
  return 'info'
}

/**
 * الاسم العربي لطريقة الدفع.
 *
 * تعيش هنا لا في `payment-rules.ts` لأنها **نصّ عرض** يستدعيه مكوّن العميل
 * وبطاقة الطلب معًا، و`payment-rules.ts` تستورد `web-crypto` فلا تصلح للمتصفح.
 *
 * تُعيد نصًّا غير فارغ دائمًا — حتى لمفتاح مجهول — لأن خانة فارغة في إيصال
 * الدفع تبدو كعطل.
 */
export function paymentMethodLabel(key: unknown): string {
  switch (key) {
    case 'mada':
      return 'مدى'
    case 'visa':
      return 'فيزا'
    case 'mastercard':
      return 'ماستركارد'
    case 'unionpay':
      return 'يونيون باي'
    case 'amex':
      return 'أمريكان إكسبريس'
    case 'applepay':
      return 'Apple Pay'
    case 'stcpay':
      return 'STC Pay'
    case 'card':
      return 'بطاقة بنكية'
    default:
      return 'غير معروفة'
  }
}

// ============================================================================
// وضع المفاتيح — تجريبي أم حقيقي
// ============================================================================

export type PaymentKeyMode = 'live' | 'test' | 'unconfigured'

/**
 * يستنتج الوضع من بادئة المفتاح العام.
 *
 * سبب وجود هذا التمييز: النصّ الظاهر للمستخدم لا يجوز أن يقول «الدفع متاح»
 * بينما المفاتيح تجريبية، لأن بطاقة حقيقية ستُرفض بلا تفسير مفهوم. اشتقاق
 * النصّ من المفتاح نفسه يجعل الكلام مطابقًا للواقع تلقائيًا — ولا يمكن أن
 * يتباعدا بعد تبديل المفاتيح، لأن لا أحد يكتب النصّ يدويًا.
 *
 * البادئتان `pk_test_` و`pk_live_` هما ما تفرضه حزمة Moyasar نفسها (تحقّق
 * صيغة المفتاح في `init`)، فليستا عُرفًا من عندنا.
 */
export function paymentKeyMode(key: unknown): PaymentKeyMode {
  if (typeof key !== 'string') return 'unconfigured'
  const trimmed = key.trim()
  if (trimmed.startsWith('pk_live_')) return 'live'
  if (trimmed.startsWith('pk_test_')) return 'test'
  return 'unconfigured'
}

/** تنبيه يُعرض داخل صفحة الدفع في الوضع التجريبي. `null` حين لا حاجة لتنبيه. */
export function paymentModeNotice(mode: PaymentKeyMode): string | null {
  if (mode === 'test') {
    return 'بوابة الدفع تعمل حاليًا بمفاتيح تجريبية: لن يُخصم أي مبلغ حقيقي، وقد تُرفض البطاقات الحقيقية. استخدم بيانات بطاقة اختبار.'
  }
  return null
}

/** الجملة المختصرة التي تظهر في مركز المساعدة. */
export function paymentAvailabilityCopy(mode: PaymentKeyMode): string {
  if (mode === 'live') return 'الدفع الإلكتروني متاح الآن بمدى وفيزا وماستركارد'
  if (mode === 'test') return 'الدفع الإلكتروني قيد التجربة بمفاتيح اختبار'
  return 'الدفع الإلكتروني غير مفعّل على هذا النشر'
}
