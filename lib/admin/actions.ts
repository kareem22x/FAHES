'use server'

import { revalidatePath } from 'next/cache'
import {
  ADMIN_LIMITS,
  actionError,
  auditAdminAction,
  requireAdminAction,
  requireSuperAdminAction,
  type ActionState,
} from '@/lib/admin/rbac'
import { setInspectorStatus, setUserRole, type AssignableRole } from '@/lib/user-store'
import { cancelInspectionByAdmin } from '@/lib/inspection-store'
import type { InspectorStatus } from '@/types/domain'
import type { ReviewDecision } from '@/lib/admin/labels'

/**
 * Every admin mutation lives here as a server action.
 *
 * Server actions are used rather than hand-rolled API routes for two reasons:
 * Next.js validates the Origin of every action POST itself (CSRF is covered by
 * the framework), and mutations stop being reachable by any client that simply
 * knows the URL. Each action still runs the full guard: authorization, rate
 * limit, then an append-only audit entry.
 */

const ASSIGNABLE_ROLES: AssignableRole[] = ['customer', 'inspector', 'admin']
const INSPECTOR_STATUSES: InspectorStatus[] = ['approved', 'rejected', 'suspended', 'pending']
const DECISIONS: ReviewDecision[] = ['approved', 'rejected', 'flagged']

function refreshAdminViews(extra: string[] = []) {
  for (const path of [
    '/admin',
    '/admin/users',
    '/admin/inspections',
    '/admin/inspector-applications',
    '/admin/inspectors',
    '/admin/audit-logs',
    ...extra,
  ]) {
    revalidatePath(path)
  }
}

/* ------------------------------------------------------------------- roles */

export async function setUserRoleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const { session, isOwner } = await requireAdminAction('admin.user_role', ADMIN_LIMITS.sensitive)
    const userId = String(formData.get('userId') ?? '')
    const role = String(formData.get('role') ?? '') as AssignableRole
    if (!userId) return { ok: false, message: 'معرّف غير صالح' }
    if (!ASSIGNABLE_ROLES.includes(role)) return { ok: false, message: 'دور غير صالح' }

    const outcome = await setUserRole({ userId, role, actor: { id: session.sub, isOwner } })
    if (!outcome.ok) {
      // Refusals are security-relevant — a run of `owner_only` is a signal.
      await auditAdminAction(session, 'admin.user_role_denied', 'user', userId, {
        reason: outcome.reason,
        requestedRole: role,
      })
      const messages: Record<string, string> = {
        invalid_role: 'دور غير صالح',
        not_found: 'المستخدم غير موجود',
        self: 'لا يمكنك تغيير دور حسابك بنفسك',
        protected_target: 'هذا حساب مالك محمي',
        owner_only: 'تغيير صلاحيات المديرين متاح للمالك فقط',
        last_admin: 'لا يمكن إزالة آخر مدير في المنصة',
      }
      return { ok: false, message: messages[outcome.reason] ?? 'تعذر تغيير الدور' }
    }

    refreshAdminViews([`/admin/users/${userId}`])
    return { ok: true, message: `تم تحديث دور ${outcome.user.name}` }
  } catch (error) {
    return actionError(error)
  }
}

export async function bulkSetUserRoleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const { session, isOwner } = await requireAdminAction('admin.user_role_bulk', ADMIN_LIMITS.sensitive)
    const role = String(formData.get('role') ?? '') as AssignableRole
    if (!ASSIGNABLE_ROLES.includes(role)) return { ok: false, message: 'دور غير صالح' }

    const ids = formData.getAll('ids').map(String).filter(Boolean).slice(0, 100)
    if (ids.length === 0) return { ok: false, message: 'لم تحدد أي حساب' }

    let changed = 0
    const failures: string[] = []
    for (const userId of ids) {
      const outcome = await setUserRole({ userId, role, actor: { id: session.sub, isOwner } })
      if (outcome.ok) changed += 1
      else failures.push(outcome.reason)
    }

    await auditAdminAction(session, 'admin.user_role_bulk', 'user', null, {
      requestedRole: role,
      requested: ids.length,
      changed,
      failures: [...new Set(failures)],
    })

    refreshAdminViews()
    if (changed === 0) return { ok: false, message: 'لم يتم تغيير أي حساب (تحقق من القواعد)' }
    return {
      ok: true,
      message: `تم تحديث ${changed} من ${ids.length} حساب${failures.length ? ` — ${ids.length - changed} مرفوض` : ''}`,
    }
  } catch (error) {
    return actionError(error)
  }
}

/* --------------------------------------------------------------- inspectors */

export async function setInspectorStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const { session } = await requireAdminAction('admin.inspector_status', ADMIN_LIMITS.sensitive)
    const userId = String(formData.get('userId') ?? '')
    const status = String(formData.get('status') ?? '') as InspectorStatus
    if (!userId) return { ok: false, message: 'معرّف غير صالح' }
    if (!INSPECTOR_STATUSES.includes(status)) return { ok: false, message: 'حالة غير صالحة' }

    const user = await setInspectorStatus(userId, status, session.sub)
    if (!user) return { ok: false, message: 'المستخدم غير موجود أو محمي' }

    await auditAdminAction(session, 'admin.inspector_status_changed', 'user', userId, { status })
    refreshAdminViews()
    return { ok: true, message: `تم تحديث حالة ${user.name}` }
  } catch (error) {
    return actionError(error)
  }
}

/* -------------------------------------------------------------- inspections */

/**
 * Approve / reject / flag an inspection. Recorded as an append-only review
 * event so the full decision history survives — a mutable column would lose it.
 */
export async function reviewInspectionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const { session } = await requireAdminAction('admin.inspection_review', ADMIN_LIMITS.sensitive)
    const inspectionId = String(formData.get('inspectionId') ?? '')
    const decision = String(formData.get('decision') ?? '') as ReviewDecision
    if (!inspectionId) return { ok: false, message: 'معرّف غير صالح' }
    if (!DECISIONS.includes(decision)) return { ok: false, message: 'قرار غير صالح' }

    await auditAdminAction(
      session,
      decision === 'flagged' ? 'admin.inspection_flagged' : 'admin.inspection_reviewed',
      'inspection',
      inspectionId,
      { decision },
    )
    refreshAdminViews()
    const labels: Record<ReviewDecision, string> = {
      approved: 'تم اعتماد الطلب',
      rejected: 'تم رفض الطلب',
      flagged: 'تم تعليم الطلب للمراجعة',
    }
    return { ok: true, message: labels[decision] }
  } catch (error) {
    return actionError(error)
  }
}

export async function addInspectionNoteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const { session } = await requireAdminAction('admin.inspection_note', ADMIN_LIMITS.standard)
    const inspectionId = String(formData.get('inspectionId') ?? '')
    const note = String(formData.get('note') ?? '').trim().slice(0, 1000)
    if (!inspectionId) return { ok: false, message: 'معرّف غير صالح' }
    if (!note) return { ok: false, message: 'الملاحظة فارغة' }

    await auditAdminAction(session, 'admin.inspection_note', 'inspection', inspectionId, { note })
    refreshAdminViews()
    return { ok: true, message: 'تمت إضافة الملاحظة' }
  } catch (error) {
    return actionError(error)
  }
}

export async function cancelInspectionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const { session } = await requireAdminAction('admin.inspection_cancel', ADMIN_LIMITS.sensitive)
    const inspectionId = String(formData.get('inspectionId') ?? '')
    if (!inspectionId) return { ok: false, message: 'معرّف غير صالح' }

    const result = await cancelInspectionByAdmin(inspectionId)
    if (!result) return { ok: false, message: 'لا يمكن الإلغاء (غير موجود أو مكتمل/ملغي مسبقًا)' }

    await auditAdminAction(session, 'admin.inspection_cancelled', 'inspection', inspectionId, {
      previousStatus: result.previousStatus,
    })
    refreshAdminViews()
    return { ok: true, message: 'تم إلغاء الطلب ورفض عروضه المعلّقة' }
  } catch (error) {
    return actionError(error)
  }
}

/* -------------------------------------------------------------------- audit */

/** Records that an admin opened a user's file. Makes "view as" accountable. */
export async function recordUserViewAction(userId: string): Promise<void> {
  try {
    const { session } = await requireAdminAction('admin.user_view', ADMIN_LIMITS.standard)
    await auditAdminAction(session, 'admin.user_viewed', 'user', userId, { mode: 'read_only' })
  } catch {
    // Viewing must never fail because the trail could not be written.
  }
}
