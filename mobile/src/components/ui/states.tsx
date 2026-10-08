import { useEffect } from 'react'
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'

import { useTheme } from '@/theme'

import { Button } from './button'
import { AppText } from './text'

/**
 * حالات الشاشة الثلاث: التحميل، الفراغ، الخطأ.
 *
 * ── لماذا مكوّنات لا `if` في كل شاشة ──────────────────────────────────────
 *
 * الشاشة التي لا تعالج «الفراغ» تُنتج مستخدمًا يحدّق في شاشة بيضاء ولا يعرف
 * إن كان التطبيق يعمل. ومع 20 شاشة قادمة، كتابة ذلك في كل واحدة تعني 20
 * نسخة تتباعد. هنا نسخة واحدة، ونصّ عربي واضح لكل حالة.
 *
 * ⚠️ **نصّ الخطأ يأتي من الخادم جاهزًا** (`ApiError.message`) ولا يُعاد
 * صياغته. إعادة الصياغة تُنتج نسختين من الرسالة تتباعدان عند أول تعديل على
 * الخادم.
 */

/** مؤشّر تحميل متمركز في المساحة المتاحة. */
export function LoadingState({ label = 'جارٍ التحميل…' }: { label?: string }) {
  const t = useTheme()
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={t.colors.accent} />
      <AppText variant="caption" tone="muted" style={{ marginTop: t.space[3] }}>
        {label}
      </AppText>
    </View>
  )
}

/** حالة فراغ مع إجراء اختياري. */
export function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
  icon,
}: {
  title: string
  body?: string
  actionLabel?: string
  onAction?: () => void
  icon?: React.ReactNode
}) {
  const t = useTheme()
  return (
    <View style={styles.center}>
      {icon ? <View style={{ marginBottom: t.space[4] }}>{icon}</View> : null}
      <AppText variant="heading" weight="bold" align="center">
        {title}
      </AppText>
      {body ? (
        <AppText variant="body" tone="muted" align="center" style={{ marginTop: t.space[2] }}>
          {body}
        </AppText>
      ) : null}
      {actionLabel && onAction ? (
        <Button
          label={actionLabel}
          onPress={onAction}
          variant="secondary"
          size="sm"
          fullWidth={false}
          style={{ marginTop: t.space[5] }}
        />
      ) : null}
    </View>
  )
}

/**
 * حالة خطأ.
 *
 * `onRetry` يُعرض فقط إن كان الخطأ **قابلًا لإعادة المحاولة**. عرض «أعد
 * المحاولة» على خطأ صلاحية (403) أو مدخل خاطئ (400) يعلّم المستخدم أن الزرّ
 * لا يعمل — والصحيح أن يُوجَّه إلى السبب.
 */export function ErrorState({
  message,
  onRetry,
  retryable = true,
}: {
  message: string
  onRetry?: () => void
  retryable?: boolean
}) {
  const t = useTheme()
  return (
    <View style={styles.center}>
      <AppText variant="heading" weight="bold" align="center">
        تعذّر إكمال العملية
      </AppText>
      <AppText variant="body" tone="muted" align="center" style={{ marginTop: t.space[2] }}>
        {message}
      </AppText>
      {onRetry && retryable ? (
        <Button
          label="أعد المحاولة"
          onPress={onRetry}
          variant="secondary"
          size="sm"
          fullWidth={false}
          style={{ marginTop: t.space[5] }}
        />
      ) : null}
    </View>
  )
}

/**
 * هيكل تحميل نابض — بديل `ActivityIndicator` في القوائم.
 *
 * ── لماذا الهيكل أهمّ ممّا يبدو ────────────────────────────────────────────
 *
 * المؤشّر الدوّار يقول «انتظر». والهيكل يقول **«هذا ما سيظهر، وقد وصل الآن»**.
 * وهو ما يجعل التطبيق يبدو سريعًا قبل أن يكون سريعًا: العين ترى الشكل النهائي
 * فتُدرك الاستمرارية، بدل شاشة فارغة ثم قفزة.
 *
 * ⚠️ ورمز `skeleton` كان **موجودًا في اللوحة ومعطّلًا**: `colors.ts` تعرّفه،
 * ولا مكوّن يستعمله — كان يُستعمل للون زرّ معطّل فقط (`button.tsx`). ورمز
 * تصميمي بلا مستهلك يعني نيّة لم تُنفَّذ. هذا هو مستهلكه.
 *
 * ── النبض بـ`reanimated` لا بـ`Animated` ──────────────────────────────────
 *
 * `Animated` في React Native يحتاج `useNativeDriver` الذي **لا نظير له على
 * الويب** فيُطلق تحذيرًا في كل إطار. و`reanimated` تعمل على المنصّتين
 * بالشيفرة نفسها، وتضع النبض على **UI thread** فلا يتقطّع أثناء تحميل البيانات
 * — وهو بالضبط الوقت الذي يعمل فيه الـJS thread بأقصى طاقته.
 *
 * ⚠️ **موقع كتابة واحد** للقيمة المشتركة: الكتابة داخل `useEffect` وحده.
 * (قاعدة `react-hooks/immutability` ترفض **ثاني** دالّة تكتب القيمة نفسها في
 * مكوّن واحد — انظر رأس `bottom-sheet.tsx` القديم وتقرير القاعدة في
 * `MOBILE.md`.)
 */
export function Skeleton({
  width,
  height,
  radius,
  style,
}: {
  width?: number | `${number}%`
  height: number
  radius?: number
  style?: StyleProp<ViewStyle>
}) {
  const t = useTheme()
  const pulse = useSharedValue(0.55)

  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 780 }), -1, true)
  }, [pulse])

  const animated = useAnimatedStyle(() => ({ opacity: pulse.value }))

  return (
    <Animated.View
      style={[
        {
          width: width ?? '100%',
          height,
          borderRadius: radius ?? t.radius.sm,
          backgroundColor: t.colors.skeleton,
        },
        animated,
        style,
      ]}
    />
  )
}

/**
 * هيكل قائمة — بطاقات بشكل صفوف الطلبات/التنبيهات.
 *
 * ⚠️ `count` افتراضيه 4 لا 10: الهيكل يملأ **الشاشة الأولى** لا القائمة كلها.
 * ورسم عشرين بطاقة وهمية يعني عملًا لا يراه أحد وتمريرًا لا معنى له.
 */
export function SkeletonList({ count = 4, gap }: { count?: number; gap?: number }) {
  const t = useTheme()
  return (
    <View
      style={{ paddingHorizontal: t.space[4], paddingTop: t.space[4], gap: gap ?? t.space[3] }}
      accessibilityRole="progressbar"
      accessibilityLabel="جارٍ التحميل"
    >
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={{
            borderRadius: t.radius['2xl'],
            borderWidth: 1,
            borderColor: t.colors.borderLight,
            backgroundColor: t.colors.surface,
            padding: t.space[4],
            gap: t.space[2],
          }}
        >
          <Skeleton height={18} width="62%" />
          <Skeleton height={13} width="38%" />
          <Skeleton height={13} width="80%" />
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
  },
})
