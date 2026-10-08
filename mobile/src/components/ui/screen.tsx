import { ScrollView, StyleSheet, View, type ViewProps } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useTheme } from '@/theme'

/**
 * حاوية الشاشة — الخلفية والهوامش الآمنة.
 *
 * ── لماذا `useSafeAreaInsets` لا `SafeAreaView` ───────────────────────────
 *
 * `SafeAreaView` من `react-native` يضيف الهوامش العلوية والسفلية **معًا**
 * دائمًا. وهذا خطأ في شاشة فيها شريط تبويب سفلي: التبويب نفسه يستهلك الهامش
 * السفلي، فتُضاف مسافة ميتة فوقه. `useSafeAreaInsets` يمنح القيم منفصلة
 * فتختار كل شاشة ما تحتاجه فعلًا.
 *
 * `edges` يحدّد ما يُطبَّق: الشاشات داخل تبويبات تتخطّى `bottom` (التبويب
 * يتحمّلها)، والشاشات المكدّسة تطلبها.
 */

type ScreenProps = ViewProps & {
  /** مرّر المحتوى في `ScrollView` بدل حبسه. */
  scroll?: boolean
  /**
   * الهوامش الآمنة المطلوبة. الافتراضي `top` فقط: أغلب الشاشات تعيش داخل
   * تبويب يستهلك الهامش السفلي، وإضافة `bottom` هنا كانت ستُنتج فراغًا
   * ميتًا أسفل كل قائمة.
   */
  edges?: { top?: boolean; bottom?: boolean }
  /** هوامش أفقية قياسية (16). أوقفها لشاشات تريد التحكّم بنفسها. */
  padded?: boolean
  /** خلفية سطح مرتفع بدل خلفية الشاشة. */
  surface?: boolean
}

const H_PADDING = 16

export function Screen({
  scroll = false,
  edges = { top: true, bottom: false },
  padded = true,
  surface = false,
  style,
  children,
  ...rest
}: ScreenProps) {
  const t = useTheme()
  const insets = useSafeAreaInsets()

  const container = [
    styles.fill,
    {
      backgroundColor: surface ? t.colors.surface : t.colors.background,
      paddingTop: edges.top ? insets.top : 0,
      paddingBottom: edges.bottom ? insets.bottom : 0,
    },
  ]

  const contentPadding = padded ? { paddingHorizontal: H_PADDING } : null

  if (scroll) {
    return (
      <ScrollView
        style={container}
        contentContainerStyle={[contentPadding, style]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        {...rest}
      >
        {children}
      </ScrollView>
    )
  }

  return (
    <View style={container} {...rest}>
      <View style={[styles.fill, contentPadding, style]}>{children}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
})
