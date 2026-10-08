import { Pressable, StyleSheet, View, type ViewProps } from 'react-native'

import { useTheme } from '@/theme'

/**
 * البطاقة — سطح مرتفع بحدّ وظلّ.
 *
 * الظلّ يأتي من سلّم الرموز (`shadow.sm`) لا من قيمة مكتوبة، لأن الظلّ في
 * React Native يختلف بين المنصّتين: iOS يقرأ `shadowOpacity`/`shadowRadius`
 * وأندرويد يقرأ `elevation` وحده. كتابة ذلك في كل موضع تُنتج بطاقات مسطّحة
 * على أندرويد وحدها — وهو خطأ يظهر على جهاز المستخدم لا في المحاكي.
 */

type CardProps = ViewProps & {
  /** يجعله قابلًا للضغط مع تأثير ضغط خفيف. */
  onPress?: () => void
  /** ظلّ أعلى للبطاقات التي تطفو فوق محتوى (نافذة، ورقة سفلية). */
  elevated?: boolean
  /** حدّ بلون الهوية — للبطاقة التي تطلب إجراءً. */
  accent?: boolean
}

export function Card({ onPress, elevated = false, accent = false, style, children, ...rest }: CardProps) {
  const t = useTheme()

  const base = [
    styles.card,
    {
      backgroundColor: t.colors.surface,
      borderColor: accent ? t.colors.accent : t.colors.border,
      borderRadius: t.radius.md,
      borderWidth: accent ? 1.5 : 1,
    },
    elevated ? t.shadow.md : t.shadow.sm,
    style,
  ]

  if (!onPress) {
    return (
      <View style={base} {...rest}>
        {children}
      </View>
    )
  }

  return (
    <Pressable
      onPress={onPress}
      // `android_ripple` يعطي إحساسًا أصليًّا على أندرويد، و`opacity` يغطّي
      // iOS حيث لا يوجد ripple. بدونهما تبدو البطاقة ميتة عند اللمس.
      android_ripple={{ color: t.colors.borderLight, borderless: false }}
      style={({ pressed }) => [...base, pressed ? { opacity: 0.9 } : null]}
      {...rest}
    >
      {children}
    </Pressable>
  )
}

/** مقسّم داخلي بين أقسام البطاقة. */
export function Divider({ inset = 0 }: { inset?: number }) {
  const t = useTheme()
  return <View style={{ height: 1, backgroundColor: t.colors.borderLight, marginHorizontal: inset }} />
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden' },
})
