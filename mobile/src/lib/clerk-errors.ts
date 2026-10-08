/**
 * ترجمة أخطاء Clerk إلى عربية.
 *
 * ── القاعدة الحاكمة ───────────────────────────────────────────────────────
 *
 * Clerk يرمي كائنًا فيه `errors[]` برسائل **إنجليزية** من الخادم. عرضها كما
 * هي في تطبيق عربي غير مقبول، وترجمة كل رمز تُصدّره Clerk عمل لا ينتهي.
 * فالقاعدة: **الرموز الشائعة لها نصّ عربي مكتوب، وما عداها رسالة عامّة** —
 * ولا تُعرض رسالة إنجليزية أبدًا.
 *
 * ⚠️ **الخطأ يُقرأ من `code` لا من `message`.** `message` نصّ إنجليزي جاهز
 * يتغيّر بلا إشعار؛ `code` معرّف ثابت في واجهة Clerk.
 *
 * ⚠️ ولأن الرسالة العربية هنا **حاملة للمعنى الوحيد** الذي يراه المستخدم،
 * فكل حالة تشرح **ما يفعله الآن** لا ما حدث فقط: «تحقّق من البريد» لا
 * «البريد غير موجود».
 *
 * ── لماذا في `lib/` لا في الشاشة ──────────────────────────────────────────
 *
 * منطق نقيّ بلا واجهة ولا حالة: مدخل ⇒ مخرج. في `lib/` يمكن استدعاؤه من
 * شاشة الدخول ومن شاشة إنشاء الحساب معًا حين تُبنى، ويبقى قارئًا واحدًا
 * لأكواد Clerk في التطبيق كلّه.
 */

/** الحالة الوحيدة التي يفرّق فيها المستدعي بين سببين. */
export type ClerkErrorKind = 'not_found' | 'wrong_code' | 'rate_limited' | 'unknown'

export type ClerkErrorInfo = {
  /** نصّ عربي جاهز للعرض. */
  message: string
  /** تصنيف — يُستخدم لقرارات الواجهة لا للعرض. */
  kind: ClerkErrorKind
}

/**
 * استخراج رمز الخطأ من كائن Clerk المرمي.
 *
 * Clerk يرمي كائنًا (`ClerkAPIResponseError`) فيه `errors: [{ code, message,
 * longMessage, meta }]`. قد يحمل أكثر من خطأ؛ **الأوّل** هو الأخصّ بالحقل
 * الذي أُرسل، وهو ما يهمّ المستخدم.
 */
export function clerkErrorCode(caught: unknown): string | undefined {
  if (!caught || typeof caught !== 'object' || !('errors' in caught)) return undefined
  const errors = (caught as { errors?: { code?: string }[] }).errors
  return Array.isArray(errors) ? errors[0]?.code : undefined
}

/** خريطة الرموز ⇒ النصّ العربي. مفتوحة للإضافة، والافتراضي أمان. */
const MESSAGES: Record<string, ClerkErrorInfo> = {
  // ── البريد الإلكتروني ───────────────────────────────────────────────────
  form_identifier_not_found: {
    message: 'لا يوجد حساب بهذا البريد الإلكتروني. تحقّق من الكتابة أو أنشئ حسابًا جديدًا.',
    kind: 'not_found',
  },
  form_param_format_invalid: {
    message: 'صيغة البريد الإلكتروني غير صحيحة. مثال: name@example.com',
    kind: 'not_found',
  },
  form_identifier_missing: {
    message: 'أدخل بريدك الإلكتروني.',
    kind: 'not_found',
  },
  form_param_nil: {
    message: 'أدخل بريدك الإلكتروني.',
    kind: 'not_found',
  },

  // ── رمز التحقق ──────────────────────────────────────────────────────────
  form_code_incorrect: {
    message: 'الرمز غير صحيح. تأكّد من الأرقام الستة في آخر رسالة.',
    kind: 'wrong_code',
  },
  verification_expired: {
    message: 'انتهت صلاحية الرمز. اطلب رمزًا جديدًا.',
    kind: 'wrong_code',
  },
  verification_failed: {
    message: 'تعذّر التحقق من الرمز. أعد المحاولة.',
    kind: 'wrong_code',
  },

  // ── كلمة المرور (لمسار لاحق) ────────────────────────────────────────────
  form_password_incorrect: {
    message: 'كلمة المرور غير صحيحة.',
    kind: 'not_found',
  },

  // ── عامّة ───────────────────────────────────────────────────────────────
  too_many_requests: {
    message: 'محاولات كثيرة في وقت قصير. انتظر دقيقة ثم أعد المحاولة.',
    kind: 'rate_limited',
  },
  captcha_invalid: {
    message: 'تعذّر التحقّق الأمني. أعد المحاولة.',
    kind: 'unknown',
  },
  captcha_unavailable: {
    message: 'خدمة التحقّق الأمني غير متاحة الآن. أعد المحاولة بعد قليل.',
    kind: 'unknown',
  },
  session_exists: {
    message: 'أنت مسجَّل الدخول بالفعل. أعد تشغيل التطبيق.',
    kind: 'unknown',
  },
}

export function readClerkError(caught: unknown, fallback: string): ClerkErrorInfo {
  const code = clerkErrorCode(caught)
  const known = code ? MESSAGES[code] : undefined
  return known ?? { message: fallback, kind: 'unknown' }
}

/**
 * تحقّق محلي من شكل البريد قبل أي نداء شبكة.
 *
 * ── لماذا نتحقّق مرّتين ───────────────────────────────────────────────────
 *
 * Clerk يتحقّق أيضًا، لكن إرسال طلب لا فائدة منه يعطي المستخدم **دوران شبكة**
 * قبل أن يعرف أن في العنوان خطأ إملائيًّا. الفحص المحلي يردّ فورًا، وفحص
 * الخادم يبقى المرجع النهائي.
 *
 * النمط **متعمَّد البساطة**: `RFC 5322` الكامل نمطٌ شهير بطول صفحة، وأخطاؤه
 * الحقيقية نادرة (بريد بلا `@`، مسافة داخله، نطاق بلا نقطة). أما حالات
 * الحافة فتكفلها Clerk.
 */
export function isPlausibleEmail(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed.length < 6 || trimmed.length > 254) return false
  if (/\s/.test(trimmed)) return false
  return /^[^@]+@[^@.]+(\.[^@.]+)+$/.test(trimmed)
}

/** توحيد البريد: إزالة الفراغات وتصغير الأحرف (البريد غير حسّاس لحالة الأحرف). */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}
