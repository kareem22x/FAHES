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
