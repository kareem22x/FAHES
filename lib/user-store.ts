import { normalizePhone } from '@/lib/phone'
import { logAuditEvent } from '@/lib/audit'
import {
  isAdminClerkId,
  isAdminPhone,
  isOwnerClerkId,
  isOwnerPhone,
  isPlatformAdmin,
  isPlatformOwner,
} from '@/lib/identity-predicates'
import {
  getSupabaseAdmin,
  isMissingRelationError,
  SupabaseInspectorApplicationsMigrationRequiredError,
  SupabaseMigrationRequiredError,
} from '@/lib/supabase/server'
import type { UserProfileRow } from '@/lib/supabase/database.types'
import type { AppUser, InspectorApplicationInput, InspectorApplicationRow, InspectorStatus } from '@/types/domain'

function toAppUser(row: UserProfileRow): AppUser {
  return {
    id: row.id,
    clerkUserId: row.clerk_user_id,
    phone: row.phone,
    name: row.name,
    role: row.role,
    inspectorStatus: row.inspector_status,
    inspectorProfile: row.inspector_profile_updated_at ? {
      isOnline: row.is_online,
      cities: row.inspector_cities,
      updatedAt: Date.parse(row.inspector_profile_updated_at),
    } : undefined,
    createdAt: Date.parse(row.created_at),
    lastLoginAt: Date.parse(row.last_login_at),
  }
}

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(`Supabase user operation failed: ${error.message}`)
}

/**
 * Identity predicates live in `lib/identity-predicates.ts` — pure, and therefore
 * importable from unit tests and Client Components, which this `server-only`
 * module is not. Re-exported here so callers keep importing from the store.
 */
export {
  isAdminClerkId,
  isAdminPhone,
  isApprovedInspector,
  isOwnerClerkId,
  isOwnerPhone,
  isPlatformAdmin,
  isPlatformOwner,
} from '@/lib/identity-predicates'

export async function getUserByPhone(phone: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('user_profiles')
    .select('*')
    .eq('phone', normalizePhone(phone))
    .maybeSingle()
  throwIfError(error)
  return data ? toAppUser(data) : null
}

export async function getUserById(id: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('user_profiles')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  throwIfError(error)
  return data ? toAppUser(data) : null
}

export async function getUserByClerkId(clerkUserId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('user_profiles')
    .select('*')
    .eq('clerk_user_id', clerkUserId)
    .maybeSingle()
  throwIfError(error)
  return data ? toAppUser(data) : null
}

export async function listUsers() {
  const { data, error } = await getSupabaseAdmin()
    .from('user_profiles')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500)
  throwIfError(error)
  return (data ?? []).map(toAppUser)
}

export async function upsertUserFromClerk(clerkUserId: string, phone: string | null, name: string): Promise<AppUser> {
  const normalizedPhone = phone ? normalizePhone(phone) : null
  if (normalizedPhone && !/^5\d{8}$/.test(normalizedPhone)) throw new Error('A verified Saudi mobile number is required')

  const { data, error } = await getSupabaseAdmin()
    .rpc('upsert_clerk_user', {
      p_clerk_user_id: clerkUserId,
      p_phone: normalizedPhone,
      p_name: name.trim().slice(0, 80),
      p_is_admin: isPlatformAdmin({ phone: normalizedPhone, clerkUserId }),
    })
    .single()
  if (!normalizedPhone && error?.message.includes('Invalid verified Saudi phone number')) {
    throw new SupabaseMigrationRequiredError()
  }
  throwIfError(error)
  if (!data) throw new Error('Supabase did not return the Clerk-linked user')
  return toAppUser(data)
}

export async function submitInspectorApplication(userId: string, application: InspectorApplicationInput) {
  const { data, error } = await getSupabaseAdmin()
    .rpc('submit_inspector_application', {
      p_user_id: userId,
      p_experience_years: application.experienceYears,
      p_cities: application.cities,
      p_specialties: application.specialties,
      p_qualification: application.qualification,
      p_availability: application.availability,
      p_has_equipment: application.hasEquipment,
      p_notes: application.notes,
    })
    .single()
  if (error?.code === 'PGRST202' && error.message.includes('submit_inspector_application')) {
    throw new SupabaseInspectorApplicationsMigrationRequiredError()
  }
  throwIfError(error)
  if (!data) return null
  return toAppUser(data)
}

/**
 * Inspector applications, newest first.
 *
 * The table only exists once `20260930180200_inspector_applications.sql` has
 * been applied. Until then this returns an empty list rather than throwing, so
 * the admin console renders normally and can tell the operator what is missing.
 */
export async function listInspectorApplications() {
  const { data, error } = await getSupabaseAdmin()
    .from('inspector_applications')
    .select('*')
    .order('submitted_at', { ascending: false })
    .limit(500)
  if (isMissingRelationError(error)) return [] as InspectorApplicationRow[]
  throwIfError(error)
  return (data ?? []) as InspectorApplicationRow[]
}

/** True when the inspector-applications migration has not been applied yet. */
export async function inspectorApplicationsTableExists(): Promise<boolean> {
  const { error } = await getSupabaseAdmin()
    .from('inspector_applications')
    .select('user_id', { count: 'exact', head: true })
  return !isMissingRelationError(error)
}

export async function setInspectorStatus(userId: string, status: InspectorStatus, actorId: string) {
  if (status === 'none') return null
  let applicationCities: string[] | undefined
  if (status === 'approved') {
    const { data: application, error: applicationError } = await getSupabaseAdmin()
      .from('inspector_applications')
      .select('cities')
      .eq('user_id', userId)
      .maybeSingle()
    // Approving must still work when the applications table is absent — the
    // cities are simply carried over from the profile instead.
    if (!isMissingRelationError(applicationError)) {
      throwIfError(applicationError)
      applicationCities = application?.cities
    }
  }

  const updates = {
    inspector_status: status,
    role: status === 'approved' ? 'inspector' as const : 'customer' as const,
    is_online: false,
    ...(applicationCities ? { inspector_cities: applicationCities } : {}),
  }
  const { data, error } = await getSupabaseAdmin()
    .from('user_profiles')
    .update(updates)
    .eq('id', userId)
    .neq('role', 'admin')
    .select('*')
    .maybeSingle()
  throwIfError(error)
  if (!data) return null

  const { error: auditError } = await getSupabaseAdmin().from('audit_events').insert({
    actor_id: actorId,
    event_type: 'inspector.status_changed',
    resource_type: 'user',
    resource_id: userId,
    metadata: { status },
  })
  throwIfError(auditError)
  return toAppUser(data)
}

export type AssignableRole = 'customer' | 'inspector' | 'admin'

export type RoleChangeOutcome =
  | { ok: true; user: AppUser }
  | {
      ok: false
      reason: 'invalid_role' | 'not_found' | 'self' | 'protected_target' | 'owner_only' | 'last_admin'
    }

async function countAdmins() {
  const { count, error } = await getSupabaseAdmin()
    .from('user_profiles')
    .select('*', { count: 'exact', head: true })
    .eq('role', 'admin')
  throwIfError(error)
  return count ?? 0
}

async function applicationCities(userId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('inspector_applications')
    .select('cities')
    .eq('user_id', userId)
    .maybeSingle()
  if (isMissingRelationError(error)) return undefined
  throwIfError(error)
  return data?.cities as string[] | undefined
}

/**
 * Changes an account's role from the admin console.
 *
 * The guardrails here are the difference between a useful tool and a foot-gun:
 *  - an admin cannot change their own role, so nobody can demote themselves out
 *    of the panel by accident;
 *  - owner accounts (from ADMIN_OWNER_*) are untouchable through the UI;
 *  - granting or revoking `admin` is restricted to owners;
 *  - the last remaining admin can never be demoted, so the platform cannot end
 *    up with nobody able to administer it.
 */
export async function setUserRole(input: {
  userId: string
  role: AssignableRole
  actor: { id: string; isOwner: boolean }
}): Promise<RoleChangeOutcome> {
  const { userId, role, actor } = input
  if (role !== 'customer' && role !== 'inspector' && role !== 'admin') {
    return { ok: false, reason: 'invalid_role' }
  }
  if (userId === actor.id) return { ok: false, reason: 'self' }

  const { data: target, error } = await getSupabaseAdmin()
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  throwIfError(error)
  if (!target) return { ok: false, reason: 'not_found' }

  if (isPlatformOwner({ phone: target.phone, clerkUserId: target.clerk_user_id })) {
    return { ok: false, reason: 'protected_target' }
  }

  const touchesAdmin = target.role === 'admin' || role === 'admin'
  if (touchesAdmin && !actor.isOwner) return { ok: false, reason: 'owner_only' }

  if (target.role === 'admin' && role !== 'admin') {
    if ((await countAdmins()) <= 1) return { ok: false, reason: 'last_admin' }
  }

  const updates: Partial<{
    role: AssignableRole
    is_online: boolean
    inspector_status: InspectorStatus
    inspector_cities: string[]
  }> = { role, is_online: false }
  if (role === 'inspector') {
    // Promoting to inspector without an approved status would hand them a
    // dashboard that cannot load, so approval is implied by the promotion.
    updates.inspector_status = 'approved'
    const cities = await applicationCities(userId)
    if (cities && cities.length > 0) updates.inspector_cities = cities
  } else if (role === 'customer') {
    updates.inspector_status = 'none'
  }

  const { data, error: updateError } = await getSupabaseAdmin()
    .from('user_profiles')
    .update(updates)
    .eq('id', userId)
    .select('*')
    .maybeSingle()
  throwIfError(updateError)
  if (!data) return { ok: false, reason: 'not_found' }

  await logAuditEvent({
    actorId: actor.id,
    eventType: 'admin.user_role_changed',
    resourceType: 'user',
    resourceId: userId,
    metadata: { from: target.role, to: role, actorIsOwner: actor.isOwner },
  })

  return { ok: true, user: toAppUser(data) }
}

/**
 * Saves an inspector's availability toggle and work cities.
 *
 * ── Why the guard is `inspector_status`, not `role` ─────────────────────────
 *
 * This used to filter on `role = 'inspector'` as well. That excluded the one
 * account that most needs it: a platform owner. An owner's row is always
 * `role = 'admin'` — `getSession()` resolves the role with
 * `isAdmin ? … : inspectorStatus === 'approved' ? 'inspector' : 'customer'`, so
 * the admin branch always wins and an owner can never be `'inspector'`.
 *
 * The visible effect was a dashboard that loaded and then refused to save with
 * «غير مصرح»: the route authenticated fine, the UPDATE matched zero rows, this
 * function returned `null`, and the route reported that as a 403.
 *
 * `inspector_status = 'approved'` is the correct and sufficient guard — it is
 * exactly the condition that lets a session use the inspector surface, and it is
 * the same field `isApprovedInspector()` reads for that reason. Keeping `role`
 * as well would re-introduce the exclusion for no gain: a row cannot hold an
 * inspector's profile data without being approved.
 */
export async function updateInspectorProfile(
  userId: string,
  profile: { isOnline: boolean; cities: string[] },
) {
  const { data, error } = await getSupabaseAdmin()
    .from('user_profiles')
    .update({
      is_online: profile.isOnline,
      inspector_cities: profile.cities,
      inspector_profile_updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .eq('inspector_status', 'approved')
    .select('*')
    .maybeSingle()
  throwIfError(error)
  return data ? toAppUser(data) : null
}

export async function platformStats() {
  const users = await listUsers()
  return {
    users: users.length,
    inspectors: users.filter((user) => user.role === 'inspector').length,
    pendingInspectors: users.filter((user) => user.inspectorStatus === 'pending').length,
    admins: users.filter((user) => user.role === 'admin').length,
  }
}
