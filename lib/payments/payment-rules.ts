/**
 * قواعد الدفع — وحدة نقية: بلا شبكة، بلا قاعدة بيانات، بلا `process.env`.
 *
 * سبب وجودها منفصلة: كل صفحات الإدارة والمسارات المحميّة `force-dynamic`،
 * و`vitest` لا يرى إلا `lib/**`. فالقرارات التي يمكن أن تكون خاطئة **بصمت**
 * (تحويل الوحدات · قراءة جسم الـWebhook · مطابقة الرمز السرّي) تُكتب هنا حيث
 * يمكن اختبارها، لا داخل مسار API.
 *
 * ── ما لا يخصّ هذه الوحدة ──────────────────────────────────────────────────
 *
 * جدول انتقالات الحالة **ليس** هنا. التسوية تتم في دالة القاعدة
 * `settle_inspection_payment` لأنها الموضع الوحيد الذي يملك قفل الصف. إعادة
 * كتابة الجدول في TypeScript كانت ستخلق مصدرَي حقيقة يتباعدان بصمت — وهذا
 * بالضبط ما وقع في `inspections.status` (مفردات مكرّرة في ثلاثة أماكن).
 * هنا نتعامل مع **نتيجة** التسوية كما تعيدها القاعدة.
 */

import { timingSafeEqual } from '@/lib/web-crypto'
import { paymentMethodLabel as paymentMethodLabelFromOutcomes } from '@/lib/payments/payment-outcomes'

// ============================================================================
// العملة والوحدات
// ============================================================================

/** العملة الوحيدة المدعومة حاليًا. Moyasar يقبل `SAR` و`USD`؛ نرفض غيرها. */
export const PAYMENT_CURRENCY = 'SAR'

/**
 * أصغر مبلغ يقبله Moyasar: 100 هللة = 1.00 ريال.
 *
 * الفائدة الحقيقية من هذا الحدّ ليست رفض المبالغ الصغيرة، بل **كشف خطأ
 * الوحدة**: لو مرّر أحدهم سعر العرض بالريال (50) إلى دالة تتوقّع هللات
 * (5000)، فسيكون الناتج 50 < 100 ⇒ خطأ ظاهر بدل دفعٍ بمبلغ خاطئ.
 */
export const MOYASAR_MINIMUM_HALALAS = 100

/**
 * الريال ← الهللة، وهي الوحدة التي يفهمها Moyasar في `amount`.
 *
 * `Math.round` ضرورية لا تجميلية: `12.29 * 100` في IEEE-754 يساوي
 * `1228.9999999999998`، وبلا تدوير يُرسل `1228` — هللة ناقصة في كل عملية.
 *
 * `Number('')` تساوي `0` لا `NaN`، لذا السلسلة الفارغة تُرفض صراحةً قبل
 * التحويل. هذه نفس الفخّ الموثَّق في قواعد المشروع، وهنا يكلّف مالًا حقيقيًا.
 */
export function toHalalas(amountSar: unknown): number | null {
  let value: number
  if (typeof amountSar === 'string') {
    const trimmed = amountSar.trim()
    if (trimmed === '') return null
    value = Number(trimmed)
  } else if (typeof amountSar === 'number') {
    value = amountSar
  } else {
    return null
  }

  if (!Number.isFinite(value) || value < 0) return null

  const halalas = Math.round(value * 100)
  if (!Number.isSafeInteger(halalas)) return null
  return halalas
}

/** الهللة ← الريال. تُستخدم عند قراءة مبلغ دفعة من Moyasar. */
export function fromHalalas(halalas: unknown): number | null {
  if (typeof halalas !== 'number' || !Number.isFinite(halalas)) return null
  if (!Number.isInteger(halalas) || halalas < 0) return null
  return halalas / 100
}

// ============================================================================
// حالات الدفع
// ============================================================================

export const PAYMENT_STATUSES = [
  'unpaid',
  'initiated',
  'paid',
  'failed',
  'refunded',
  'voided',
] as const
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]

export function isPaymentStatus(value: unknown): value is PaymentStatus {
  return typeof value === 'string' && (PAYMENT_STATUSES as readonly string[]).includes(value)
}

/**
 * حالات Moyasar الثمانية ← حالاتنا الستّ.
 *
 * `authorized` ← `initiated` لأن الحجز لا يعني قبض المال، ولا نعتبره دفعًا.
 * `captured` و`verified` ← `paid` لأن كليهما يعني أن المال انتقل فعلًا.
 * `refunded` و`voided` يُنقلان كما هما: تغيّران حقيقيان بعد الدفع، ولذلك
 * تسمح دالة القاعدة بهما على صفٍّ مدفوع بخلاف بقية الحالات.
 *
 * تُعيد `null` لحالة غير معروفة — ولا تُخمّن. القرار مقصود: مسار الاستدعاء
 * يعامل `null` كخطأ ظاهر لا كـ«لا شيء حدث»، لأن مجهولًا قد يعني أن مال
 * العميل تحرّك.
 */
export function mapMoyasarStatus(status: unknown): PaymentStatus | null {
  if (typeof status !== 'string') return null
  switch (status.trim().toLowerCase()) {
    case 'initiated':
      return 'initiated'
    case 'authorized':
      return 'initiated'
    case 'paid':
    case 'captured':
    case 'verified':
      return 'paid'
    case 'failed':
      return 'failed'
    case 'refunded':
      return 'refunded'
    case 'voided':
      return 'voided'
    default:
      return null
  }
}

/** هل هذا دفع مؤكَّد؟ المصدر الوحيد للحقيقة في كل الواجهات. */
export function isPaidStatus(status: unknown): boolean {
  return status === 'paid'
}

// ============================================================================
// نتائج التسوية — الرسائل وترميز HTTP
// ============================================================================

export const SETTLEMENT_STATUSES = [
  'ok',
  'already_paid',
  'not_found',
  'no_accepted_offer',
  'amount_mismatch',
  'unknown',
] as const
export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number]

export function isSettlementStatus(value: unknown): value is SettlementStatus {
  return typeof value === 'string' && (SETTLEMENT_STATUSES as readonly string[]).includes(value)
}

/**
 * `already_paid` نجاح لا فشل: الإشعارات تصل مكرّرة (Moyasar يعيد المحاولة،
 * وصفحة العودة تُسوّي نفس الدفعة). اعتبارها خطأ كان سيجعل كل إعادة محاولة
 * تبدو كعطل.
 */
export function settlementIsSuccess(status: SettlementStatus): boolean {
  return status === 'ok' || status === 'already_paid'
}

/** HTTP يتبع السبب، لا العكس — نفس عُرف `lib/account-phone.ts`. */
export function settlementHttpStatus(status: SettlementStatus): number {
  switch (status) {
    case 'ok':
    case 'already_paid':
      return 200
    case 'not_found':
      return 404
    case 'no_accepted_offer':
    case 'amount_mismatch':
      return 409
    default:
      return 502
  }
}

/** سبب واحد ⇒ جملة واحدة. لا تُدمج حالتان في رسالة عامّة. */
export function settlementMessage(status: SettlementStatus): string {
  switch (status) {
    case 'ok':
      return 'تم تأكيد الدفع بنجاح، وطلب الفحص صار مدفوعًا.'
    case 'already_paid':
      return 'هذا الطلب مدفوع مسبقًا، ولا حاجة لإعادة الدفع.'
    case 'not_found':
      return 'لم نجد طلب فحص مرتبطًا بهذه الدفعة.'
    case 'no_accepted_offer':
      return 'لا يمكن تأكيد الدفع: لا يوجد عرض مقبول على هذا الطلب بعد.'
    case 'amount_mismatch':
      return 'مبلغ الدفعة لا يطابق سعر العرض المقبول، ولم يتم تأكيد الدفع. تواصل مع الدعم.'
    default:
      return 'تعذّر تأكيد الدفع. حاول لاحقًا، وإن تكرّر الخطأ فتواصل مع الدعم.'
  }
}

/** جسم الخطأ الموحّد — الشكل نفسه في كل مسارات المشروع: `{ error, reason }`. */
export function settlementErrorBody(status: SettlementStatus): { error: string; reason: SettlementStatus } {
  return { error: settlementMessage(status), reason: status }
}

// ============================================================================
// رموز الـWebhook
// ============================================================================

export const WEBHOOK_REJECTIONS = [
  'not_configured',
  'invalid_secret',
  'malformed_body',
  'missing_payment_id',
  'unmappable_status',
] as const
export type WebhookRejection = (typeof WEBHOOK_REJECTIONS)[number]

export function isWebhookRejection(value: unknown): value is WebhookRejection {
  return typeof value === 'string' && (WEBHOOK_REJECTIONS as readonly string[]).includes(value)
}

export function webhookHttpStatus(reason: WebhookRejection): number {
  switch (reason) {
    case 'not_configured':
      // خطأ إعداد عندنا لا عند المُرسل. 500 يجعل العطل ظاهرًا في سجلّ النشر
      // بدل أن يبدو الإشعار مقبولًا وهو مُهمَل.
      return 500
    case 'invalid_secret':
      return 401
    case 'malformed_body':
    case 'missing_payment_id':
      return 400
    default:
      return 502
  }
}

export function webhookMessage(reason: WebhookRejection): string {
  switch (reason) {
    case 'not_configured':
      return 'لم يُضبط رمز الـWebhook السرّي على الخادم (MOYASAR_WEBHOOK_SECRET).'
    case 'invalid_secret':
      return 'رمز الـWebhook غير مطابق.'
    case 'malformed_body':
      return 'جسم الإشعار غير صالح.'
    case 'missing_payment_id':
      return 'الإشعار لا يحمل معرّف دفعة.'
    default:
      return 'حالة الدفع في الإشعار غير معروفة.'
  }
}

/**
 * مطابقة الرمز السرّي في زمن ثابت.
 *
 * الرمز يصل كحقل عاديّ داخل جسم JSON (لا ترويسة)، وهو ما وثّقه Moyasar.
 * المقارنة لا تتوقف عند أول بايت مختلف، حتى لا يسمح زمن التنفيذ باستنباط
 * الرمز بايتًا بايت. تسريب **الطول** مقبول ومتعارف عليه لرموز بهذا الحجم.
 *
 * الفشل مُغلق: رمز غير مضبوط في البيئة ⇒ رفض كل الإشعارات. البديل (القبول
 * عند غياب الرمز) كان يجعل نشرًا ناقص الإعداد ثغرة مفتوحة بلا أي إشارة.
 */
export function verifyWebhookSecret(received: unknown, expected: string | null | undefined): boolean {
  if (typeof received !== 'string' || received.length === 0) return false
  const secret = expected?.trim()
  if (!secret) return false
  return timingSafeEqual(received, secret)
}

// ============================================================================
// قراءة جسم إشعار Moyasar
// ============================================================================

/**
 * أنواع أحداث الدفع كما يسمّيها Moyasar.
 *
 * `payment_faild` (بلا حرف e) **ليس خطأ مطبعيًا منّي**: هكذا ورد في وثائق
 * Moyasar الرسمية. أقبل الاسمين معًا، لأن الاعتماد على أحدهما وحده يعني
 * إسقاط إشعارات الفشل كاملةً إن صحّحوا الخطأ لاحقًا.
 *
 * والأهم: هذا النوع **تلميح فقط**. المسار يعيد جلب الدفعة من REST ويحسم من
 * `status` الحقيقي، فلا يهمّ أيّ الاسمين وصل.
 */
export const PAYMENT_EVENT_TYPES = [
  'payment_paid',
  'payment_faild',
  'payment_failed',
  'payment_authorized',
  'payment_captured',
  'payment_refunded',
  'payment_voided',
  'payment_verified',
  'payment_created',
  'payment_updated',
] as const

export type ParsedWebhook = {
  /** معرّف الدفعة عند Moyasar — مفتاح إعادة الجلب من REST. */
  paymentId: string
  /** معرّف الطلب المستخرج من `metadata`، أو `null`. */
  inspectionId: string | null
  /** نوع الحدث كما وصل، بعد التطبيع. */
  eventType: string
  /** `status` كما في الجسم — تلميح لا يُعتمد عليه للحسم. */
  declaredStatus: string | null
  /** هل الدفعة في الوضع الحقيقي (لا الاختباري)؟ */
  live: boolean
  secretToken: string | null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * يستخرج ما نحتاجه من جسم الإشعار، أو يرفضه بسبب محدَّد.
 *
 * لا يتحقق من الرمز السرّي ولا من الحالة — كلاهما مسؤولية المستدعي، لأن
 * ترتيب الفحوص يهمّ: الرمز أولًا، ثم الشكل. وخلط الاثنين هنا كان سيجعل
 * رسالة «جسم غير صالح» تُخفي رمزًا خاطئًا، وهو الخطأ الذي يعاني منه من
 * يضبط الـWebhook لأول مرة.
 *
 * ⚠️ معرّف الدفعة يُقرأ من `data.id` **وحده**، ولا يُسقط إلى `body.id`.
 * السبب: `id` في الجذر هو معرّف **الحدث** لا معرّف الدفعة، والسقوط إليه كان
 * سيجعلنا نستعلم عن مورد غير موجود ثم نُبلّغ «لم نجد طلبًا» — رسالة مضلِّلة
 * تُخفي أن الجسم نفسه ناقص. غياب `data` ⇒ رفض، لا تخمين.
 */
export function parseWebhookEvent(raw: unknown): { ok: true; event: ParsedWebhook } | { ok: false; reason: WebhookRejection } {
  const body = asRecord(raw)
  if (!body) return { ok: false, reason: 'malformed_body' }

  const data = asRecord(body.data)
  if (!data) return { ok: false, reason: 'malformed_body' }

  const paymentId = asString(data.id)
  if (!paymentId) return { ok: false, reason: 'missing_payment_id' }

  const metadata = asRecord(data.metadata)
  const inspectionId =
    asString(metadata?.inspection_id) ??
    asString(metadata?.inspectionId) ??
    asString(body.inspection_id)

  const declaredStatus = asString(data.status) ?? asString(body.status)

  return {
    ok: true,
    event: {
      paymentId,
      inspectionId,
      eventType: asString(body.type)?.toLowerCase() ?? 'unknown',
      declaredStatus: declaredStatus?.toLowerCase() ?? null,
      live: body.live === true,
      secretToken: asString(body.secret_token),
    },
  }
}

// ============================================================================
// طريقة الدفع — العرض بالعربية
// ============================================================================

export const PAYMENT_METHOD_KEYS = [
  'mada',
  'visa',
  'mastercard',
  'unionpay',
  'amex',
  'applepay',
  'stcpay',
  'card',
  'unknown',
] as const
export type PaymentMethodKey = (typeof PAYMENT_METHOD_KEYS)[number]

/**
 * مفتاح الطريقة من كائن `source` الذي يعيده Moyasar.
 *
 * `source.company` هو الشبكة (`mada` · `visa` …) و`source.type` هو القناة
 * (`creditcard` · `applepay` · `stcpay`). الشبكة أدقّ عند وجودها، وإلا سقطنا
 * إلى القناة، وإلا إلى `card` العامّة.
 *
 * لا نخزّن أي جزء من رقم البطاقة — لا كاملًا ولا آخر أربعة أرقام. العرض في
 * لوحة Moyasar يكفي للدعم، وتخزين أجزاء من PAN يجرّنا إلى نطاق PCI بلا داع.
 */
export function paymentMethodKey(source: unknown): PaymentMethodKey {
  const record = asRecord(source)
  if (!record) return 'unknown'

  const company = asString(record.company)?.toLowerCase()
  if (company && (PAYMENT_METHOD_KEYS as readonly string[]).includes(company)) {
    return company as PaymentMethodKey
  }

  const type = asString(record.type)?.toLowerCase()
  if (type === 'applepay' || type === 'stcpay') return type
  if (type === 'creditcard') return 'card'

  return 'unknown'
}

export function paymentMethodLabel(key: unknown): string {
  return paymentMethodLabelFromOutcomes(key)
}

/** وصف مختصر للسبب كما يعيده Moyasar — يُقصّ حتى لا يفيض في الواجهة. */
export function paymentFailureReason(source: unknown, fallback: unknown = null): string | null {
  const record = asRecord(source)
  const message = asString(record?.message) ?? asString(fallback)
  if (!message) return null
  return message.length > 300 ? `${message.slice(0, 297)}…` : message
}

// ============================================================================
// حالات صفحة العودة
// ============================================================================
//
// تُصدَّر من هنا للتوافق مع المستدعين على الخادم، لكن **مصدرها**
// `lib/payments/payment-outcomes.ts` — وحدة بلا اعتماد على `web-crypto`،
// لأن مكوّن العميل يستوردها مباشرةً. إعادة التصدير هذه تربط الاسم القديم
// بالتعريف الواحد بدل أن تخلق نسخة ثانية تتباعد بصمت.

export {
  PAYMENT_OUTCOMES,
  isPaymentOutcome,
  paymentOutcomeMessage,
  paymentOutcomeTone,
  type OutcomeTone,
  type PaymentOutcome,
} from '@/lib/payments/payment-outcomes'
