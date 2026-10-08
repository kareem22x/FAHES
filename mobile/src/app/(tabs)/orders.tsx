import { Car } from 'lucide-react-native'
import { useCallback, useMemo } from 'react'
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native'

import { RequestCard } from '@/components/request-card'
import { Screen } from '@/components/ui/screen'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { AppText } from '@/components/ui/text'
import { useSession } from '@/lib/auth'
import { useCustomerRequests } from '@/hooks/use-requests'
import { isActiveStatus } from '@/lib/status'
import { useTheme } from '@/theme'

/**
 * طلباتي — الشاشة الرئيسية للعميل.
 *
 * ── لماذا `FlatList` لا `ScrollView` ──────────────────────────────────────
 *
 * `FlatList` تُنشئ الصفوف المرئية فقط. مع عشرات الطلبات يصير الفرق محسوسًا
 * على جهاز متوسط — و`ScrollView` ترسم الكل دفعة واحدة فتُجمّد الإقلاع.
 *
 * ── الترتيب ───────────────────────────────────────────────────────────────
 *
 * الطلبات الجارية أولًا ثم المكتملة/الملغاة، وداخل كل مجموعة الأحدث أولًا.
 * الفرز في العميل لا في الخادم: القاعدة تعيد ترتيبًا زمنيًّا، وإعادة الفرز
 * هنا تُبقي الخادم عامًّا (يخدم الموقع أيضًا) ولا تُثبّت سياسة عرض واحدة عليه.
 *
 * ── السحب للتحديث ─────────────────────────────────────────────────────────
 *
 * هذا هو الإجراء الأول في التطبيق: العميل يريد أن يعرف «هل وصل الفاحص؟»،
 * ويسحب. لذلك هو على مستوى القائمة كلها لا زرّ في زاوية.
 */

export default function OrdersScreen() {
  const t = useTheme()
  const { displayName, isSignedIn } = useSession()
  // ⚠️ `isSignedIn` لا `true`. المجموعة محروسة في `_layout` فالقيمة ستكون
  // `true` دائمًا عند الرسم — لكن تمرير `true` حرفيًّا كان يجعل الخطّاف يندفع
  // إلى الشبكة بلا جلسة إن نُقلت الشاشة خارج المجموعة يومًا، وينتهي إلى
  // «انتهت الجلسة» بدل أن يبقى ساكنًا.
  const { requests, loading, refreshing, error, retryable, refresh } = useCustomerRequests(isSignedIn)

  /** الجارية أولًا، ثم الأحدث داخل كل مجموعة. */
  const sorted = useMemo(() => {
    return [...requests].sort((a, b) => {
      const activeA = isActiveStatus(a.status) ? 0 : 1
      const activeB = isActiveStatus(b.status) ? 0 : 1
      if (activeA !== activeB) return activeA - activeB
      return b.createdAt - a.createdAt
    })
  }, [requests])

  const activeCount = useMemo(() => requests.filter((r) => isActiveStatus(r.status)).length, [requests])

  const renderItem = useCallback(
    ({ item }: { item: (typeof sorted)[number] }) => (
      // ⚠️ بلا `onPress` حتى الآن: شاشة تفاصيل الطلب هي عمل M2، و`typedRoutes`
      // يرفض الإشارة إلى مسار غير موجود. زرّ يقود إلى العدم أسوأ من قائمة
      // تُقرأ فقط — وهذا آخر ما بقي لتكون القائمة كاملة الوظيفة.
      <RequestCard request={item} />
    ),
    [],
  )

  // أول تحميل: هيكل بدل شاشة فارغة.
  if (loading) {
    return (
      <Screen>
        <LoadingState label="جارٍ تحميل طلباتك…" />
      </Screen>
    )
  }

  // خطأ بلا بيانات معروضة: شاشة خطأ كاملة.
  if (error && requests.length === 0) {
    return (
      <Screen>
        <ErrorState message={error} onRetry={refresh} retryable={retryable} />
      </Screen>
    )
  }

  return (
    <Screen padded={false} edges={{ top: true }}>
      <FlatList
        data={sorted}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[
          styles.list,
          { paddingHorizontal: t.space[4], paddingBottom: t.space[8] },
          sorted.length === 0 ? styles.listEmpty : null,
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
        ListHeaderComponent={
          <View style={{ paddingTop: t.space[4], paddingBottom: t.space[4] }}>
            <AppText variant="title" weight="heavy">
              {displayName ? `أهلًا، ${displayName}` : 'طلباتي'}
            </AppText>
            <AppText variant="caption" style={{ marginTop: t.space[1] }}>
              {activeCount > 0 ? `لديك ${activeCount} طلب جارٍ` : 'لا توجد طلبات جارية'}
            </AppText>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon={<Car color={t.colors.textMuted} size={44} strokeWidth={1.5} />}
            title="لا توجد طلبات بعد"
            body="طلبات الفحص التي تنشرها من الموقع ستظهر هنا مباشرةً مع حالة كل طلب."
          />
        }
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  list: { flexGrow: 1 },
  listEmpty: { justifyContent: 'center' },
})
