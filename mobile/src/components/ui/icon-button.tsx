import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native'

import { haptic } from '@/lib/haptics'
import { useTheme } from '@/theme'

import { GlassSurface } from './glass'

/**
 * زرّ أيقونة دائري عائم — العنصر الذي يقف فوق الخريطة.
 *
 * ── لماذا مكوّن مستقلّ لا `Button` بحجم صغير ───────────────────────────────
 *
 * الزرّ العائم يختلف عن زرّ النموذج في ثلاثة أمور لا تُعبَّر عنها بخاصية:
 *   • **الشكل دائري تمامًا** (`radius.pill`) لا مستطيل بنصف قطر.
 *   • **المحتوى أيقونة لا نصّ**، فالتوسيط البصري يختلف (الأيقونة تُوسَّط
 *     هندسيًّا، والنصّ يُوسَّط بحسب ارتفاع السطر).
 *   • **سطحه زجاجي فوق خريطة** لا لون الهوية — وإلا غرق الزرّ في الخريطة.
 *
 * ── القياس ────────────────────────────────────────────────────────────────
 *
 * الحدّ الأدنى 44 نقطة (توصية Apple وGoogle معًا). و`sm` هنا 44 لا أصغر —
 * لا وجود لحجم أصغر من حدّ اللمس في هذا المكوّن، عن قصد.
 */

export type IconButtonVariant = 'glass' | 'solid' | 'plain'
export type IconButtonSize = 'sm' | 'md' | 'lg'

const SIZE: Record<IconButtonSize, number> = { sm: 44, md: 52, lg: 56 }

export type IconButtonProps = {
  /** مكوّن أيقونة من `lucide-react-native`. */
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>
  onPress: () => void
  /** نصّ لقارئ الشاشة — إلزامي لأن الزرّ بلا نصّ ظاهر. */
  label: string
  variant?: IconButtonVariant
  size?: IconButtonSize
  disabled?: boolean
  /** عدّاد التنبيهات. صفر أو أقل = لا شارة. */
  badge?: number
  style?: ViewStyle
}

export function IconButton({
  icon: Icon,
  onPress,
  label,
  variant = 'glass',
  size = 'md',
  disabled = false,
  badge = 0,
  style,
}: IconButtonProps) {
  const t = useTheme()
  const dimension = SIZE[size]
  const iconSize = Math.round(dimension * 0.44)

  const color = variant === 'solid' ? t.colors.onAccent : disabled ? t.colors.textMuted : t.colors.text

  const button = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => {
        // الاهتزاز قبل الإجراء: الإحساس يجب أن يسبق الأثر ليشعر المستخدم
        // أن الضغطة وصلت.
        haptic.tap()
        onPress()
      }}
      android_ripple={{ color: t.colors.borderLight, borderless: true, radius: dimension / 2 }}
      style={({ pressed }) => [
        styles.base,
        {
          width: dimension,
          height: dimension,
          borderRadius: t.radius.pill,
          backgroundColor: variant === 'solid' ? t.colors.accent : 'transparent',
          // `plain` بلا خلفية: لزرّ داخل شريط له سطحه أصلًا.
          opacity: disabled ? 0.45 : pressed ? 0.82 : 1,
        },
        variant === 'solid' ? t.shadow.brand : variant === 'glass' ? t.shadow.sm : null,
      ]}
    >
      <Icon color={color} size={iconSize} strokeWidth={2.2} />
    </Pressable>
  )

  return (
    <View style={style}>
      {variant === 'glass' ? (
        <GlassSurface radius={t.radius.pill} intensity={28}>
          {button}
        </GlassSurface>
      ) : (
        button
      )}
      {badge > 0 ? <CountBadge count={badge} /> : null}
    </View>
  )
}

/**
 * شارة العدّ — كبسولة صغيرة أعلى الزرّ.
 *
 * ⚠️ تُوضع خارج `GlassSurface` لا داخلها: داخلها تُقصّ بـ`overflow: hidden`
 * الذي يحتاجه الزجاج ليقصّ التمويه عند الزوايا الدائرية.
 */
function CountBadge({ count }: { count: number }) {
  const t = useTheme()
  const text = count > 9 ? '9+' : String(count)

  return (
    <View
      pointerEvents="none"
      style={[
        styles.badge,
        {
          backgroundColor: t.colors.error,
          borderColor: t.colors.surface,
          paddingHorizontal: count > 9 ? 4 : 0,
          minWidth: 20,
        },
      ]}
    >
      {/* ⚠️ 12 لا أصغر — قاعدة المنتج: لا شيء يُعرض تحت 12. ولذلك ارتفاع
          الشارة 20 لا 16. */}
      <Text style={{ color: t.colors.onAccent, fontSize: 12, lineHeight: 15, fontFamily: t.font.bold }}>
        {text}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    height: 20,
    borderRadius: 999,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
