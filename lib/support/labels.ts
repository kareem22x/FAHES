import type { Tone } from '@/lib/admin/labels'
import type { TicketCategory, TicketPriority, TicketStatus } from '@/lib/support/store'

/**
 * Arabic presentation labels for the support suite.
 *
 * Kept free of `server-only` so both the user-facing thread and the admin console
 * can import the same strings — a ticket must never read "قيد المعالجة" in one
 * place and something else in the other.
 */

export const ticketStatusLabels: Record<TicketStatus, string> = {
  open: 'مفتوحة',
  in_progress: 'قيد المعالجة',
  waiting_for_user: 'بانتظار ردّك',
  resolved: 'تم الحل',
  closed: 'مغلقة',
}

export const ticketStatusTone: Record<TicketStatus, Tone> = {
  open: 'warn',
  in_progress: 'neutral',
  waiting_for_user: 'warn',
  resolved: 'good',
  closed: 'neutral',
}

export const priorityLabels: Record<TicketPriority, string> = {
  critical: 'حرجة',
  high: 'عالية',
  medium: 'متوسطة',
  low: 'منخفضة',
}

export const priorityTone: Record<TicketPriority, Tone> = {
  critical: 'bad',
  high: 'bad',
  medium: 'warn',
  low: 'neutral',
}

export const categoryLabels: Record<TicketCategory, string> = {
  inspection_issue: 'مشكلة في الفحص',
  payment: 'الدفع',
  app_bug: 'خلل في التطبيق',
  account_lock: 'قفل الحساب (عاجل)',
  other: 'أخرى',
}

/** Ordered for the create dialog — most urgent first, matching the spec. */
export const categoryOrder: TicketCategory[] = ['inspection_issue', 'payment', 'app_bug', 'account_lock', 'other']
export const priorityOrder: TicketPriority[] = ['critical', 'high', 'medium', 'low']
export const statusOrder: TicketStatus[] = ['open', 'in_progress', 'waiting_for_user', 'resolved', 'closed']

/** The status timeline shown on the ticket detail page. */
export const statusTimeline: TicketStatus[] = ['open', 'in_progress', 'waiting_for_user', 'resolved', 'closed']

/**
 * Arabic labels for the account role of whoever opened the ticket.
 *
 * The admin sidebar used to print the raw column value, so a fully Arabic
 * console showed "customer" next to the agent's own name. Keyed by `string`
 * rather than a union on purpose: the ticket's own `requesterRole` enum and
 * `AppUser.role` use overlapping but different vocabularies, and the sidebar
 * reads whichever one the row happens to carry. Callers fall back to the raw
 * value so an unmapped role degrades to the old behaviour instead of blank.
 */
export const requesterRoleLabels: Record<string, string> = {
  customer: 'عميل',
  inspector: 'فاحص',
  admin: 'مشرف',
  admin_pending: 'مشرف (بانتظار التفعيل)',
  support: 'دعم فني',
}
