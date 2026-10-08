import { useUser } from '@clerk/clerk-expo'
import { Image, Pressable, StyleSheet, View } from 'react-native'

import { GlassSurface } from '@/components/ui/glass'
import { AppText } from '@/components/ui/text'
import { useSession } from '@/lib/auth'
import { useTheme } from '@/theme'

import { useSideDrawer } from './side-drawer'

/**
 * زرّ صورة البروفايل — يفتح القائمة الجانبية.
 *
 * ── لماذا مكوّن مستقلّ ────────────────────────────────────────────────────
 *
 * لأن الزرّ يظهر في **كل شاشة** (الشريط العائم فوق الخريطة، ورأس القوائم).
 * ولو بُني في كل شاشة لصار `useUser` + `useSideDrawer` + الصورة البديلة
 * مكرّرةً ثلاث مرّات، وأوّل شاشة تُنسى فيها الصورة البديلة تُظهر دائرة فارغة.
 *
 * ── ⚠️ الصورة تُشترط بوجود رابط فعلي ───────────────────────────────────────
 *
 * `source={{ uri: '' }}` ليس «صورة ناقصة» بل طلب بلا عنوان. وفي الويب تحديدًا
 * `<img src="">` يجعل المتصفّح يعيد تحميل **الصفحة كصورة** — عطل صامت ومكلف.
 * فالفحص `.trim() || null` قبل العرض، لا بعده.
 */

/** أول حرفين من الاسم — بديل الصورة. */
function initialsOf(name: string | null | undefined): string {
  if (!name) return '؟'
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((part) => part.charAt(0)).join('') || '؟'
}

export function AvatarButton({ size = 52 }: { size?: number }) {
  const t = useTheme()
  const { open } = useSideDrawer()
  const { displayName } = useSession()
  const { user } = useUser()

  const imageUrl = user?.imageUrl?.trim() || null

  return (
    <View style={t.shadow.sm}>
      <GlassSurface radius={t.radius.pill} intensity={28}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="افتح القائمة الجانبية"
          onPress={open}
          android_ripple={{ color: t.colors.borderLight, borderless: true, radius: size / 2 }}
          style={({ pressed }) => [
            styles.target,
            { width: size, height: size, borderRadius: t.radius.pill, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={{ width: size, height: size }} />
          ) : (
            <AppText variant="label" weight="bold" tone="accent">
              {initialsOf(displayName)}
            </AppText>
          )}
        </Pressable>
      </GlassSurface>
    </View>
  )
}

const styles = StyleSheet.create({
  target: { alignItems: 'center', justifyContent: 'center' },
})
