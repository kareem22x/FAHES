import { StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { AvatarButton } from '@/components/navigation/avatar-button'
import { useTheme } from '@/theme'

import { AppText } from './text'

/**
 * رأس موحّد لشاشات القوائم.
 *
 * ── لماذا مكوّن لا `AppText` في كل شاشة ───────────────────────────────────
 *
 * لأن الرأس يحمل **زرّ القائمة الجانبية** (صورة البروفايل)، وهو الزرّ الذي
 * طلبه التصميم في أعلى اليمين. ولو كُتب في كل شاشة لكانت أوّل شاشة تُنسى فيها
 * الوجهة الوحيدة إلى القائمة — فيصير الدرج غير قابل للفتح من تلك الشاشة.
 *
 * ── الترتيب ───────────────────────────────────────────────────────────────
 *
 * البروفايل **أوّلًا** في صفّ `row`: في العربية يُرسم على حافة البداية أي
 * اليمين، بلا أي `left`/`right` (انظر شرح التموضع في `side-drawer.tsx`).
 * ثم كتلة العنوان، ثم إجراء اختياري في الطرف المقابل.
 *
 * ⚠️ والهامش العلوي الآمن يأتي من `useSafeAreaInsets` هنا لا من `Screen`:
 * الرأس يُركَّب **داخل** `Screen` التي طبّقت الهامش أصلًا حين `edges.top`،
 * فإضافته ثانيةً تُنتج فراغًا مزدوجًا. لذلك تُستعمل هذه الشاشات مع
 * `edges={{ top: false }}` — وهو شرط على المستدعي لا خيار.
 */

export function ScreenHeader({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  /** إجراء في الطرف المقابل (زرّ نصّي عادةً). */
  action?: React.ReactNode
}) {
  const t = useTheme()
  const insets = useSafeAreaInsets()

  return (
    <View
      style={[
        styles.host,
        {
          paddingTop: insets.top + t.space[3],
          paddingBottom: t.space[3],
          paddingHorizontal: t.space[4],
          gap: t.space[3],
        },
      ]}
    >
      <AvatarButton size={48} />

      <View style={styles.text}>
        <AppText variant="heading" weight="heavy" numberOfLines={1}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="caption" tone="muted" numberOfLines={1} style={{ marginTop: 2 }}>
            {subtitle}
          </AppText>
        ) : null}
      </View>

      {action}
    </View>
  )
}

const styles = StyleSheet.create({
  host: { flexDirection: 'row', alignItems: 'center' },
  text: { flex: 1, minWidth: 0 },
})
