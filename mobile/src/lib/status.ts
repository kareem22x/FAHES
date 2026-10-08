/**
 * مفردات حالة الطلب — منقولة من `lib/inspection-status.ts` في تطبيق الويب.
 *
 * ── لماذا نسخة لا استيراد ─────────────────────────────────────────────────
 *
 * `lib/inspection-status.ts` يستورد نوعه من `lib/inspection-store.ts`، وهذا
 * الأخير يستورد `@/lib/supabase/server` — كود خادم لا يعمل في React Native.
 * فالاستيراد المباشر يجرّ معه عميل خدمة Supabase إلى التطبيق.
 *
 * لكن **القيم نفسها** هي مصدر الحقيقة، وهي مشتركة: نفس القاعدة، نفس قيد
 * `CHECK`، نفس مفردات `inspectionFlow`. أي انحراف هنا يعني تطبيقًا يقول
 * «وصل موقع السيارة» ولوحة إدارة تقول شيئًا آخر عن الطلب ذاته.
 *
 * ⇒ عند تغيير أي نصّ هنا، غيّره في `lib/inspection-status.ts` أيضًا.
 */

/**
 * حالات الطلب السبع — مطابقة حرفيًّا لقيد `CHECK` في
 * `20261001000001_core_schema.sql:45`. لا تُضِف حالة بلا ترحيل يوسّع القيد،
 * وإلا رفضتها القاعدة عند الكتابة.
 */
export type InspectionStatus =
  | 'open'
  | 'assigned'
  | 'on_the_way'
  | 'arrived'
  | 'inspecting'
  | 'completed'
  | 'cancelled'

/** حالات العرض على الطلب. */
export type OfferStatus = 'pending' | 'accepted' | 'declined'

/**
 * أنماط العرض الأربعة — تُقرأ منها ألوان الشارة.
 *
 * ⚠️ ليست الحالات نفسها: سبع حالات تنطوي على أربعة أنماط، لأن ثلاث حالات
 * (`assigned`/`on_the_way`/`arrived`) كلها «قيد التنفيذ» بلون واحد. الفصل
 * مقصود: إضافة حالة جديدة لا تعني لونًا جديدًا.
 */
export type StatusTone = 'open' | 'progress' | 'done' | 'cancelled'

type StatusMeta = {
  label: string
  tone: StatusTone
  /** الموضع في `inspectionFlow`، أو -1 إن خرج الطلب عن المسار السعيد. */
  step: number
  hint: string
}

/**
 * المسار السعيد الذي يمشيه الطلب السليم — تستخدمه واجهة العميل وواجهة
 * الفاحص معًا فلا تختلفان على حالة.
 *
 * `cancelled` غائبة عن قصد: هي **مخرج** لا خطوة.
 */
export const inspectionFlow: { status: InspectionStatus; label: string; short: string }[] = [
  { status: 'open', label: 'تم نشر الطلب واستقبال العروض', short: 'نُشر الطلب' },
  { status: 'assigned', label: 'تم اختيار الفاحص', short: 'اختيار الفاحص' },
  { status: 'on_the_way', label: 'الفاحص في الطريق إلى السيارة', short: 'في الطريق' },
  { status: 'arrived', label: 'وصل الفاحص إلى موقع السيارة', short: 'وصل الموقع' },
  { status: 'inspecting', label: 'جارٍ فحص السيارة الآن', short: 'جارٍ الفحص' },
  { status: 'completed', label: 'اكتمل الفحص وأصبح التقرير جاهزًا', short: 'اكتمل' },
]

const statusMeta: Record<InspectionStatus, StatusMeta> = {
  open: { label: 'بانتظار العروض', tone: 'open', step: 0, hint: 'يصل الفاحصون القريبون من موقع السيارة بعروضهم.' },
  assigned: { label: 'تم اختيار الفاحص', tone: 'progress', step: 1, hint: 'تم إسناد الطلب لفاحص، وسيتواصل معك قبل الموعد.' },
  on_the_way: { label: 'الفاحص في الطريق', tone: 'progress', step: 2, hint: 'الفاحص متجه الآن إلى موقع السيارة.' },
  arrived: { label: 'وصل موقع السيارة', tone: 'progress', step: 3, hint: 'بدأ الفاحص توثيق حالة السيارة.' },
  inspecting: { label: 'جارٍ الفحص', tone: 'progress', step: 4, hint: 'الفحص قائم، والتقرير قريب.' },
  completed: { label: 'اكتمل الفحص', tone: 'done', step: 5, hint: 'تقرير الفحص جاهز للمشاهدة في حسابك.' },
  cancelled: { label: 'ملغي', tone: 'cancelled', step: -1, hint: 'تم إلغاء هذا الطلب.' },
}

/**
 * بيانات عرض حالة.
 *
 * السقوط إلى `open` عند قيمة غير معروفة مقصود: القاعدة قد تُرجع حالة أحدث
 * من التطبيق (نسخة قديمة على جهاز لم يُحدَّث)، وعرض حالة خاطئة أهون من
 * الانهيار على `undefined.label`.
 */
export function statusOf(status: InspectionStatus | string): StatusMeta {
  return statusMeta[status as InspectionStatus] ?? statusMeta.open
}

/** هل الطلب ما زال جاريًا؟ (لا مكتمل ولا ملغي.) */
export function isActiveStatus(status: InspectionStatus | string): boolean {
  return status !== 'completed' && status !== 'cancelled'
}

/** هل وصل الطلب مرحلة يمكن فيها تتبّع الفاحص على الخريطة؟ */
export function isTrackableStatus(status: InspectionStatus | string): boolean {
  return status === 'assigned' || status === 'on_the_way' || status === 'arrived' || status === 'inspecting'
}

/**
 * تسميات وسائل الدفع — مطابقة لـ`lib/payments/payment-outcomes.ts`.
 * مفاتيحها هي ما يكتبه الخادم في `payment_method`.
 */
const paymentMethodLabels: Record<string, string> = {
  mada: 'مدى',
  visa: 'فيزا',
  mastercard: 'ماستركارد',
  unionpay: 'يونيون باي',
  amex: 'أمريكان إكسبريس',
  applepay: 'Apple Pay',
  stcpay: 'STC Pay',
  card: 'بطاقة بنكية',
}

export function paymentMethodLabel(key: string | null | undefined): string {
  if (!key) return 'غير معروفة'
  return paymentMethodLabels[key] ?? 'غير معروفة'
}

/** حالات الدفع — مطابقة لـ`PaymentStatus` في `lib/payments/payment-rules.ts`. */
export type PaymentStatus = 'unpaid' | 'initiated' | 'paid' | 'failed' | 'refunded' | 'voided'

const paymentStatusLabels: Record<PaymentStatus, string> = {
  unpaid: 'غير مدفوع',
  initiated: 'قيد الدفع',
  paid: 'مدفوع',
  failed: 'فشل الدفع',
  refunded: 'مُسترد',
  voided: 'ملغى',
}

export function paymentStatusLabel(status: string | null | undefined): string {
  if (!status) return paymentStatusLabels.unpaid
  return paymentStatusLabels[status as PaymentStatus] ?? paymentStatusLabels.unpaid
}

/** هل الطلب مدفوع؟ المصدر الوحيد لهذا القرار في الواجهة. */
export function isPaid(status: string | null | undefined): boolean {
  return status === 'paid'
}

/**
 * أرقام لاتينية عن قصد.
 *
 * الصفر العربي-الهندي (٠) يُعرض نقطة بالكاد تُرى في خط المنتج، وخلط أشكال
 * الأرقام بدا غير متّسق بين الأسعار والعدّادات والتواريخ. هذا التعليق
 * منقول كما هو من الويب لأنه يوثّق قرارًا اتُّخذ عن قياس.
 */
const arabicLocale = 'ar-SA-u-nu-latn'

/**
 * تنسيق تاريخ عربي آمن.
 *
 * ⚠️ `Intl` في React Native قد يكون ناقصًا: Hermes على أندرويد يُشحن بلا
 * بيانات منطقة كاملة في بعض الإصدارات، وقد يرمي `RangeError` على
 * `timeZone`. لذلك النداء داخل `try` مع سقوط إلى نصّ عربي بديل — لا شاشة
 * بيضاء بسبب طابع زمني.
 */
export function formatArabicDate(
  value: number | string | null | undefined,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' },
): string {
  if (value === null || value === undefined || value === '') return '—'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  try {
    return new Intl.DateTimeFormat(arabicLocale, { timeZone: 'Asia/Riyadh', ...options }).format(date)
  } catch {
    return '—'
  }
}

/** تنسيق رقم عربي بلا رمز عملة. */
export function formatArabicNumber(value: number): string {
  if (!Number.isFinite(value)) return '—'
  try {
    return new Intl.NumberFormat(arabicLocale).format(value)
  } catch {
    return String(value)
  }
}

/**
 * تنسيق سعر بالريال.
 *
 * `payment_amount` يأتي من PostgREST كنصّ لا رقم (`numeric` يُرسل نصًّا)،
 * و`Number('')` تساوي `0` لا `NaN` — لذلك التحقق بـ`Number.isFinite` بعد
 * تحويل صريح، وإلا عُرض «٠٫٠٠ ر.س» على طلب بلا سعر.
 */
export function formatPrice(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return '—'
  return `${formatArabicNumber(numeric)} ر.س`
}
