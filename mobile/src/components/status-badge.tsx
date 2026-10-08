import { StyleSheet, View } from 'react-native'

import { statusOf, type InspectionStatus } from '@/lib/status'
import { useTheme } from '@/theme'

import { AppText } from './ui/text'

/**
 * شارة حالة الطلب.
 *
 * ── لماذا تقرأ من `statusOf` لا من `props` ────────────────────────────────
 *
 * النصّ والنمط كلاهما من `lib/status.ts` — نفس المصدر الذي تستخدمه واجهة
 * الويب. البديل (تمرير النصّ واللون من كل شاشة) يعني أن شاشة القائمة وشاشة
 * التفاصيل قد تعرضان نصّين مختلفين للطلب ذاته، وهو خطأ يظهر بعد إضافة حالة
 * جديدة لا في أول اختبار.
 *
 * ── الألوان ───────────────────────────────────────────────────────────────
 *
 * من `tones` في الثيم، وهي تتبع الوضع الفاتح/الداكن تلقائيًّا. القيم الفاتحة
 * منقولة من `.app-status.is-*` في الويب؛ والداكنة مشتقّة هناك لأن الويب لا
 * يملك نظيرًا داكنًا (قيمها `hex` مباشر لا ينقلب).
 */

type StatusBadgeProps = {
  status: InspectionStatus | string
  /** حجم أصغر للقوائم المضغوطة. */
  compact?: boolean
}

export function StatusBadge({ status, compact = false }: StatusBadgeProps) {
  const t = useTheme()
  const meta = statusOf(status)
  const tone = t.tones[meta.tone]

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: tone.background,
          borderColor: tone.border,
          borderRadius: t.radius.pill,
          paddingVertical: compact ? 4 : 6,
          paddingHorizontal: compact ? 10 : 12,
        },
      ]}
    >
      <AppText
        variant="caption"
        weight="bold"
        // اللون من النمط لا من `tone` في AppText: الأنماط هنا ديناميكية
        // (أربعة ألوان تتبع الوضع) وليست المفردات الثابتة في `tone`.
        style={{ color: tone.text }}
      >
        {meta.label}
      </AppText>
    </View>
  )
}

/** شارة حالة الدفع — بُعد موازٍ لحالة الطلب لا جزء منها. */
export function PaymentBadge({ status, label }: { status: string | null | undefined; label: string }) {
  const t = useTheme()

  const tone =
    status === 'paid'
      ? t.tones.done
      : status === 'failed'
        ? t.tones.cancelled
        : status === 'initiated'
          ? t.tones.progress
          : t.tones.open

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: tone.background,
          borderColor: tone.border,
          borderRadius: t.radius.pill,
          paddingVertical: 4,
          paddingHorizontal: 10,
        },
      ]}
    >
      <AppText variant="caption" weight="bold" style={{ color: tone.text }}>
        {label}
      </AppText>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
  },
})
