import { BlurView } from 'expo-blur'
import { StyleSheet, View, type ViewProps } from 'react-native'

import { useTheme } from '@/theme'

/**
 * الأسطح الزجاجية — اللغة البصرية الأساسية في هذه الشاشات.
 *
 * ── المبدأ الحاكم: الطبقة اللونية تحمل التصميم، والتمويه إضافة ─────────────
 *
 * كل سطح هنا **يبدو صحيحًا كاملًا والتمويه معطّل**. سبب ذلك ليس ترفًا
 * تصميميًّا بل ثلاث حقائق تقنية:
 *
 *   1. **أندرويد**: `expo-blur` افتراضيه `blurMethod: 'none'` — أي «اعرض
 *      عرضًا شبه شفاف بدل التمويه». والتمويه الحقيقي يحتاج أندرويد 12+
 *      (`dimezisBlurViewSdk31Plus`)، وما دونه يرجع إلى نفس العرض الشبه شفاف.
 *   2. **الأداء**: تمويه الخلفية عملية GPU لكل إطار. وضعه تحت قائمة طويلة
 *      يُسخّن الجهاز ويُسقط الإطارات — والمستخدم طلب «أداء سريع» صراحةً.
 *   3. **الويب**: `BlurView.web` يستخدم `backdrop-filter`، وهو غير مدعوم في
 *      كل المتصفّحات.
 *
 * ⇒ فالقاعدة: **`backgroundColor: t.colors.glass` هو التصميم**، و`BlurView`
 * يُرسم فوقه كتحسين. لا يعتمد أي شيء على وجوده.
 *
 * ── لماذا `BlurView` فوق اللون لا تحته ────────────────────────────────────
 *
 * لو وُضع التمويه أولًا ثم اللون فوقه لكان تمويهًا لطبقتنا لا للخريطة —
 * أي بلا أثر. الترتيب الصحيح: تمويه الخلفية، ثم صبغة شبه شفافة فوقه.
 */

export type GlassSurfaceProps = ViewProps & {
  /** نصف القطر — من `t.radius`. */
  radius?: number
  /**
   * شدّة التمويه 1–100.
   *
   * الافتراضي منخفض عن قصد: الأسطح هنا كبيرة، والشدّة العالية عليها تعني
   * عمل GPU كثيرًا مقابل فرق بصري ضئيل.
   */
  intensity?: number
  /**
   * أطفئ التمويه للأسطح الكبيرة أو المكرّرة (صفوف قائمة، خلفية قابلة
   * للتمرير). الطبقة اللونية وحدها تكفي.
   */
  blur?: boolean
}

export function GlassSurface({
  radius,
  intensity = 36,
  blur = true,
  style,
  children,
  ...rest
}: GlassSurfaceProps) {
  const t = useTheme()
  const corner = radius ?? t.radius['3xl']

  return (
    <View
      style={[
        {
          borderRadius: corner,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: t.colors.glassBorder,
          // يقصّ التمويه عند الحواف الدائرية — بدونه يظهر مستطيل التمويه
          // خارج الزوايا.
          overflow: 'hidden',
        },
        style,
      ]}
      {...rest}
    >
      {blur ? (
        <BlurView
          // `dimezisBlurViewSdk31Plus` على أندرويد: تمويه حقيقي على 12+،
          // و`none` (عرض شبه شفاف) على ما دونه — وهو بالضبط طبقتنا اللونية.
          blurMethod="dimezisBlurViewSdk31Plus"
          tint={t.isDark ? 'dark' : 'light'}
          intensity={intensity}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <View
        style={[StyleSheet.absoluteFill, { backgroundColor: t.colors.glass }]}
        // الطبقة اللونية ليست هدفًا للمس — وإلا حجبت الضغط عن الأبناء.
        pointerEvents="none"
      />
      {children}
    </View>
  )
}

/**
 * بطاقة زجاجية — سطح زجاجي بحشوة قياسية.
 *
 * ⚠️ الحشوة على غلاف داخلي لا على `GlassSurface` نفسها، لأن الحشوة على
 * الحاوية تُزيح طبقة التمويه (المطلقة نسبةً إليها) عن موضعها.
 */
export function GlassCard({
  padded = true,
  radius,
  intensity,
  blur,
  style,
  children,
  ...rest
}: GlassSurfaceProps & { padded?: boolean }) {
  const t = useTheme()

  return (
    <GlassSurface radius={radius ?? t.radius['2xl']} intensity={intensity} blur={blur} style={style} {...rest}>
      <View style={padded ? { padding: t.space[5] } : undefined}>{children}</View>
    </GlassSurface>
  )
}
