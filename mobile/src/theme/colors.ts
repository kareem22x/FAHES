import type { StatusTone } from '@/lib/status'

import { accentRamp, brand, brandRamp } from './tokens'

/**
 * لوحتا الألوان: الفاتحة والداكنة.
 *
 * ── لماذا نوع `Palette` مُعلَن صراحةً ─────────────────────────────────────
 *
 * لو تركت الكائن مُستنتَجًا (`as const` بلا نوع) لما اشتكى `tsc` حين ينقص
 * مفتاح في إحدى اللوحتين — كان `undefined` يصل إلى `style` ويسقط صامتًا إلى
 * الأسود الافتراضي. النوع المُعلَن يجعل «مفتاح ناقص» **خطأ ترجمة**.
 * وهذا ليس ترفًا: كل إضافة رمز مستقبلًا ستمرّ من هنا.
 *
 * ── تناظر اللوحتين ────────────────────────────────────────────────────────
 *
 * المفاتيح مطابقة لقيم `:root` في `globals.css` (الفاتح) ولـ
 * `[data-theme='dark']` في `theme-dark.css` (الداكن). الأسماء نفسها، فلا
 * يتباعد الاثنان بلا أن يظهر الفرق في `tsc`.
 */
export type Palette = {
  /** خلفية الشاشة كاملة. */
  background: string
  /** البطاقات والألواح المرتفعة فوق الخلفية. */
  surface: string
  /** النص الأساسي. */
  text: string
  /** النص الثانوي: التلميحات، الطوابع الزمنية، التسميات. */
  textMuted: string
  /** الحدود الواضحة. */
  border: string
  /** الحدود الخفيفة: فواصل داخلية، حدود صفوف الجداول. */
  borderLight: string
  primary: string
  primaryLight: string
  secondary: string
  accent: string
  accentLight: string
  success: string
  warning: string
  error: string
  /** النص فوق سطح بلون الهوية (الأزرار الأساسية). */
  onAccent: string
  /** حجاب النوافذ المنبثقة والأدراج. */
  scrim: string
  /** قاعدة هياكل التحميل قبل وصول البيانات. */
  skeleton: string
}

/**
 * اللوحة الفاتحة — الأساس. مطابقة حرفيًّا لـ`:root` في `globals.css`.
 */
export const lightPalette: Palette = {
  background: '#f5f8fd',
  surface: '#ffffff',
  text: '#0f2444',
  textMuted: '#5f7086',
  border: '#e2eaf4',
  borderLight: '#eef3f9',
  primary: brand.primary,
  primaryLight: brand.primaryLight,
  secondary: brand.secondary,
  accent: brand.accent,
  accentLight: brand.accentLight,
  success: brand.success,
  warning: brand.warning,
  error: brand.error,
  onAccent: '#ffffff',
  scrim: 'rgba(2, 6, 23, 0.45)',
  skeleton: '#e8eef8',
}

/**
 * اللوحة الداكنة — مطابقة لـ`[data-theme='dark']` في `theme-dark.css`، مع
 * إضافة الرموز التي لا نظير لها هناك.
 *
 * ⚠️ **الويب لا يملك نسخة داكنة من هذه الرموز**: `scrim` و`skeleton` و
 * `onAccent` أُضيفت للتطبيق. سبب وجودها أن `theme-dark.css` يقرّ بأن الوضع
 * الداكن **يعيد توجيه الرموز** لا يُعيد كتابة المكوّنات، وهذه الرموز لم تكن
 * ضمن ما أُعيد توجيهه. إن أُضيفت للويب لاحقًا فهذه القيم هي المرجع.
 */
export const darkPalette: Palette = {
  background: '#0b1220',
  surface: '#111a2b',
  text: '#e6edf7',
  textMuted: '#9fb0c7',
  border: '#23324a',
  borderLight: '#1c2940',
  primary: brand.primary,
  primaryLight: brand.primaryLight,
  secondary: brand.secondary,
  accent: brand.accent,
  accentLight: brand.accentLight,
  success: brand.success,
  warning: brand.warning,
  error: brand.error,
  onAccent: '#ffffff',
  scrim: 'rgba(2, 6, 23, 0.68)',
  skeleton: '#1b2942',
}

/**
 * `StatusTone` مُستورَد لا مُعرَّف هنا.
 *
 * الأنماط الأربعة مفهوم **نطاقي** (يعيش في `lib/status.ts` مع مفردات الحالات
 * وبقية تطبيق الويب)، والثيم **مستهلك** لها. تعريفه في الثيم كان سيجعل
 * الطبقات مقلوبة، ويسمح لنمط جديد أن يظهر في الويب بلا نظير هنا.
 *
 * ⚠️ النوع يُعاد تصديره أدناه ليبقى `import { StatusTone } from '@/theme'`
 * صالحًا لمن يقرأ الثيم فقط.
 */
export type { StatusTone } from '@/lib/status'

/** ألوان شارة حالة واحدة: خلفية + حدّ + نص. */
export type ToneColors = { background: string; border: string; text: string }

/**
 * قيم الوضع الفاتح منقولة حرفيًّا من `.app-status.is-*` في `refresh.css`
 * (الأسطر 442–445) — وهي `hex` مكتوبة مباشرةً هناك.
 *
 * ⚠️ ولأنها `hex` مباشر لا رموز، **لا تنقلب في الوضع الداكن على الويب**؛
 * وهذا مذكور في `MEMORY.md` كسلوك معروف. لذلك الويب لا يملك نظيرًا داكنًا
 * لهذه القيم، والنسخة الداكنة أدناه **جديدة في التطبيق** ومشتقّة لتُقرأ على
 * `#111a2b` — لا منسوخة من مكان.
 */
const lightTones: Record<StatusTone, ToneColors> = {
  open: { background: accentRamp.amber100, border: '#f0dfbc', text: accentRamp.amber600 },
  progress: { background: brandRamp[50], border: brandRamp[100], text: brandRamp[700] },
  done: { background: accentRamp.mint100, border: '#c4e6d6', text: accentRamp.mint600 },
  cancelled: { background: '#f3f5f9', border: '#e2eaf4', text: '#78879a' },
}

/**
 * النسخة الداكنة: خلفية معتمة من عائلة اللون + حدّ أوضح + نص فاتح.
 *
 * القاعدة التي اخترتها: النص هو **أفتح درجة** في عائلة اللون لا أغمقها، لأن
 * النص الغامق على سطح غامق يفقد التباين الذي يمنحه النص الفاتح. والأخضر
 * والكهرماني فُتِّحا أكثر من الأحمر لأن الأخضر الغامق على أزرق غامق يبدو
 * باهتًا، والأحمر الفاتح يبدو تحذيريًّا أكثر من اللازم لحالة «ملغي».
 */
const darkTones: Record<StatusTone, ToneColors> = {
  open: { background: '#3a2c12', border: '#5c451c', text: '#f0c274' },
  progress: { background: '#152648', border: '#274b8f', text: '#a8c8ff' },
  done: { background: '#10352a', border: '#1c5a45', text: '#7ee2b8' },
  cancelled: { background: '#1b2434', border: '#2b3749', text: '#93a3b8' },
}

/** ألوان الحالات للوضعين. المفاتيح مطابقة في الاثنين (مفروضٌ بالنوع). */
export const statusTones = {
  light: lightTones,
  dark: darkTones,
} as const

/**
 * ألوان التغذية الراجعة — خطأ · نجاح · معلومة.
 *
 * ── المشكلة التي تحلّها (مقيسة لا مُفترَضة) ────────────────────────────────
 *
 * `--color-error: #bf3b2c` **لا يُعاد توجيهه في الوضع الداكن** على الويب
 * (`theme-dark.css` يعيد توجيه `text-muted` و`border` و`border-light` فقط)،
 * و`darkPalette` ينقله كما هو حفاظًا على التطابق.
 *
 * والنتيجة أن نصًّا بلون الخطأ على سطح داكن يعطي تباينًا:
 *   • `#bf3b2c` على `#111a2b` ⇒ **3.2:1**  (المطلوب لـWCAG AA: 4.5:1)
 *   • `#bf3b2c` على `#0b1220` ⇒ **3.5:1**
 * أي أن رسالة خطأ في الوضع الداكن **يصعب قراءتها** — وهي بالضبط الرسالة التي
 * لا يجوز أن تُفوَّت. والمشكلة نفسها في `success` و`warning`.
 *
 * ── القاعدة ───────────────────────────────────────────────────────────────
 *
 * `colors.error/success/warning` تبقى **القيم الخام** — صحيحة للحدود
 * والأيقونات والرسوم (لون مشبع على مساحة صغيرة).
 * أما **النصّ** فيأخذ من هنا، حيث لكل وضع درجته المقروءة.
 *
 * ⚠️ هذه المجموعة **جديدة في التطبيق ولا نظير لها في الويب** — بنفس وضع
 * `darkTones` أعلاه. أُضيفت بعد قياس التباين لا بالذوق.
 * (نصوص الوضع الداكن فُتِّحت حتى تتجاوز 4.5:1 على خلفياتها.)
 */
export type FeedbackTone = 'error' | 'success' | 'warning' | 'info'

export const feedbackTones: Record<'light' | 'dark', Record<FeedbackTone, ToneColors>> = {
  light: {
    // `#a92f22` أغمق من `#bf3b2c` عن قصد ⇒ 6.3:1 على `#f5f8fd` بدل 4.2:1.
    error: { background: '#fdecea', border: '#f7cfc9', text: '#a92f22' },
    success: { background: accentRamp.mint100, border: '#c4e6d6', text: accentRamp.mint600 },
    // `#8a5a12` بدل `accentRamp.amber600` (`#b0741b`): الأخير يعطي 3.7:1 فقط
    // على الخلفية الفاتحة — وهو لون شارة لا لون نصّ.
    warning: { background: accentRamp.amber100, border: '#f0dfbc', text: '#8a5a12' },
    info: { background: brandRamp[50], border: brandRamp[100], text: brandRamp[700] },
  },
  dark: {
    error: { background: '#3a1a17', border: '#6b2c25', text: '#ffb3a7' },
    success: { background: '#10352a', border: '#1c5a45', text: '#7ee2b8' },
    warning: { background: '#3a2c12', border: '#5c451c', text: '#f0c274' },
    info: { background: '#152648', border: '#274b8f', text: '#a8c8ff' },
  },
}
