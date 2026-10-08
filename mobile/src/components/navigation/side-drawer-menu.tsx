import { useUser } from '@clerk/clerk-expo'
import { usePathname, useRouter } from 'expo-router'
import {
  Bell,
  ChevronLeft,
  ClipboardList,
  LogOut,
  MapPin,
  Settings,
  type LucideIcon,
} from 'lucide-react-native'
import { useState } from 'react'
import { Image, Pressable, StyleSheet, View } from 'react-native'

import { GlassSurface } from '@/components/ui/glass'
import { AppText } from '@/components/ui/text'
import { haptic } from '@/lib/haptics'
import { useSession } from '@/lib/auth'
import { useTheme } from '@/theme'

import { useSideDrawer } from './side-drawer'

/**
 * محتوى القائمة الجانبية: البروفايل ثم وجهات التنقّل.
 *
 * ── `useUser` لا نسخة ثانية من البيانات ───────────────────────────────────
 *
 * الصورة والبريد يأتيان من **Clerk** مباشرةً (`useUser`)، وهو نفس مصدر
 * الهوية على الويب — فلا يوجد حقل «اسم» ثانٍ في قاعدة بياناتنا يمكن أن
 * يتباعد عن Clerk. و`useSession` تُستعمل للإخراج فقط، لأنها تغلّف `signOut`
 * في مكان واحد.
 *
 * ── الوجهات هي التبويبات نفسها ────────────────────────────────────────────
 *
 * القائمة لا تُنشئ تنقّلًا ثانيًا: كل بند يقود إلى تبويب قائم. هذا مقصود —
 * قائمة تُوصل إلى وجهات لا وجود لها في الشريط السفلي تُنتج مسارين للوصول
 * إلى الشاشة نفسها، وهما يتباعدان عند أول تعديل.
 */

type Destination = {
  label: string
  /** المسار كما يعيده `usePathname` — لا صيغة `href`. */
  path: string
  href: '/(tabs)' | '/(tabs)/orders' | '/(tabs)/notifications' | '/(tabs)/account'
  icon: LucideIcon
}

const DESTINATIONS: readonly Destination[] = [
  { label: 'الرئيسية', path: '/', href: '/(tabs)', icon: MapPin },
  { label: 'طلباتي', path: '/orders', href: '/(tabs)/orders', icon: ClipboardList },
  { label: 'التنبيهات', path: '/notifications', href: '/(tabs)/notifications', icon: Bell },
  { label: 'الإعدادات', path: '/account', href: '/(tabs)/account', icon: Settings },
] as const

/** أول حرفين من الاسم — بديل الصورة حين لا صورة للحساب. */
function initialsOf(name: string | null | undefined): string {
  if (!name) return '؟'
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((part) => part.charAt(0)).join('') || '؟'
}

export function SideDrawerMenu() {
  const t = useTheme()
  const router = useRouter()
  const pathname = usePathname()
  const { close } = useSideDrawer()
  const { displayName, phone, signOut } = useSession()
  const { user } = useUser()

  const [busy, setBusy] = useState(false)

  const email = user?.primaryEmailAddress?.emailAddress ?? null
  // ⚠️ الصورة تُشترط بوجود رابط فعلي: `source={{ uri: '' }}` ليس صورة ناقصة
  // بل طلب بلا عنوان — وفي الويب يجعل المتصفّح يعيد تحميل الصفحة كصورة.
  const imageUrl = user?.imageUrl?.trim() || null

  const go = (href: Destination['href']) => {
    haptic.select()
    // `navigate` لا `push`: الوجهات تبويبات قائمة، و`push` كان سيُكدّس
    // نسخة جديدة في كل فتحة فيمتلئ سجلّ الرجوع بنسخ الشاشة نفسها.
    router.navigate(href)
    close()
  }

  const handleSignOut = async () => {
    if (busy) return
    setBusy(true)
    try {
      close()
      await signOut()
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.host}>
      {/* ── البروفايل ───────────────────────────────────────────────────── */}
      <View style={[styles.profile, { paddingBottom: t.space[5] }]}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={[styles.avatar, { borderColor: t.colors.border }]} />
        ) : (
          <View style={[styles.avatar, { backgroundColor: t.colors.accent, borderColor: t.colors.border }]}>
            <AppText variant="heading" weight="heavy" tone="onAccent">
              {initialsOf(displayName)}
            </AppText>
          </View>
        )}

        <View style={styles.identity}>
          <AppText variant="label" weight="bold" numberOfLines={1}>
            {displayName ?? 'حسابي'}
          </AppText>
          <AppText variant="caption" tone="muted" numberOfLines={1} ltr={Boolean(email)}>
            {email ?? phone ?? '—'}
          </AppText>
        </View>
      </View>

      {/* ── الوجهات ─────────────────────────────────────────────────────── */}
      <View style={{ gap: t.space[1] }}>
        {DESTINATIONS.map((destination) => {
          const active = pathname === destination.path
          const Icon = destination.icon

          return (
            <Pressable
              key={destination.href}
              accessibilityRole="button"
              accessibilityLabel={destination.label}
              accessibilityState={{ selected: active }}
              onPress={() => go(destination.href)}
              android_ripple={{ color: t.colors.borderLight }}
              style={({ pressed }) => [
                styles.item,
                {
                  borderRadius: t.radius.lg,
                  paddingVertical: t.space[3],
                  paddingHorizontal: t.space[4],
                  backgroundColor: active ? t.colors.accent : 'transparent',
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Icon
                size={20}
                strokeWidth={2.2}
                color={active ? t.colors.onAccent : t.colors.textMuted}
              />
              <AppText
                variant="label"
                weight={active ? 'bold' : 'semibold'}
                tone={active ? 'onAccent' : 'default'}
                style={styles.itemLabel}
              >
                {destination.label}
              </AppText>
              <ChevronLeft
                size={16}
                strokeWidth={2.2}
                color={active ? t.colors.onAccent : t.colors.textMuted}
              />
            </Pressable>
          )
        })}
      </View>

      <View style={styles.spacer} />

      {/* ── الإخراج ─────────────────────────────────────────────────────── */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="تسجيل الخروج"
        disabled={busy}
        onPress={handleSignOut}
        android_ripple={{ color: t.colors.borderLight }}
        style={({ pressed }) => [
          styles.item,
          {
            borderRadius: t.radius.lg,
            paddingVertical: t.space[3],
            paddingHorizontal: t.space[4],
            opacity: busy ? 0.5 : pressed ? 0.85 : 1,
          },
        ]}
      >
        <LogOut size={20} strokeWidth={2.2} color={t.colors.error} />
        <AppText variant="label" weight="semibold" tone="error" style={styles.itemLabel}>
          تسجيل الخروج
        </AppText>
      </Pressable>

      <View style={[styles.footer, { paddingTop: t.space[4] }]}>
        <GlassSurface radius={t.radius.pill} intensity={20} style={styles.badge}>
          <AppText variant="caption" tone="muted">
            فاحص
          </AppText>
        </GlassSurface>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  host: { flex: 1 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identity: { flex: 1, minWidth: 0 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  itemLabel: { flex: 1, minWidth: 0 },
  spacer: { flex: 1 },
  footer: { flexDirection: 'row', justifyContent: 'center' },
  badge: { paddingHorizontal: 14, paddingVertical: 6 },
})
