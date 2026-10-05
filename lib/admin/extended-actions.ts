'use server'

import { requireAdminAction, requireSuperAdminAction, actionError } from '@/lib/admin/rbac'
import type { AdminTier } from '@/lib/admin/rbac'
import type { AppSession } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { logAuditEvent } from '@/lib/audit'
import { isMissingRelationError } from '@/lib/supabase/server'

export type ExtActionState = {
  ok: boolean
  message: string
  reason?: string
  migrationPending?: boolean
}

/**
 * `requireAdminAction` / `requireSuperAdminAction` throw on refusal, but every
 * console form renders `state.message`, so each action needs a value back
 * rather than a rejection. This wraps the throw into a discriminated result and
 * flattens the session down to the `userId` the audit trail wants:
 *
 *   const guard = await adminGuard(() => requireAdminAction('createShowroom'))
 *   if (!guard.ok) return guard.state
 *   … actorId: guard.userId …
 */
async function adminGuard(
  guard: () => Promise<{ session: AppSession; isOwner: boolean; tier: AdminTier }>,
): Promise<
  | { ok: true; userId: string; isOwner: boolean; tier: AdminTier }
  | { ok: false; state: ExtActionState }
> {
  try {
    const { session, isOwner, tier } = await guard()
    return { ok: true, userId: session.sub, isOwner, tier }
  } catch (error) {
    return { ok: false, state: actionError(error) ?? { ok: false, message: 'تعذر تنفيذ الإجراء' } }
  }
}

function missingTable(state: ExtActionState): ExtActionState {
  return { ...state, ok: false, reason: 'migration_pending', message: 'الترحيل لم يُطبّق بعد على قاعدة البيانات', migrationPending: true }
}

/* ════════════════════════════════════════════════════════════════════
 * Violation resolution (Module 9)
 * ════════════════════════════════════════════════════════════════════ */

export async function resolveViolationAction(
  _prev: ExtActionState,
  formData: FormData,
): Promise<ExtActionState> {
  const guard = await adminGuard(() => requireAdminAction('resolveViolation'))
  if (!guard.ok) return guard.state

  const violationId = String(formData.get('violationId') ?? '')
  const note = String(formData.get('note') ?? '').slice(0, 1000)

  if (!violationId) return { ok: false, reason: 'invalid', message: 'معرّف المخالفة مطلوب' }

  const { error } = await getSupabaseAdmin()
    .from('inspector_violations')
    .update({ resolved: true, resolution_note: note, resolved_at: new Date().toISOString() })
    .eq('id', violationId)

  if (isMissingRelationError(error)) return missingTable({ ok: false, reason: 'invalid', message: '' })
  if (error) return { ok: false, reason: 'unknown', message: error.message }

  await logAuditEvent({
    eventType: 'admin.violation_resolved',
    actorId: guard.userId,
    resourceType: 'violation',
    resourceId: violationId,
    metadata: { note },
  })

  return { ok: true, message: 'تم حلّ المخالفة' }
}

/* ════════════════════════════════════════════════════════════════════
 * Dispute resolution (Module 15)
 * ════════════════════════════════════════════════════════════════════ */

export async function resolveDisputeAction(
  _prev: ExtActionState,
  formData: FormData,
): Promise<ExtActionState> {
  const guard = await adminGuard(() => requireAdminAction('resolveDispute'))
  if (!guard.ok) return guard.state

  const disputeId = String(formData.get('disputeId') ?? '')
  const status = String(formData.get('status') ?? 'resolved')
  const refundAmount = Number(formData.get('refundAmount') ?? 0)
  const note = String(formData.get('note') ?? '').slice(0, 2000)

  if (!disputeId) return { ok: false, reason: 'invalid', message: 'معرّف النزاع مطلوب' }
  if (!['approved', 'rejected', 'resolved'].includes(status)) {
    return { ok: false, reason: 'invalid', message: 'حالة غير صحيحة' }
  }

  const { error } = await getSupabaseAdmin()
    .from('disputes')
    .update({
      status,
      refund_amount: refundAmount,
      resolution_note: note,
      resolved_at: new Date().toISOString(),
      resolved_by: guard.userId,
    })
    .eq('id', disputeId)

  if (isMissingRelationError(error)) return missingTable({ ok: false, reason: 'invalid', message: '' })
  if (error) return { ok: false, reason: 'unknown', message: error.message }

  await logAuditEvent({
    eventType: 'admin.dispute_resolved',
    actorId: guard.userId,
    resourceType: 'dispute',
    resourceId: disputeId,
    metadata: { status, refundAmount, note },
  })

  return { ok: true, message: 'تم حلّ النزاع' }
}

/* ════════════════════════════════════════════════════════════════════
 * Quality audit review (Module 8)
 * ════════════════════════════════════════════════════════════════════ */

export async function reviewAuditAction(
  _prev: ExtActionState,
  formData: FormData,
): Promise<ExtActionState> {
  const guard = await adminGuard(() => requireAdminAction('reviewAudit'))
  if (!guard.ok) return guard.state

  const auditId = String(formData.get('auditId') ?? '')
  const status = String(formData.get('status') ?? 'passed')
  const notes = String(formData.get('notes') ?? '').slice(0, 2000)

  if (!auditId) return { ok: false, reason: 'invalid', message: 'معرّف المراجعة مطلوب' }
  if (!['passed', 'flagged_for_fix', 'rejected'].includes(status)) {
    return { ok: false, reason: 'invalid', message: 'حالة غير صحيحة' }
  }

  const { error } = await getSupabaseAdmin()
    .from('inspection_audits')
    .update({
      status,
      audit_notes: notes,
      completed_at: new Date().toISOString(),
      auditor_id: guard.userId,
    })
    .eq('id', auditId)

  if (isMissingRelationError(error)) return missingTable({ ok: false, reason: 'invalid', message: '' })
  if (error) return { ok: false, reason: 'unknown', message: error.message }

  await logAuditEvent({
    eventType: 'admin.audit_reviewed',
    actorId: guard.userId,
    resourceType: 'audit',
    resourceId: auditId,
    metadata: { status, notes },
  })

  return { ok: true, message: 'تم تسجيل قرار المراجعة' }
}

/* ════════════════════════════════════════════════════════════════════
 * Support ticket resolution (existing table)
 * ════════════════════════════════════════════════════════════════════ */

export async function resolveSupportTicketAction(
  _prev: ExtActionState,
  formData: FormData,
): Promise<ExtActionState> {
  const guard = await adminGuard(() => requireAdminAction('resolveTicket'))
  if (!guard.ok) return guard.state

  const ticketId = String(formData.get('ticketId') ?? '')
  const status = String(formData.get('status') ?? 'resolved')
  const note = String(formData.get('note') ?? '').slice(0, 2000)

  if (!ticketId) return { ok: false, reason: 'invalid', message: 'معرّف التذكرة مطلوب' }
  // Narrowed instead of `.includes()`-validated so the literal union flows into
  // the typed update payload below.
  if (status !== 'in_review' && status !== 'resolved' && status !== 'closed') {
    return { ok: false, reason: 'invalid', message: 'حالة غير صحيحة' }
  }

  const update: {
    status: 'in_review' | 'resolved' | 'closed'
    resolution_note: string
    updated_at: string
    resolved_at?: string
  } = {
    status,
    resolution_note: note,
    updated_at: new Date().toISOString(),
  }
  if (status === 'resolved' || status === 'closed') {
    update.resolved_at = new Date().toISOString()
  }

  const { error } = await getSupabaseAdmin()
    .from('inspector_support_tickets')
    .update(update)
    .eq('id', ticketId)

  if (error) return { ok: false, reason: 'unknown', message: error.message }

  await logAuditEvent({
    eventType: 'admin.ticket_resolved',
    actorId: guard.userId,
    resourceType: 'ticket',
    resourceId: ticketId,
    metadata: { status, note },
  })

  return { ok: true, message: 'تم تحديث التذكرة' }
}

/* ════════════════════════════════════════════════════════════════════
 * System settings update (Module 37) — super admin only
 * ════════════════════════════════════════════════════════════════════ */

export async function updateSystemSettingAction(
  _prev: ExtActionState,
  formData: FormData,
): Promise<ExtActionState> {
  const guard = await adminGuard(() => requireSuperAdminAction('updateSetting'))
  if (!guard.ok) return guard.state

  const key = String(formData.get('key') ?? '')
  const value = String(formData.get('value') ?? '')

  if (!key || !value) return { ok: false, reason: 'invalid', message: 'المفتاح والقيمة مطلوبان' }

  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    parsed = value
  }

  const { error } = await getSupabaseAdmin()
    .from('system_settings')
    .update({
      value: parsed as never,
      updated_at: new Date().toISOString(),
      updated_by: guard.userId,
    })
    .eq('key', key)

  if (isMissingRelationError(error)) return missingTable({ ok: false, reason: 'invalid', message: '' })
  if (error) return { ok: false, reason: 'unknown', message: error.message }

  await logAuditEvent({
    eventType: 'admin.setting_updated',
    actorId: guard.userId,
    resourceType: 'setting',
    resourceId: key,
    metadata: { key },
  })

  return { ok: true, message: 'تم تحديث الإعداد' }
}

/* ════════════════════════════════════════════════════════════════════
 * Kill switch toggle (Module 37) — super admin only
 * ════════════════════════════════════════════════════════════════════ */

export async function toggleKillSwitchAction(
  _prev: ExtActionState,
  formData: FormData,
): Promise<ExtActionState> {
  const guard = await adminGuard(() => requireSuperAdminAction('toggleKillSwitch'))
  if (!guard.ok) return guard.state

  const globalDisabled = formData.get('globalDisabled') === 'true'

  const { error } = await getSupabaseAdmin()
    .from('system_settings')
    .update({
      value: { global_disabled: globalDisabled, disabled_cities: [] },
      updated_at: new Date().toISOString(),
      updated_by: guard.userId,
    })
    .eq('key', 'kill_switch')

  if (isMissingRelationError(error)) return missingTable({ ok: false, reason: 'invalid', message: '' })
  if (error) return { ok: false, reason: 'unknown', message: error.message }

  await logAuditEvent({
    eventType: 'admin.kill_switch_toggled',
    actorId: guard.userId,
    resourceType: 'setting',
    resourceId: 'kill_switch',
    metadata: { globalDisabled },
  })

  return { ok: true, message: globalDisabled ? 'تم تعطيل النظام' : 'تم تفعيل النظام' }
}

/* ════════════════════════════════════════════════════════════════════
 * Broadcast announcement (Module 27)
 * ════════════════════════════════════════════════════════════════════ */

export async function createBroadcastAction(
  _prev: ExtActionState,
  formData: FormData,
): Promise<ExtActionState> {
  const guard = await adminGuard(() => requireAdminAction('createBroadcast'))
  if (!guard.ok) return guard.state

  const title = String(formData.get('title') ?? '').slice(0, 200)
  const body = String(formData.get('body') ?? '').slice(0, 2000)
  const priority = String(formData.get('priority') ?? 'normal')
  const citiesRaw = String(formData.get('cities') ?? '')

  if (title.length < 3) return { ok: false, reason: 'invalid', message: 'العنوان قصير جدًا' }
  if (body.length < 1) return { ok: false, reason: 'invalid', message: 'النص مطلوب' }

  const target_cities = citiesRaw ? citiesRaw.split(',').map((c) => c.trim()).filter(Boolean) : []

  const { error } = await getSupabaseAdmin()
    .from('broadcast_announcements')
    .insert({
      title,
      body,
      target_cities,
      priority,
      is_active: true,
      created_by: guard.userId,
    })

  if (isMissingRelationError(error)) return missingTable({ ok: false, reason: 'invalid', message: '' })
  if (error) return { ok: false, reason: 'unknown', message: error.message }

  await logAuditEvent({
    eventType: 'admin.broadcast_created',
    actorId: guard.userId,
    resourceType: 'broadcast',
    metadata: { title, priority, cities: target_cities },
  })

  return { ok: true, message: 'تم إنشاء الإعلان' }
}

/* ════════════════════════════════════════════════════════════════════
 * Pricing rule creation (Module 13)
 * ════════════════════════════════════════════════════════════════════ */

export async function createPricingRuleAction(
  _prev: ExtActionState,
  formData: FormData,
): Promise<ExtActionState> {
  const guard = await adminGuard(() => requireSuperAdminAction('createPricingRule'))
  if (!guard.ok) return guard.state

  const city = String(formData.get('city') ?? '') || null
  const vehicleTier = String(formData.get('vehicleTier') ?? '') || null
  const surgeMultiplier = Number(formData.get('surgeMultiplier') ?? 1)
  const flatAdjustment = Number(formData.get('flatAdjustment') ?? 0)
  const priority = Number(formData.get('priority') ?? 0)

  if (surgeMultiplier < 0.5 || surgeMultiplier > 5) {
    return { ok: false, reason: 'invalid_price', message: 'مضاعف الذروة خارج النطاق (0.5 - 5.0)' }
  }

  const { error } = await getSupabaseAdmin()
    .from('pricing_rules')
    .insert({
      city,
      vehicle_tier: vehicleTier,
      surge_multiplier: surgeMultiplier,
      flat_adjustment: flatAdjustment,
      priority,
      is_active: true,
    })

  if (isMissingRelationError(error)) return missingTable({ ok: false, reason: 'invalid', message: '' })
  if (error) return { ok: false, reason: 'unknown', message: error.message }

  await logAuditEvent({
    eventType: 'admin.pricing_rule_created',
    actorId: guard.userId,
    resourceType: 'pricing_rule',
    metadata: { city, vehicleTier, surgeMultiplier, flatAdjustment },
  })

  return { ok: true, message: 'تم إنشاء قاعدة التسعير' }
}

/* ════════════════════════════════════════════════════════════════════
 * Showroom creation (Module 5)
 * ════════════════════════════════════════════════════════════════════ */

export async function createShowroomAction(
  _prev: ExtActionState,
  formData: FormData,
): Promise<ExtActionState> {
  const guard = await adminGuard(() => requireAdminAction('createShowroom'))
  if (!guard.ok) return guard.state

  const name = String(formData.get('name') ?? '').slice(0, 200)
  const city = String(formData.get('city') ?? '')
  const district = String(formData.get('district') ?? '')
  const address = String(formData.get('address') ?? '')
  const phone = String(formData.get('phone') ?? '') || null
  const contactPerson = String(formData.get('contactPerson') ?? '') || null
  const isPartner = formData.get('isPartner') === 'true'

  if (name.length < 2) return { ok: false, reason: 'invalid', message: 'اسم المعرض قصير جدًا' }
  if (!city) return { ok: false, reason: 'invalid', message: 'المدينة مطلوبة' }

  const { error } = await getSupabaseAdmin()
    .from('showrooms')
    .insert({
      name,
      city,
      district,
      address,
      phone,
      contact_person: contactPerson,
      is_partner: isPartner,
      is_active: true,
    })

  if (isMissingRelationError(error)) return missingTable({ ok: false, reason: 'invalid', message: '' })
  if (error) return { ok: false, reason: 'unknown', message: error.message }

  await logAuditEvent({
    eventType: 'admin.showroom_created',
    actorId: guard.userId,
    resourceType: 'showroom',
    metadata: { name, city, isPartner },
  })

  return { ok: true, message: 'تم إضافة المعرض' }
}
