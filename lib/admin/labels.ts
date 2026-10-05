/**
 * Presentation vocabulary for the admin console. Kept in one place so the
 * overview, the audit viewer and the tables can never disagree about what an
 * event or a status is called.
 */

export const roleLabels: Record<string, string> = {
  customer: 'عميل',
  inspector: 'فاحص',
  admin: 'مدير',
  super_admin: 'مالك',
}

export const inspectorStatusLabels: Record<string, string> = {
  none: '—',
  pending: 'بانتظار الاعتماد',
  approved: 'معتمد',
  rejected: 'مرفوض',
  suspended: 'موقوف',
}

const auditLabels: Record<string, string> = {
  'admin.gate_passed': 'عبور بوابة الإدارة',
  'admin.gate_failed': 'محاولة رمز إدارة فاشلة',
  'admin.gate_throttled': 'قفل بوابة الإدارة مؤقتًا',
  'admin.gate_denied_not_admin': 'محاولة دخول لحساب غير مخوّل',
  'admin.user_role_changed': 'تغيير دور مستخدم',
  'admin.user_role_denied': 'محاولة تغيير دور مرفوضة',
  'admin.inspector_status_changed': 'تغيير حالة فاحص',
  'admin.inspection_cancelled': 'إلغاء طلب فحص',
  'admin.inspection_reviewed': 'مراجعة تقرير فحص',
  'admin.inspection_flagged': 'تعليم طلب للمراجعة',
  'admin.inspection_note': 'ملاحظة إدارية على طلب',
  'admin.user_viewed': 'اطلاع الإدارة على حساب',
  'admin.export': 'تصدير بيانات',
  'inspector.status_changed': 'تحديث حالة فاحص',
  'inspection.status_changed': 'تحديث حالة طلب',
  'access.blocked_unauthenticated': 'منع وصول غير موثّق',
  'inspector.device_bound': 'ربط جهاز فاحص',
  'inspector.device_revoked': 'إلغاء جهاز فاحص',
}

export function auditEventLabel(type: string) {
  return auditLabels[type] ?? type
}

export type Tone = 'good' | 'warn' | 'bad' | 'neutral'

/** Colour family derived from the event type, so unseen types still render sensibly. */
export function auditEventTone(type: string): Tone {
  if (type.endsWith('_failed') || type.endsWith('_denied') || type.startsWith('access.blocked')) return 'bad'
  if (type.endsWith('_throttled') || type.endsWith('_not_admin')) return 'warn'
  if (type.endsWith('_passed') || type.endsWith('_changed') || type.endsWith('_bound')) return 'good'
  return 'neutral'
}

/** Glassmorphic badge classes for the dark admin surface. */
export const toneBadgeClasses: Record<Tone, string> = {
  good: 'bg-emerald-400/10 text-emerald-300 ring-1 ring-inset ring-emerald-400/20',
  warn: 'bg-amber-400/10 text-amber-300 ring-1 ring-inset ring-amber-400/20',
  bad: 'bg-rose-400/10 text-rose-300 ring-1 ring-inset ring-rose-400/20',
  neutral: 'bg-white/5 text-neutral-400 ring-1 ring-inset ring-white/10',
}

export const roleBadgeClasses: Record<string, string> = {
  customer: 'bg-white/5 text-neutral-300 ring-1 ring-inset ring-white/10',
  inspector: 'bg-sky-400/10 text-sky-300 ring-1 ring-inset ring-sky-400/20',
  admin: 'bg-violet-400/10 text-violet-300 ring-1 ring-inset ring-violet-400/20',
  super_admin: 'bg-amber-400/10 text-amber-300 ring-1 ring-inset ring-amber-400/20',
}

export type ReviewDecision = 'approved' | 'rejected' | 'flagged'

export const reviewDecisionLabels: Record<ReviewDecision, string> = {
  approved: 'معتمد',
  rejected: 'مرفوض',
  flagged: 'معلَّم للمراجعة',
}

export const reviewDecisionTone: Record<ReviewDecision, Tone> = {
  approved: 'good',
  rejected: 'bad',
  flagged: 'warn',
}

/* ── Extended labels for 40-module admin features ── */

export const violationTypeLabels: Record<string, string> = {
  fake_gps: 'موقع مزيف',
  tardiness: 'تأخّر',
  unexcused_cancel: 'إلغاء بلا عذر',
  zone_breach: 'تجاوز حدود المنطقة',
  speed_anomaly: 'سرعة غير طبيعية',
  photo_tamper: 'تلاعب بالصور',
}

export const violationTypeTone: Record<string, Tone> = {
  fake_gps: 'bad',
  tardiness: 'warn',
  unexcused_cancel: 'warn',
  zone_breach: 'bad',
  speed_anomaly: 'warn',
  photo_tamper: 'bad',
}

export const severityLabels: Record<string, string> = {
  low: 'منخفض',
  medium: 'متوسط',
  high: 'عالٍ',
  critical: 'حرج',
}

export const severityTone: Record<string, Tone> = {
  low: 'neutral',
  medium: 'warn',
  high: 'bad',
  critical: 'bad',
}

export const disputeStatusLabels: Record<string, string> = {
  open: 'مفتوح',
  under_review: 'قيد المراجعة',
  approved: 'مقبول',
  rejected: 'مرفوض',
  resolved: 'محلول',
}

export const disputeStatusTone: Record<string, Tone> = {
  open: 'bad',
  under_review: 'warn',
  approved: 'good',
  rejected: 'bad',
  resolved: 'good',
}

export const auditQueueStatusLabels: Record<string, string> = {
  pending: 'بانتظار المراجعة',
  passed: 'مقبول',
  flagged_for_fix: 'يحتاج تعديل',
  rejected: 'مرفوض',
}

export const auditQueueStatusTone: Record<string, Tone> = {
  pending: 'warn',
  passed: 'good',
  flagged_for_fix: 'bad',
  rejected: 'bad',
}

export const ticketCategoryLabels: Record<string, string> = {
  technical: 'فني',
  showroom_dispute: 'نزاع معرض',
  location_mismatch: 'عدم تطابق موقع',
  payment: 'دفع',
  safety: 'سلامة',
  account: 'حساب',
  other: 'أخرى',
}

export const ticketStatusLabels: Record<string, string> = {
  open: 'مفتوح',
  in_review: 'قيد المراجعة',
  resolved: 'محلول',
  closed: 'مغلق',
}

export const ticketStatusTone: Record<string, Tone> = {
  open: 'bad',
  in_review: 'warn',
  resolved: 'good',
  closed: 'neutral',
}

export const priorityLabels: Record<string, string> = {
  low: 'منخفض',
  normal: 'عادي',
  high: 'عالٍ',
  urgent: 'عاجل',
}

export const priorityTone: Record<string, Tone> = {
  low: 'neutral',
  normal: 'neutral',
  high: 'warn',
  urgent: 'bad',
}

export const inspectorLocationStatusLabels: Record<string, string> = {
  available: 'متاح',
  en_route: 'في الطريق',
  inspecting: 'يفحص',
  offline: 'غير متصل',
}

export const inspectorLocationStatusTone: Record<string, Tone> = {
  available: 'good',
  en_route: 'warn',
  inspecting: 'neutral',
  offline: 'bad',
}

export const broadcastPriorityLabels: Record<string, string> = {
  low: 'منخفض',
  normal: 'عادي',
  high: 'عالٍ',
  emergency: 'طارئ',
}

export const broadcastPriorityTone: Record<string, Tone> = {
  low: 'neutral',
  normal: 'neutral',
  high: 'warn',
  emergency: 'bad',
}

export const vehicleTierLabels: Record<string, string> = {
  economy: 'اقتصادي',
  mid: 'متوسط',
  luxury: 'فاخر',
  commercial: 'تجاري',
}
