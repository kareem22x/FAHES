import { normalizePhone } from '@/lib/phone'
import {
  getSupabaseAdmin,
  SupabaseInspectorApplicationsMigrationRequiredError,
  SupabaseMigrationRequiredError,
} from '@/lib/supabase/server'
import type { UserProfileRow } from '@/lib/supabase/database.types'
import type { AppUser, InspectorApplicationInput, InspectorApplicationRow, InspectorStatus } from '@/lib/types'

function adminPhones() {
  return (process.env.ADMIN_PHONES || '')
    .split(',')
    .map((item) => normalizePhone(item))
    .filter(Boolean)
}

function toAppUser(row: UserProfileRow): AppUser {
  return {
    id: row.id,
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

export function isAdminPhone(phone: string | null | undefined) {
  return Boolean(phone && adminPhones().includes(normalizePhone(phone)))
}

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
      p_is_admin: isAdminPhone(normalizedPhone),
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

export async function listInspectorApplications() {
  const { data, error } = await getSupabaseAdmin()
    .from('inspector_applications')
    .select('*')
    .order('submitted_at', { ascending: false })
    .limit(500)
  throwIfError(error)
  return (data ?? []) as InspectorApplicationRow[]
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
    throwIfError(applicationError)
    applicationCities = application?.cities
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
    .eq('role', 'inspector')
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
