import { ActivityIndicator, StyleSheet, View } from 'react-native'

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
 */
export function ErrorState({
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

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
  },
})
