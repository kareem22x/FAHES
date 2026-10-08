import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'

import { useTheme } from '@/theme'

import { AppText } from './text'

/**
 * الزرّ.
 *
 * ── أهداف اللمس ───────────────────────────────────────────────────────────
 *
 * أصغر ارتفاع 44 نقطة (توصية Apple وGoogle معًا). هذا ليس ترفًا جماليًّا:
 * الفاحص يستخدم التطبيق واقفًا في الشارع، بيد واحدة، والشمس على الشاشة.
 * زرّ بارتفاع 32 يُنتج أخطاء ضغط متكرّرة.
 *
 * ── حالة التحميل ──────────────────────────────────────────────────────────
 *
 * عند `loading` يُستبدل المحتوى بمؤشّر **ويُمنع الضغط**. البديل الشائع —
 * إبقاء الزرّ قابلًا للضغط وإظهار المؤشّر بجانبه — يُنتج ضغطات مزدوجة تُنشئ
 * طلبين. `disabled` هنا يحلّ ذلك في مكان واحد بدل تكراره في كل شاشة.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

type ButtonProps = {
  label: string
  onPress: () => void
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  disabled?: boolean
  /** عنصر أيقونة قبل النصّ (من `lucide-react-native` أو غيره). */
  icon?: React.ReactNode
  fullWidth?: boolean
  style?: StyleProp<ViewStyle>
}

const HEIGHTS: Record<ButtonSize, number> = { sm: 40, md: 48, lg: 56 }
const PADDING: Record<ButtonSize, number> = { sm: 12, md: 16, lg: 20 }

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  fullWidth = true,
  style,
}: ButtonProps) {
  const t = useTheme()

  const isInert = disabled || loading

  const background =
    variant === 'primary'
      ? t.colors.accent
      : variant === 'danger'
        ? t.colors.error
        : variant === 'secondary'
          ? t.colors.surface
          : 'transparent'

  const borderColor =
    variant === 'secondary' ? t.colors.border : variant === 'ghost' ? 'transparent' : background

  const labelTone = variant === 'primary' || variant === 'danger' ? 'onAccent' : variant === 'ghost' ? 'accent' : 'default'

  return (
    <Pressable
      onPress={onPress}
      disabled={isInert}
      accessibilityRole="button"
      accessibilityState={{ disabled: isInert, busy: loading }}
      accessibilityLabel={label}
      android_ripple={variant === 'primary' || variant === 'danger' ? undefined : { color: t.colors.borderLight }}
      style={({ pressed }) => [
        styles.base,
        {
          height: HEIGHTS[size],
          paddingHorizontal: PADDING[size],
          backgroundColor: background,
          borderColor,
          borderWidth: variant === 'secondary' ? 1 : 0,
          borderRadius: t.radius.sm,
          opacity: isInert ? 0.55 : pressed ? 0.88 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        variant === 'primary' ? t.shadow.brand : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={labelTone === 'onAccent' ? t.colors.onAccent : t.colors.accent} />
      ) : (
        <View style={styles.row}>
          {icon ? <View style={styles.icon}>{icon}</View> : null}
          <AppText variant={size === 'sm' ? 'label' : 'body'} weight="bold" tone={labelTone}>
            {label}
          </AppText>
        </View>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    // لا `flexDirection: 'row'` هنا: `row` تُقلب تلقائيًّا في RTL، لكن صفًّا
    // واحدًا لا فرق له. التركيز على التوسيط.
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  icon: { marginTop: 1 },
})
