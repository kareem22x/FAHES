import { getSupabaseAdmin, isMissingRelationError } from '@/lib/supabase/server'
import type { Json } from '@/lib/supabase/database.types'

export type DeviceBindingResult =
  /** First device ever seen for this inspector — the lock is now armed. */
  | { status: 'bound'; deviceId: string }
  /** Same device as the bound one. */
  | { status: 'verified'; deviceId: string }
  /** A different device tried to use an already-locked inspector account. */
  | { status: 'device_mismatch'; boundLabel: string }
  /** The caller is not an approved inspector, so no lock is created. */
  | { status: 'not_inspector' }
  /** The fingerprint failed the database's format check. */
  | { status: 'invalid' }
  /**
   * The device-lock migration has not been applied, so the check cannot run.
   * Reported explicitly rather than treated as a pass: silently disabling a
   * security control is worse than refusing the request and saying why.
   */
  | { status: 'migration_required' }

const STATUSES = ['bound', 'verified', 'device_mismatch', 'not_inspector', 'invalid'] as const

function parseResult(data: Json | null): DeviceBindingResult {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Supabase returned an invalid device-binding result')
  }
  const record = data as { [key: string]: Json | undefined }
  const status = record.status
  if (typeof status !== 'string' || !STATUSES.includes(status as (typeof STATUSES)[number])) {
    throw new Error('Supabase returned an unknown device-binding status')
  }
  const kind = status as DeviceBindingResult['status']
  if (kind === 'device_mismatch') {
    return { status: kind, boundLabel: typeof record.boundLabel === 'string' ? record.boundLabel : 'جهاز آخر' }
  }
  if (kind === 'not_inspector' || kind === 'invalid') return { status: kind }
  if (kind === 'bound' || kind === 'verified') {
    return { status: kind, deviceId: typeof record.deviceId === 'string' ? record.deviceId : '' }
  }
  // `migration_required` is synthesised locally and can never arrive from the
  // database; anything else means the SQL function returned an unexpected shape.
  throw new Error('Supabase returned an unknown device-binding status')
}

/**
 * Binds (or re-checks) the inspector's device.
 *
 * The whole decision lives in the `bind_inspector_device` SQL function so it
 * runs inside one transaction with a row lock — two concurrent requests from
 * two phones cannot both win the "first device" race.
 */
export async function bindInspectorDevice(
  inspectorId: string,
  device: { hash: string; label: string; platform: string; userAgent: string },
): Promise<DeviceBindingResult> {
  const { data, error } = await getSupabaseAdmin().rpc('bind_inspector_device', {
    p_inspector_id: inspectorId,
    p_device_hash: device.hash,
    p_device_label: device.label.slice(0, 80),
    p_platform: device.platform.slice(0, 80),
    p_user_agent: device.userAgent.slice(0, 300),
  })
  if (error) {
    // PGRST202 = the function is not in the schema cache (migration not applied).
    if (isMissingRelationError(error) || error.code === 'PGRST202') {
      return { status: 'migration_required' }
    }
    throw new Error(`Supabase device-binding operation failed: ${error.message}`)
  }
  return parseResult(data)
}

/** Devices currently bound to an inspector, newest first. */
export async function listInspectorDevices(inspectorId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('inspector_devices')
    .select('*')
    .eq('inspector_id', inspectorId)
    .is('revoked_at', null)
    .order('last_seen_at', { ascending: false })
    .limit(10)
  // The device-lock migration may not be applied yet; an inspector with no
  // recorded devices is the correct reading in that case, not an error.
  if (isMissingRelationError(error)) return []
  if (error) throw new Error(`Supabase device lookup failed: ${error.message}`)
  return data ?? []
}
