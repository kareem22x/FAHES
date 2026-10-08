import { useRouter } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { Check, CreditCard, ExternalLink, MapPin } from 'lucide-react-native'
import { useCallback, useMemo, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { LeafletMap } from '@/components/map/leaflet-map'
import { AvatarButton } from '@/components/navigation/avatar-button'
import { StatusBadge } from '@/components/status-badge'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Button } from '@/components/ui/button'
import { SearchBar } from '@/components/ui/search-bar'
import { AppText } from '@/components/ui/text'
import { useCustomerRequests } from '@/hooks/use-requests'
import { useSession } from '@/lib/auth'
import { env } from '@/lib/env'
import { haptic } from '@/lib/haptics'
import {
  DEFAULT_INSPECTION_SERVICE,
  INSPECTION_SERVICES,
  toggleInspectionService,
} from '@/lib/inspection-services'
import { HOME_LATITUDE, HOME_LONGITUDE, HOME_ZOOM } from '@/lib/maps/bounds'
import { formatPrice, isActiveStatus, isPaid, statusOf } from '@/lib/status'
import { acceptedOffer, vehicleLabel } from '@/lib/types'
import { useTheme } from '@/theme'

/**
 * الشاشة الرئيسية — خريطة كاملة الشاشة + شريط عائم + درج سفلي.
 *
 * ── ما هو حقيقي وما ليس كذلك (اقرأ هذا قبل التعديل) ────────────────────────
 *
 * الشاشة **لا تُنشئ طلبًا**. إنشاء الطلب (المعالج بخطواته الأربع) والدفع
 * (Moyasar) يعيشان على الويب في `/requests/new` و`/dashboard/requests/{id}/pay`،
 * وشاشات العميل في التطبيق هي مهمّة M2 غير المنفَّذة.
 *
 * ⇒ فكل إجراء هنا **يقود إلى الصفحة الحقيقية** عبر `WebBrowser` بدل أن يزيّن
 * نموذجًا لا يُرسل شيئًا. زرّ يوهم بالإنشاء ثم لا يفعل شيئًا أسوأ من غيابه:
 * المستخدم يظنّ أن طلبه نُشر.
 *
 * وكل ما يُعرض من بيانات (الطلب الجاري، حالته، سعر العرض المقبول، حالة الدفع)
 * يأتي من `GET /api/customer/requests` — **لا رقم مكتوب هنا**.
 *
 * ── لماذا اختيار نوع الفحص هنا رغم أن الإنشاء على الويب ───────────────────
 *
 * لأن المنتج يعرض الأنواع فعلًا (قائمة الخادم المُلزِمة في
 * `lib/inspection-services.ts`)، والاختيار يجعل الشاشة قابلة للاستعمال بدل أن
 * تكون صورة. وحدّ «اختيار يُظهر ما سيُطلب» لا «اختيار يُنشئ طلبًا» هو الحدّ
 * بين ما هو حقيقي وما هو وهم.
 *
 * ── ⚠️ الترتيب في الشجرة ──────────────────────────────────────────────────
 *
 * الخريطة أولًا ثم الشريط العائم ثم الدرج. والدرج آخرًا لأن `absoluteFill`
 * الخاص به يعلو ما قبله، و`pointerEvents="box-none"` فيه تُبقي الشريط العلوي
 * قابلًا للضغط — وهو ما يجعل زرّ البروفايل يعمل فوق خريطة تملأ الشاشة.
 */

/** ارتفاع الشريط الظاهر من الدرج — يَسَع العنوان والسطر التوضيحي. */
const SHEET_PEEK_HEIGHT = 112

export default function HomeScreen() {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { isSignedIn } = useSession()
  const { requests } = useCustomerRequests(isSignedIn)

  const [selected, setSelected] = useState<readonly string[]>([DEFAULT_INSPECTION_SERVICE])

  const activeRequests = useMemo(() => requests.filter((r) => isActiveStatus(r.status)), [requests])

  /** الطلب الجاري الأحدث — هو ما يهمّ المستخدم عند فتح التطبيق. */
  const current = activeRequests[0] ?? null

  /**
   * الطلب الذي ينتظر الدفع: عُيّن له فاحص (فعرضه مقبول) ولم يُدفع بعد.
   *
   * الشرطان معًا لا واحد: طلب بلا عرض مقبول لا مبلغ له أصلًا، وطلب مدفوع لا
   * يحتاج رابط دفع. و`acceptedOffer` هي مصدر المبلغ — لا `paymentAmount`
   * (الذي يبقى `null` حتى يبدأ الدفع، فيُعرض «—» على كل طلب لم يُدفع بعد).
   */
  const payable = useMemo(
    () => requests.find((r) => r.acceptedOfferId && !isPaid(r.paymentStatus)) ?? null,
    [requests],
  )

  const payableOffer = payable ? acceptedOffer(payable) : null

  const openExternal = useCallback((path: string) => {
    haptic.tap()
    // `apiUrl` لا `localhost`: المتصفّح على الجهاز لا يرى خادم حاسوبك.
    void WebBrowser.openBrowserAsync(`${env.apiUrl}${path}`)
  }, [])

  const toggleService = useCallback((id: string) => {
    haptic.select()
    setSelected((current) => toggleInspectionService(current, id))
  }, [])

  const selectedSummary = useMemo(() => {
    const first = INSPECTION_SERVICES.find((service) => service.id === selected[0])
    return first?.summary ?? ''
  }, [selected])

  return (
    <View style={styles.host}>
      {/* الخريطة خلفية كاملة الشاشة. تُبنى مرّة واحدة ولا تُعاد مع كل رسم —
          انظر فخّ `source` في `leaflet-map.tsx`. */}
      <LeafletMap
        style={StyleSheet.absoluteFill}
        latitude={HOME_LATITUDE}
        longitude={HOME_LONGITUDE}
        zoom={HOME_ZOOM}
      />

      {/* الشريط العائم: البروفايل ثم البحث. البروفايل **أوّلًا** لأنه يُرسم
          على حافة البداية (اليمين في العربية) بلا أي `left`/`right`. */}
      <View style={[styles.topBar, { paddingTop: insets.top + t.space[3] }]} pointerEvents="box-none">
        <View style={[styles.topRow, { paddingHorizontal: t.space[4], gap: t.space[3] }]}>
          <AvatarButton />
          <View style={styles.searchWrap}>
            <SearchBar
              placeholder="ابحث عن مدينة أو حي"
              onPress={() => router.navigate('/(tabs)/orders')}
            />
          </View>
        </View>
      </View>

      {/*
        ⚠️ `header` صار **داخل** منطقة التمرير لا في شريط ثابت — لأن الدرج الآن
        `@gorhom/bottom-sheet`، ومحتواه كله قابل للتمرير. النتيجة: العنوان
        يتلاشى عند السحب للأعلى، وهو سلوك تطبيقات التوصيل لا عطب.

        و`paddingTop` على الجسم يفصل بداية المحتوى عن العنوان، وإلا ظهر صفّ
        أنواع الفحص **مقصوصًا في منتصفه** في وضع `peek` — يبدو عطلًا لا دعوةً
        إلى السحب. و`flex: 1` أُزيل عن الرأس والجسم معًا: كانا داخل درج بارتفاع
        ثابت، والآن هما داخل منطقة بارتفاع تلقائي و`flex: 1` هناك يُنهي ارتفاعهما
        إلى صفر بلا أي خطأ.
      */}
      <BottomSheet
        peekHeight={SHEET_PEEK_HEIGHT}
        header={
          <View>
            <View style={[styles.headerRow, { gap: t.space[2] }]}>
              <AppText variant="heading" weight="heavy" numberOfLines={1} style={styles.grow}>
                {current ? 'طلبك الجاري' : 'طلب فحص جديد'}
              </AppText>
              {current ? <StatusBadge status={current.status} compact /> : null}
            </View>
            <AppText variant="caption" tone="muted" numberOfLines={1}>
              {current ? statusOf(current.status).hint : 'اختر نوع الفحص ثم أكمل الطلب'}
            </AppText>
          </View>
        }
      >
        <View style={{ paddingTop: t.space[5] }}>
          {/* ── الطلب الجاري: بطاقة ملخّص حقيقية ──────────────────────── */}
          {current ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="تابع الطلب الجاري"
              onPress={() => {
                haptic.tap()
                router.navigate('/(tabs)/orders')
              }}
              android_ripple={{ color: t.colors.borderLight }}
              style={({ pressed }) => [
                styles.currentCard,
                {
                  borderRadius: t.radius['2xl'],
                  borderColor: t.colors.glassBorder,
                  backgroundColor: t.colors.glass,
                  padding: t.space[4],
                  opacity: pressed ? 0.9 : 1,
                },
              ]}
            >
              <View style={[styles.headerRow, { gap: t.space[2] }]}>
                <AppText variant="label" weight="bold" numberOfLines={1} style={styles.grow}>
                  {vehicleLabel(current.vehicle)}
                </AppText>
                <AppText variant="caption" tone="muted" numberOfLines={1}>
                  {current.city}
                </AppText>
              </View>
              <View style={[styles.metaRow, { marginTop: t.space[2], gap: t.space[1] }]}>
                <MapPin color={t.colors.textMuted} size={14} strokeWidth={2} />
                <AppText variant="caption" tone="muted" numberOfLines={1} style={styles.grow}>
                  {current.district || current.address || '—'}
                </AppText>
              </View>
            </Pressable>
          ) : null}

          {/* ── نوع الفحص: اختيار متعدّد من قائمة الخادم ──────────────── */}
          <AppText variant="label" weight="bold" style={{ marginTop: current ? t.space[5] : 0 }}>
            نوع الفحص
          </AppText>
          <AppText variant="caption" tone="muted" style={{ marginTop: t.space[1] }} numberOfLines={1}>
            {selectedSummary}
          </AppText>

          <View style={[styles.grid, { marginTop: t.space[3], gap: t.space[2] }]}>
            {INSPECTION_SERVICES.map((service) => {
              const active = selected.includes(service.id)
              return (
                <Pressable
                  key={service.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: active }}
                  accessibilityLabel={service.id}
                  onPress={() => toggleService(service.id)}
                  android_ripple={{ color: t.colors.borderLight }}
                  style={({ pressed }) => [
                    styles.chip,
                    {
                      borderRadius: t.radius.lg,
                      borderColor: active ? t.colors.accent : t.colors.border,
                      backgroundColor: active ? t.colors.accent : 'transparent',
                      paddingHorizontal: t.space[3],
                      opacity: pressed ? 0.88 : 1,
                    },
                  ]}
                >
                  {active ? <Check color={t.colors.onAccent} size={16} strokeWidth={3} /> : null}
                  <AppText
                    variant="caption"
                    weight="bold"
                    tone={active ? 'onAccent' : 'default'}
                    numberOfLines={1}
                    style={styles.grow}
                  >
                    {service.id}
                  </AppText>
                </Pressable>
              )
            })}
          </View>

          {/* ── الإجراءات — آخر ما في منطقة التمرير ───────────────────── */}
          <View style={[styles.actions, { gap: t.space[3], paddingTop: t.space[5] }]}>
            {payable ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="ادفع الآن"
                onPress={() => openExternal(`/dashboard/requests/${payable.id}/pay`)}
                android_ripple={{ color: t.colors.borderLight }}
                style={({ pressed }) => [
                  styles.payRow,
                  {
                    borderRadius: t.radius['2xl'],
                    borderColor: t.feedback.warning.border,
                    backgroundColor: t.feedback.warning.background,
                    padding: t.space[4],
                    opacity: pressed ? 0.9 : 1,
                  },
                ]}
              >
                <CreditCard color={t.feedback.warning.text} size={20} strokeWidth={2.2} />
                <View style={styles.grow}>
                  <AppText variant="caption" weight="semibold" style={{ color: t.feedback.warning.text }}>
                    الدفع مطلوب
                  </AppText>
                  <AppText variant="label" weight="bold" style={{ color: t.feedback.warning.text }}>
                    {payableOffer ? formatPrice(payableOffer.price) : 'أكمل الدفع'}
                  </AppText>
                </View>
                <ExternalLink color={t.feedback.warning.text} size={18} strokeWidth={2.2} />
              </Pressable>
            ) : null}

            {/* 🔴 الزرّ الأساسي: يفتح النموذج الحقيقي على الويب. `size="lg"` =
                56 نقطة، وهو الحدّ الذي طلبه التصميم للإجراء الرئيسي. */}
            <Button
              label="أكمل الطلب والدفع"
              size="lg"
              onPress={() => openExternal('/requests/new')}
              icon={<ExternalLink color={t.colors.onAccent} size={18} strokeWidth={2.4} />}
            />

            <Button
              label="عرض كل طلباتي"
              variant="secondary"
              // `lg` = 56 نقطة. التصميم يطلب حدًّا أدنى `h-14` لأزرار الإجراء،
              // والثانوي إجراء كامل لا رابط نصّي — فيأخذ نفس الحدّ.
              size="lg"
              onPress={() => {
                haptic.tap()
                router.navigate('/(tabs)/orders')
              }}
            />
          </View>
        </View>
      </BottomSheet>
    </View>
  )
}

const styles = StyleSheet.create({
  host: { flex: 1 },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0 },
  topRow: { flexDirection: 'row', alignItems: 'center' },
  searchWrap: { flex: 1, minWidth: 0 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  grow: { flex: 1, minWidth: 0 },
  currentCard: { borderWidth: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    // نصف العرض ناقص نصف الفجوة ⇒ صفّان من عمودين بلا `width: '50%'` الذي
    // يفيض عند إضافة `gap` (المجموع يصير 100% + فجوة).
    flexBasis: '48%',
    flexGrow: 1,
    height: 48,
  },
  actions: {},
  payRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1 },
})
