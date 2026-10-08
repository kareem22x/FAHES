import { FlashList } from '@shopify/flash-list'
import * as WebBrowser from 'expo-web-browser'
import { BellOff, CheckCheck } from 'lucide-react-native'
import { useCallback } from 'react'
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native'

import { Screen } from '@/components/ui/screen'
import { ScreenHeader } from '@/components/ui/screen-header'
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/states'
import { AppText } from '@/components/ui/text'
import { useNotifications } from '@/hooks/use-notifications'
import { useSession } from '@/lib/auth'
import { env } from '@/lib/env'
import { haptic } from '@/lib/haptics'
import {
  notificationKindLabel,
  notificationTone,
  type AppNotification,
} from '@/lib/notification-types'
import { formatArabicDate } from '@/lib/status'
import { useTheme } from '@/theme'

/**
 * التنبيهات — تبويب حقيقي لا شاشة «قريبًا».
 *
 * ── لماذا هذه الشاشة حقيقية بينما شاشة أخرى قد لا تكون ────────────────────
 *
 * لأن الخادم **يملك المسار فعلًا**: `GET /api/notifications` يعيد
 * `{ notifications, unread }` لجلسة المستخدم، و`POST` يُعلّم مقروءًا (واحدًا
 * أو الكل). فالتبويب يعرض بيانات حقيقية بلا حاجة إلى أي مصطنع.
 *
 * ── ما لا تفعله الشاشة ────────────────────────────────────────────────────
 *
 * لا تفتح شاشة تفاصيل داخلية: `href` في الإشعار **مسار ويب**
 * (`/dashboard/requests/xxx`)، وفتحه في المتصفّح هو الصدق نفسه المتّبع في
 * الشاشة الرئيسية. ولا يوجد مسار داخلي مقابل له بعد.
 *
 * ── تحديث متفائل ──────────────────────────────────────────────────────────
 *
 * النقر يُعلّم مقروءًا محليًّا فورًا ثم يُبلّغ الخادم (في `useNotifications`).
 * لو انتظرنا الخادم لبقي الإشعار «غير مقروء» 300ms+ بعد نقرة صريحة، وهو ما
 * يُشعر المستخدم أن النقر لم يعمل.
 *
 * ── `FlashList` لا `FlatList` ─────────────────────────────────────────────
 *
 * إعادة تدوير الخلايا (recycling) بدل إبقاء حاوية لكل صفّ مرّ. والتفصيل في
 * `orders.tsx` — وهو نفس السبب ونفس التحذير: **v2 حذفت `estimatedItemSize`**.
 */

/** شريط الخطورة على حافة البداية — يميّز النوع بلا استعمال شارة كاملة. */
function SeverityBar({ notification }: { notification: AppNotification }) {
  const t = useTheme()
  const tone = t.feedback[notificationTone(notification.severity)]
  return <View style={[styles.severity, { backgroundColor: tone.text, borderRadius: 999 }]} />
}

export default function NotificationsScreen() {
  const t = useTheme()
  const { isSignedIn } = useSession()
  const { notifications, unread, loading, refreshing, error, retryable, refresh, markRead, markAllRead } =
    useNotifications(isSignedIn)

  const open = useCallback(
    (notification: AppNotification) => {
      haptic.tap()
      void markRead(notification.id)
      if (notification.href) {
        void WebBrowser.openBrowserAsync(`${env.apiUrl}${notification.href}`)
      }
    },
    [markRead],
  )

  const renderItem = useCallback(
    ({ item }: { item: AppNotification }) => {
      const tone = t.feedback[notificationTone(item.severity)]
      const isUnread = item.readAt === null

      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${notificationKindLabel(item.kind)}: ${item.title}`}
          accessibilityState={{ selected: isUnread }}
          onPress={() => open(item)}
          android_ripple={{ color: t.colors.borderLight }}
          style={({ pressed }) => [
            styles.item,
            {
              borderRadius: t.radius['2xl'],
              borderColor: isUnread ? tone.border : t.colors.borderLight,
              backgroundColor: isUnread ? tone.background : t.colors.surface,
              padding: t.space[4],
              marginBottom: t.space[3],
              opacity: pressed ? 0.9 : 1,
            },
          ]}
        >
          <SeverityBar notification={item} />

          <View style={styles.itemBody}>
            <View style={styles.itemHead}>
              <AppText variant="label" weight="bold" numberOfLines={1} style={styles.grow}>
                {item.title}
              </AppText>
              {/* نقطة «غير مقروء» لا شارة عدّ: العدد الكلّي معروض في الرأس،
                  وتكراره على كل صفّ ضجيج. */}
              {isUnread ? <View style={[styles.dot, { backgroundColor: tone.text }]} /> : null}
            </View>

            {item.body ? (
              <AppText variant="caption" numberOfLines={2} style={{ marginTop: t.space[1] }}>
                {item.body}
              </AppText>
            ) : null}

            <View style={[styles.itemMeta, { marginTop: t.space[2] }]}>
              <AppText variant="caption" tone="muted">
                {notificationKindLabel(item.kind)}
              </AppText>
              <AppText variant="caption" tone="muted">
                ·
              </AppText>
              <AppText variant="caption" tone="muted">
                {formatArabicDate(item.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}
              </AppText>
            </View>
          </View>
        </Pressable>
      )
    },
    [open, t],
  )

  const header = (
    <ScreenHeader
      title="التنبيهات"
      subtitle={unread > 0 ? `${unread} تنبيه غير مقروء` : 'كل التنبيهات مقروءة'}
      action={
        unread > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="تحديد الكل كمقروء"
            onPress={() => {
              haptic.select()
              void markAllRead()
            }}
            hitSlop={10}
            style={[styles.markAll, { borderRadius: t.radius.pill, borderColor: t.colors.border, paddingHorizontal: t.space[3], paddingVertical: t.space[2] }]}
          >
            <CheckCheck color={t.colors.accent} size={16} strokeWidth={2.4} />
            <AppText variant="caption" weight="bold" tone="accent">
              تحديد الكل
            </AppText>
          </Pressable>
        ) : undefined
      }
    />
  )

  if (loading) {
    return (
      <Screen padded={false}>
        {header}
        <SkeletonList count={4} />
      </Screen>
    )
  }

  if (error && notifications.length === 0) {
    return (
      <Screen padded={false}>
        {header}
        <ErrorState message={error} onRetry={refresh} retryable={retryable} />
      </Screen>
    )
  }

  return (
    <Screen padded={false}>
      {header}
      <FlashList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[
          styles.list,
          { paddingHorizontal: t.space[4], paddingBottom: t.space[8] },
          notifications.length === 0 ? styles.listEmpty : null,
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={t.colors.accent}
            colors={[t.colors.accent]}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon={<BellOff color={t.colors.textMuted} size={44} strokeWidth={1.5} />}
            title="لا توجد تنبيهات"
            body="ستظهر هنا تحديثات طلباتك: العروض الجديدة، تغيّر حالة الفحص، والمدفوعات."
          />
        }
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  list: { flexGrow: 1 },
  listEmpty: { justifyContent: 'center' },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderWidth: 1 },
  severity: { width: 4, alignSelf: 'stretch', minHeight: 40 },
  itemBody: { flex: 1, minWidth: 0 },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  grow: { flex: 1, minWidth: 0 },
  dot: { width: 8, height: 8, borderRadius: 999 },
  itemMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  markAll: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1 },
})
