import type { InspectionStatus } from '@/lib/inspection-store'

export type StatusTone = 'open' | 'progress' | 'done' | 'cancelled'

type StatusMeta = {
  label: string
  tone: StatusTone
  /** Index inside `inspectionFlow`, or -1 when the request left the happy path. */
  step: number
  hint: string
}

/**
 * The order a healthy request moves through, used by both the customer timeline
 * and the inspector workspace so the two never disagree about a status.
 * `cancelled` is deliberately absent: it is an exit, not a step.
 */
export const inspectionFlow: { status: InspectionStatus; label: string; short: string }[] = [
  { status: 'open', label: 'تم نشر الطلب واستقبال العروض', short: 'نُشر الطلب' },
  { status: 'assigned', label: 'تم اختيار الفاحص', short: 'اختيار الفاحص' },
  { status: 'on_the_way', label: 'الفاحص في الطريق إلى السيارة', short: 'في الطريق' },
  { status: 'arrived', label: 'وصل الفاحص إلى موقع السيارة', short: 'وصل الموقع' },
  { status: 'inspecting', label: 'جارٍ فحص السيارة الآن', short: 'جارٍ الفحص' },
  { status: 'completed', label: 'اكتمل الفحص وأصبح التقرير جاهزًا', short: 'اكتمل' },
]

const statusMeta: Record<InspectionStatus, StatusMeta> = {
  open: { label: 'بانتظار العروض', tone: 'open', step: 0, hint: 'يصل الفاحصون القريبون من موقع السيارة بعروضهم.' },
  assigned: { label: 'تم اختيار الفاحص', tone: 'progress', step: 1, hint: 'تم إسناد الطلب لفاحص، وسيتواصل معك قبل الموعد.' },
  on_the_way: { label: 'الفاحص في الطريق', tone: 'progress', step: 2, hint: 'الفاحص متجه الآن إلى موقع السيارة.' },
  arrived: { label: 'وصل موقع السيارة', tone: 'progress', step: 3, hint: 'بدأ الفاحص توثيق حالة السيارة.' },
  inspecting: { label: 'جارٍ الفحص', tone: 'progress', step: 4, hint: 'الفحص قائم، والتقرير قريب.' },
  completed: { label: 'اكتمل الفحص', tone: 'done', step: 5, hint: 'تقرير الفحص جاهز للمشاهدة في حسابك.' },
  cancelled: { label: 'ملغي', tone: 'cancelled', step: -1, hint: 'تم إلغاء هذا الطلب.' },
}

export function statusOf(status: InspectionStatus): StatusMeta {
  return statusMeta[status] ?? statusMeta.open
}

export function isActiveStatus(status: InspectionStatus) {
  return status !== 'completed' && status !== 'cancelled'
}

/**
 * Latin digits on purpose: Arabic-Indic zero (٠) renders as a barely visible dot
 * in the product font, and mixed Latin/Arabic digit shapes looked inconsistent
 * across prices, counters and dates.
 */
const arabicLocale = 'ar-SA-u-nu-latn'

/** Safe replacement for `Intl` formatting that never throws on a bad timestamp. */
export function formatArabicDate(value: number | string, options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }) {
  const date = typeof value === 'number' ? new Date(value) : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(arabicLocale, { timeZone: 'Asia/Riyadh', ...options }).format(date)
}

export function formatArabicNumber(value: number) {
  return new Intl.NumberFormat(arabicLocale).format(value)
}
