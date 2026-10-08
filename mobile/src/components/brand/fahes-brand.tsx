import Svg, { G, Path, Rect } from 'react-native-svg'

import { AppText, type TextVariant } from '@/components/ui/text'
import { useTheme } from '@/theme'

/**
 * شعار «فاحص» — نسخة متجهية داخل التطبيق.
 *
 * ── لماذا متجه لا صورة ────────────────────────────────────────────────────
 *
 * الويب يستخدم `public/fahes-logo-mark.png` (645×658، **470 كيلوبايت**) عبر
 * `components/brand-mark.tsx`. وفي تطبيق جوال هذا وزن لا مبرّر له: الصورة
 * تُشحن بأربع كثافات شاشة فتتضاعف، وتُثبَّت بألوان محروقة فلا تتبع الوضع
 * الداكن ولا تتبدّل فوق تدرّج الهوية.
 *
 * الشكل نفسه موجود **متجهًا** في `public/icon.svg` (1.3 كيلوبايت): مستطيل
 * بزوايا دائرية + مساران. نقلناه إلى `react-native-svg` فصار الشعار:
 *   • حادًّا في أي مقاس (لا `@2x`/`@3x`)،
 *   • ~1 كيلوبايت بدل 470،
 *   • **ملوَّنًا من الرموز** فيعمل على خلفية داكنة وفاتحة بلا نسختين.
 *
 * ── الأرقام ───────────────────────────────────────────────────────────────
 *
 * `viewBox` هو `0 0 180 180` من الملف الأصلي، وكل المسارات منسوخة حرفيًّا.
 * المجموعة تحمل `translate(4.5 4.5) scale(0.95)` — وهي ترجمة `transform:
 * scale(95%)` مع `transform-origin: center` في الأصل: مركز المربع 180 هو 90،
 * و95% منه تعني إزاحة `180 × 0.025 = 4.5` نقطة. كتابتها هكذا صريحةً أوضح
 * من `transformOrigin` التي تختلف بين المنصّات.
 */

/** المساران من `public/icon.svg` — لا تُعدّلهما بلا تحديث الأصل. */
const GLYPH_A =
  'M101.141 53H136.632C151.023 53 162.689 64.6662 162.689 79.0573V112.904H148.112V79.0573C148.112 78.7105 148.098 78.3662 148.072 78.0251L112.581 112.898C112.701 112.902 112.821 112.904 112.941 112.904H148.112V126.672H112.941C98.5504 126.672 86.5638 114.891 86.5638 100.5V66.7434H101.141V100.5C101.141 101.15 101.191 101.792 101.289 102.422L137.56 66.7816C137.255 66.7563 136.945 66.7434 136.632 66.7434H101.141V53Z'
const GLYPH_B =
  'M65.2926 124.136L14 66.7372H34.6355L64.7495 100.436V66.7372H80.1365V118.47C80.1365 126.278 70.4953 129.958 65.2926 124.136Z'

export function FahesMark({
  size = 44,
  /** لون الحروف. */
  glyph = '#ffffff',
  /** لون لوح الخلفية — `undefined` يعني شعارًا شفّافًا بلا لوح. */
  plate,
  /** نصف قطر اللوح بوحدات `viewBox` (37 في الأصل = زوايا أيقونة التطبيق). */
  plateRadius = 37,
}: {
  size?: number
  glyph?: string
  plate?: string
  plateRadius?: number
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 180 180" fill="none">
      {plate ? <Rect x={0} y={0} width={180} height={180} rx={plateRadius} fill={plate} /> : null}
      <G transform="translate(4.5 4.5) scale(0.95)">
        <Path d={GLYPH_A} fill={glyph} />
        <Path d={GLYPH_B} fill={glyph} />
      </G>
    </Svg>
  )
}

/**
 * اسم «فاحص» بجانب نقطة بلون الهوية.
 *
 * النقطة **داخل** نفس كتلة النصّ (`Text` متداخل) لا في `View` مجاور: النصّ
 * المتداخل يتدفّق على سطر واحد بخطّ أساس واحد ويحترم قواعد الاتجاه الثنائي،
 * بينما صفٌّ من عنصرين مستقلّين ينكسر عند تغيّر المقاس ويحتاج ضبط خطّ الأساس
 * يدويًّا.
 */
export function FahesWordmark({
  variant = 'heading',
  color,
  dotColor,
}: {
  variant?: TextVariant
  color?: string
  dotColor?: string
}) {
  const t = useTheme()
  return (
    <AppText variant={variant} weight="heavy" style={color ? { color } : undefined}>
      {'فاحص'}
      <AppText variant={variant} weight="heavy" style={{ color: dotColor ?? t.colors.accentLight }}>
        .
      </AppText>
    </AppText>
  )
}
