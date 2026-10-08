/**
 * الإشعارات — مرآة لـ`AppNotification` في `lib/notifications/store.ts`.
 *
 * ── لماذا نسخة لا استيراد ─────────────────────────────────────────────────
 *
 * `lib/notifications/store.ts` يبدأ بـ`import 'server-only'` ويستعمل عميل
 * Supabase بمفتاح الخدمة — كود خادم لا يعمل في React Native، واستيراد النوع
 * منه يجرّ العميل كاملًا إلى الحزمة. (نفس سبب `lib/types.ts` و`lib/status.ts`.)
 *
 * ومصدر الحقيقة يبقى ملف الويب: نفس الجدول، نفس القيد، نفس المفردات. أي
 * انحراف هنا يعني إشعارًا يظهر بنوع مختلف في التطبيق عنه في الويب.
 *
 * ── المصدر الحقيقي في التطبيق ─────────────────────────────────────────────
 *
 * `GET /api/notifications` — مسار قائم يعيد `{ notifications, unread }` لجلسة
 * المستخدم. أي أن التبويب **حقيقي لا فارغ**: لا حاجة إلى بيانات مصطنعة.
 *
 * ⚠️ و`href` في الإشعار **مسار ويب** لا مسار داخل التطبيق (مثل
 * `/dashboard/requests/xxx`). لذلك فتحه يمرّ بـ`WebBrowser` — وهو الصدق نفسه
 * المتّبع في الشاشة الرئيسية: لا نُوهم بوجهة داخلية غير موجودة.
 */

export type NotificationKind = 'request' | 'schedule' | 'report' | 'payment' | 'system' | 'support'
export type NotificationSeverity = 'info' | 'success' | 'warning' | 'critical'

export type AppNotification = {
  id: string
  kind: NotificationKind
  severity: NotificationSeverity
  title: string
  body: string
  /** مسار على الويب، أو `null` لإشعار بلا وجهة. */
  href: string | null
  /** `null` = غير مقروء. */
  readAt: number | null
  createdAt: number
}

/** جسم استجابة `GET /api/notifications`. */
export type NotificationsResponse = {
  notifications: AppNotification[]
  unread: number
}

/**
 * مفردات النوع بالعربية.
 *
 * سقوط افتراضي بدل `undefined`: القاعدة قد تُرجع نوعًا أحدث من التطبيق (نسخة
 * قديمة على جهاز لم يُحدَّث)، وعرض `undefined` في واجهة أسوأ من كلمة عامة.
 */
const KIND_LABELS: Record<NotificationKind, string> = {
  request: 'طلب',
  schedule: 'موعد',
  report: 'تقرير',
  payment: 'دفع',
  system: 'النظام',
  support: 'الدعم',
}

export function notificationKindLabel(kind: string | null | undefined): string {
  return KIND_LABELS[kind as NotificationKind] ?? 'إشعار'
}

/**
 * الخطورة → نمط لون من `t.feedback`.
 *
 * ⚠️ `critical` يُسقط إلى `error` لا إلى لون جديد: لوحة التغذية الراجعة
 * أربعة أنماط مقيسة التباين (انظر `theme/colors.ts`)، وإضافة نمط خامس هنا
 * يعني لونًا لم يُقَس على السطح الداكن.
 */
export function notificationTone(
  severity: string | null | undefined,
): 'info' | 'success' | 'warning' | 'error' {
  if (severity === 'success') return 'success'
  if (severity === 'warning') return 'warning'
  if (severity === 'critical') return 'error'
  return 'info'
}
