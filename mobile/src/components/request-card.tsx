import { CalendarClock, MapPin } from 'lucide-react-native'
import { StyleSheet, View } from 'react-native'

import { Card } from '@/components/ui/card'
import { AppText } from '@/components/ui/text'
import { StatusBadge } from '@/components/status-badge'
import { acceptedOffer, vehicleLabel, type CustomerRequest } from '@/lib/types'
import { formatArabicDate, formatPrice, paymentStatusLabel } from '@/lib/status'
import { useTheme } from '@/theme'

/**
 * بطاقة طلب في القائمة.
 *
 * ── ما يظهر وما لا يظهر ───────────────────────────────────────────────────
 *
 * الترتيب مقصود: **السيارة ثم الحالة** أولًا (وهما ما يبحث عنه المستخدم)، ثم
 * السعر والموعد. تفاصيل مثل رقم الهيكل والملاحظات لا تظهر في القائمة — مكانها
 * شاشة التفاصيل، وإقحامها هنا يحوّل القائمة إلى جدار نصّ.
 *
 * ── السعر ─────────────────────────────────────────────────────────────────
 *
 * يُعرض سعر **العرض المقبول** لا `payment_amount`: الأول هو ما اتّفق عليه
 * العميل، والثاني يُملأ بعد الدفع فقط (ويكون `null` قبله). عرض الثاني كان
 * سيُظهر «—» على كل طلب غير مدفوع.
 */

export function RequestCard({ request, onPress }: { request: CustomerRequest; onPress?: () => void }) {
  const t = useTheme()

  const offer = acceptedOffer(request)
  const isPaid = request.paymentStatus === 'paid'

  return (
    <Card onPress={onPress} style={{ marginBottom: t.space[3] }}>
      <View style={{ padding: t.space[4] }}>
        {/* الصفّ الأول: السيارة + شارة الحالة. */}
        <View style={styles.rowBetween}>
          <AppText variant="body" weight="bold" style={styles.grow} numberOfLines={1}>
            {vehicleLabel(request.vehicle)}
          </AppText>
          <StatusBadge status={request.status} compact />
        </View>

        {/* الموقع والموعد. */}
        <View style={[styles.row, { marginTop: t.space[3] }]}>
          <MapPin color={t.colors.textMuted} size={14} strokeWidth={2} />
          <AppText variant="caption" numberOfLines={1} style={styles.grow}>
            {request.city}
            {request.district ? ` · ${request.district}` : ''}
          </AppText>
        </View>

        <View style={[styles.row, { marginTop: t.space[2] }]}>
          <CalendarClock color={t.colors.textMuted} size={14} strokeWidth={2} />
          <AppText variant="caption" numberOfLines={1} style={styles.grow}>
            {formatArabicDate(request.scheduledAt)}
          </AppText>
        </View>

        {/* الفاصل ثم السعر والدفع. */}
        {offer || isPaid ? (
          <View
            style={[
              styles.rowBetween,
              {
                marginTop: t.space[4],
                paddingTop: t.space[3],
                borderTopWidth: 1,
                borderTopColor: t.colors.borderLight,
              },
            ]}
          >
            <View>
              <AppText variant="caption">{offer ? 'سعر الفحص' : 'المدفوع'}</AppText>
              <AppText variant="body" weight="bold" style={{ marginTop: 2 }}>
                {formatPrice(offer?.price ?? request.paymentAmount)}
              </AppText>
            </View>

            <View style={{ alignItems: 'flex-end' }}>
              <AppText variant="caption">الدفع</AppText>
              <AppText
                variant="label"
                weight="semibold"
                // «مدفوع» أخضر و«فشل» أحمر، والباقي محايد — نفس منطق
                // `PaymentBadge` لكن كنصّ لا شارة، لأن البطاقة تحمل شارة
                // حالة واحدة بالفعل وإضافة ثانية تُشوّش الأولوية.
                style={{
                  marginTop: 2,
                  color: isPaid
                    ? t.tones.done.text
                    : request.paymentStatus === 'failed'
                      ? t.tones.cancelled.text
                      : t.colors.textMuted,
                }}
              >
                {paymentStatusLabel(request.paymentStatus)}
              </AppText>
            </View>
          </View>
        ) : null}
      </View>
    </Card>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  grow: { flex: 1, minWidth: 0 },
})
