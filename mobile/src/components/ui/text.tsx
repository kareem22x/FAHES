import { Text, type TextProps, type TextStyle } from 'react-native'

import { useTheme, type FontFamilyKey } from '@/theme'

/**
 * النصّ — المكوّن الذي يمرّ منه كل حرف في التطبيق.
 *
 * ── المشكلة التي يحلّها ───────────────────────────────────────────────────
 *
 * في React Native، `fontWeight` **لا يعمل** مع عائلة خط مخصّصة. تمرير
 * `{ fontFamily: 'Alexandria_400Regular', fontWeight: '700' }` لا يعطي الخط
 * العريض؛ النظام إمّا يتجاهل الوزن أو يركّب وزنًا صناعيًّا (يميل الحرف
 * ميكانيكيًّا) فتبدو العربية مشوّهة.
 *
 * الطريقة الصحيحة أن تختار **عائلة الوزن** نفسها: `Alexandria_700Bold`.
 * ولأن نسيان ذلك خطأ صامت لا يلتقطه `tsc`، فإن هذا المكوّن يمنع الخطأ
 * بتصميمه: لا تقبل `fontWeight` أصلًا، بل `variant` و`weight` تُترجمان إلى
 * عائلة صحيحة.
 *
 * ── الأحجام ───────────────────────────────────────────────────────────────
 *
 * من `fontSize` في الرموز، وهي سلّم الويب نفسه. لا حجم مكتوب في مكانه:
 * «لا شيء في هذا المنتج يُعرض تحت 12» قاعدة، والالتزام بها ممكن فقط إن كان
 * للحجم مصدر واحد.
 */

export type TextVariant = 'display' | 'title' | 'heading' | 'body' | 'label' | 'caption' | 'mono'

type VariantSpec = {
  size: number
  weight: FontFamilyKey
  /** ارتفاع السطر من سلّم الرموز. */
  leading: 'body' | 'tight'
  /** يخبو إلى لون النصّ الثانوي تلقائيًّا. */
  muted?: boolean
}

/**
 * خرائط الأنماط.
 *
 * الأوزان مختارة لا عشوائية: العناوين 700/800 (ثقيل، تُقرأ من مسافة)،
 * النصّ الجاري 400 (مريح لكتلة نصّ)، التسميات 600 (واضحة لكن لا تنافس
 * العنوان)، والطوابع 500 (حاضرة بلا صراخ).
 */
const VARIANTS: Record<TextVariant, VariantSpec> = {
  display: { size: 34, weight: 'heavy', leading: 'tight' },
  title: { size: 27, weight: 'bold', leading: 'tight' },
  heading: { size: 22, weight: 'bold', leading: 'tight' },
  body: { size: 14.5, weight: 'regular', leading: 'body' },
  label: { size: 13.5, weight: 'semibold', leading: 'tight' },
  caption: { size: 12, weight: 'medium', leading: 'tight', muted: true },
  /** أرقام لاتينية: لوحات السيارات، أرقام الهياكل، معرّفات الدفع. */
  mono: { size: 13.5, weight: 'medium', leading: 'tight' },
}

export type AppTextProps = TextProps & {
  variant?: TextVariant
  weight?: 'regular' | 'medium' | 'semibold' | 'bold' | 'heavy'
  tone?: 'default' | 'muted' | 'accent' | 'success' | 'warning' | 'error' | 'onAccent'
  /** يمحو الاتجاه تلقائيًّا — للمعرّفات اللاتينية داخل نصّ عربي. */
  ltr?: boolean
  align?: 'start' | 'center' | 'end'
}

export function AppText({
  variant = 'body',
  weight,
  tone = 'default',
  ltr = false,
  align,
  style,
  ...rest
}: AppTextProps) {
  const t = useTheme()
  const spec = VARIANTS[variant]

  const resolvedWeight = weight ?? spec.weight
  const family = t.font[resolvedWeight]

  // ⚠️ `success`/`warning`/`error` تأخذ من `t.feedback` **لا** من `t.colors`:
  // القيم الخام هناك مشبعة وتصلح للحدود والأيقونات، لكن تباينها كنصّ على
  // السطح الداكن 3.2:1 (القياس في `theme/colors.ts`) ⇒ غير مقروءة. ومن يريد
  // اللون الخام للحدّ أو الأيقونة يستعمله من `t.colors` مباشرةً.
  const color =
    tone === 'muted'
      ? t.colors.textMuted
      : tone === 'accent'
        ? t.colors.accent
        : tone === 'success'
          ? t.feedback.success.text
          : tone === 'warning'
            ? t.feedback.warning.text
            : tone === 'error'
              ? t.feedback.error.text
              : tone === 'onAccent'
                ? t.colors.onAccent
                : t.colors.text

  const computed: TextStyle = {
    fontFamily: family,
    fontSize: spec.size,
    lineHeight: Math.round(spec.size * t.lineHeight[spec.leading]),
    color,
    // `writingDirection` يثبّت اتجاه النصّ داخل السطر. مهم للمعرّفات
    // اللاتينية داخل جملة عربية: بلا هذا قد يُعاد ترتيبها بصريًّا فيبدو
    // «pay_123» مقلوبًا. و`textAlign` افتراضه البداية (اليمين في RTL).
    writingDirection: ltr ? 'ltr' : 'rtl',
    textAlign: align === 'center' ? 'center' : align === 'end' ? 'right' : undefined,
    ...(variant === 'mono' ? { fontVariant: ['tabular-nums'] } : null),
  }

  // `align` تُمرَّر مرّتين: في `computed` ثم في `style` القادم من المستدعي.
  // المتأخّر يفوز، وهذا مقصود — يسمح للمستدعي بتجاوز أي شيء.
  return <Text {...rest} style={[computed, style]} />
}
