'use server'

import { revalidatePath } from 'next/cache'
import { requireAdminAction, actionError, auditAdminAction } from '@/lib/admin/rbac'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import {
  TICKET_STATUSES,
  addMessage,
  assignTicket,
  claimTicket,
  escalateTicket,
  listCannedResponses,
  markFirstResponse,
  recordEvent,
  updateTicketStatus,
  type EscalationTarget,
  type TicketStatus,
} from '@/lib/support/store'

/**
 * Admin support-console server actions.
 *
 * Every action runs through `requireAdminAction`, which resolves the session,
 * enforces the admin tier and applies the shared rate limit — the console has no
 * unguarded mutation. Each one also writes to `audit_events` (feature 28), so a
 * re-assignment or a message deletion leaves a trail outside the ticket itself.
 */

export type SupportActionState = { ok: boolean; message: string }

/** `actionError` is shared with the rest of the console and may return null. */
function toState(result: { ok: boolean; message: string } | null): SupportActionState {
  return result ?? { ok: false, message: 'تعذر تنفيذ الإجراء' }
}

function ticketIdFrom(formData: FormData): string {
  return String(formData.get('ticketId') ?? '')
}

export async function setTicketStatusAction(
  _prev: SupportActionState,
  formData: FormData,
): Promise<SupportActionState> {
  try {
    const { session } = await requireAdminAction('support:status')
    const ticketId = ticketIdFrom(formData)
    const status = String(formData.get('status') ?? '') as TicketStatus
    if (!ticketId || !TICKET_STATUSES.includes(status)) return { ok: false, message: 'بيانات غير صالحة' }

    const changed = await updateTicketStatus(ticketId, session.sub, status)
    if (!changed) return { ok: false, message: 'التذكرة غير موجودة' }

    await auditAdminAction(session, 'support.ticket_status_changed', 'support_ticket', ticketId, { status })
    revalidatePath('/admin/support')
    revalidatePath(`/admin/support/${ticketId}`)
    return { ok: true, message: 'تم تحديث الحالة' }
  } catch (error) {
    return toState(actionError(error))
  }
}

export async function claimTicketAction(
  _prev: SupportActionState,
  formData: FormData,
): Promise<SupportActionState> {
  try {
    const { session } = await requireAdminAction('support:claim')
    const ticketId = ticketIdFrom(formData)
    if (!ticketId) return { ok: false, message: 'بيانات غير صالحة' }

    const verdict = await claimTicket(ticketId, session.sub)
    if (verdict !== 'ok') {
      const messages: Record<string, string> = {
        already_assigned: 'التذكرة مسندة إلى موظف آخر',
        closed: 'التذكرة مغلقة',
        not_found: 'التذكرة غير موجودة',
        unavailable: 'نظام التذاكر غير مهيأ',
      }
      return { ok: false, message: messages[verdict] ?? 'تعذر إسناد التذكرة' }
    }

    await auditAdminAction(session, 'support.ticket_claimed', 'support_ticket', ticketId, {})
    revalidatePath('/admin/support')
    revalidatePath(`/admin/support/${ticketId}`)
    return { ok: true, message: 'تم إسناد التذكرة إليك' }
  } catch (error) {
    return toState(actionError(error))
  }
}

export async function assignTicketAction(
  _prev: SupportActionState,
  formData: FormData,
): Promise<SupportActionState> {
  try {
    const { session } = await requireAdminAction('support:assign')
    const ticketId = ticketIdFrom(formData)
    const adminId = String(formData.get('adminId') ?? '')
    if (!ticketId || !adminId) return { ok: false, message: 'بيانات غير صالحة' }

    const ok = await assignTicket(ticketId, session.sub, adminId)
    if (!ok) return { ok: false, message: 'التذكرة غير موجودة' }

    await auditAdminAction(session, 'support.ticket_assigned', 'support_ticket', ticketId, { adminId })
    revalidatePath('/admin/support')
    revalidatePath(`/admin/support/${ticketId}`)
    return { ok: true, message: 'تم إسناد التذكرة' }
  } catch (error) {
    return toState(actionError(error))
  }
}

export async function escalateTicketAction(
  _prev: SupportActionState,
  formData: FormData,
): Promise<SupportActionState> {
  try {
    const { session } = await requireAdminAction('support:escalate')
    const ticketId = ticketIdFrom(formData)
    const target = String(formData.get('target') ?? '') as EscalationTarget
    const note = String(formData.get('note') ?? '')
    if (!ticketId || (target !== 'admin' && target !== 'operations')) {
      return { ok: false, message: 'بيانات غير صالحة' }
    }

    const ok = await escalateTicket(ticketId, session.sub, target, note)
    if (!ok) return { ok: false, message: 'التذكرة غير موجودة' }

    await auditAdminAction(session, 'support.ticket_escalated', 'support_ticket', ticketId, { target })
    revalidatePath('/admin/support')
    revalidatePath(`/admin/support/${ticketId}`)
    return { ok: true, message: 'تم تصعيد التذكرة' }
  } catch (error) {
    return toState(actionError(error))
  }
}

/** Sends a free-text public reply from an agent, stamping the first response. */
export async function replyToTicketAction(
  _prev: SupportActionState,
  formData: FormData,
): Promise<SupportActionState> {
  try {
    const { session } = await requireAdminAction('support:reply')
    const ticketId = ticketIdFrom(formData)
    const body = String(formData.get('body') ?? '').trim()
    if (!ticketId || !body) return { ok: false, message: 'اكتب الرد أولًا' }

    const message = await addMessage({
      ticketId,
      authorId: session.sub,
      authorRole: 'admin',
      body,
      isInternal: false,
    })
    if (!message) return { ok: false, message: 'نظام التذاكر غير مهيأ' }

    await markFirstResponse(ticketId)
    await auditAdminAction(session, 'support.reply_sent', 'support_ticket', ticketId, {})
    revalidatePath(`/admin/support/${ticketId}`)
    return { ok: true, message: 'أُرسل الرد' }
  } catch (error) {
    return toState(actionError(error))
  }
}

export async function addInternalNoteAction(
  _prev: SupportActionState,
  formData: FormData,
): Promise<SupportActionState> {
  try {
    const { session } = await requireAdminAction('support:note')
    const ticketId = ticketIdFrom(formData)
    const body = String(formData.get('body') ?? '').trim()
    if (!ticketId || !body) return { ok: false, message: 'اكتب الملاحظة أولًا' }

    const message = await addMessage({
      ticketId,
      authorId: session.sub,
      authorRole: 'admin',
      body,
      isInternal: true,
    })
    if (!message) return { ok: false, message: 'نظام التذاكر غير مهيأ' }

    revalidatePath(`/admin/support/${ticketId}`)
    return { ok: true, message: 'أُضيفت الملاحظة الداخلية' }
  } catch (error) {
    return toState(actionError(error))
  }
}

export async function replyWithCannedAction(
  _prev: SupportActionState,
  formData: FormData,
): Promise<SupportActionState> {
  try {
    const { session } = await requireAdminAction('support:reply')
    const ticketId = ticketIdFrom(formData)
    const cannedId = String(formData.get('cannedId') ?? '')
    if (!ticketId || !cannedId) return { ok: false, message: 'بيانات غير صالحة' }

    const canned = await listCannedResponses()
    const selected = canned.find((item) => item.id === cannedId)
    if (!selected) return { ok: false, message: 'الرد الجاهز غير موجود' }

    const message = await addMessage({
      ticketId,
      authorId: session.sub,
      authorRole: 'admin',
      body: selected.body,
      isInternal: false,
    })
    if (!message) return { ok: false, message: 'نظام التذاكر غير مهيأ' }

    await markFirstResponse(ticketId)
    await auditAdminAction(session, 'support.canned_reply_sent', 'support_ticket', ticketId, {
      label: selected.label,
    })
    revalidatePath(`/admin/support/${ticketId}`)
    return { ok: true, message: `أُرسل: ${selected.label}` }
  } catch (error) {
    return toState(actionError(error))
  }
}

/** Bulk operation (feature 35): close, mark read or re-assign many at once. */
export async function bulkTicketAction(
  _prev: SupportActionState,
  formData: FormData,
): Promise<SupportActionState> {
  try {
    const { session } = await requireAdminAction('support:bulk')
    const ids = formData.getAll('ids').map(String).filter(Boolean)
    const operation = String(formData.get('operation') ?? '')
    if (ids.length === 0) return { ok: false, message: 'اختر تذكرة واحدة على الأقل' }
    if (ids.length > 50) return { ok: false, message: 'الحد الأقصى ٥٠ تذكرة في العملية' }

    let affected = 0
    for (const id of ids) {
      if (operation === 'close') {
        if (await updateTicketStatus(id, session.sub, 'closed')) affected += 1
      } else if (operation === 'resolve') {
        if (await updateTicketStatus(id, session.sub, 'resolved')) affected += 1
      } else if (operation === 'assign_me') {
        if ((await claimTicket(id, session.sub)) === 'ok') affected += 1
      }
    }

    await auditAdminAction(session, 'support.bulk_operation', 'support_ticket', null, {
      operation,
      requested: ids.length,
      affected,
    })
    revalidatePath('/admin/support')
    return { ok: true, message: `تم تحديث ${affected} تذكرة` }
  } catch (error) {
    return toState(actionError(error))
  }
}

/**
 * Soft-deletes a message. The row is kept with `deleted_at` set so the deletion
 * stays auditable (feature 28) rather than vanishing from the trail.
 */
export async function deleteMessageAction(
  _prev: SupportActionState,
  formData: FormData,
): Promise<SupportActionState> {
  try {
    const { session } = await requireAdminAction('support:delete_message')
    const ticketId = ticketIdFrom(formData)
    const messageId = String(formData.get('messageId') ?? '')
    if (!ticketId || !messageId) return { ok: false, message: 'بيانات غير صالحة' }

    const { error } = await getSupabaseAdmin()
      .from('support_ticket_messages')
      .update({ deleted_at: new Date().toISOString(), deleted_by: session.sub })
      .eq('id', messageId)
      .eq('ticket_id', ticketId)
    if (error) throw new Error(error.message)

    await recordEvent(ticketId, session.sub, 'message_deleted', null, messageId)
    await auditAdminAction(session, 'support.message_deleted', 'support_ticket', ticketId, { messageId })
    revalidatePath(`/admin/support/${ticketId}`)
    return { ok: true, message: 'حُذفت الرسالة' }
  } catch (error) {
    return toState(actionError(error))
  }
}
