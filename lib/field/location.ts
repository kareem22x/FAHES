import 'server-only'

import { getSupabaseAdmin, isMissingRelationError } from '@/lib/supabase/server'
import { assessFix, type IntegrityReason, type LocationFix } from './location-integrity'

/**
 * Persisting an inspector's position.
 *
 * ── Why the trust decision is made here ────────────────────────────────────
 * The client sends coordinates and nothing else that matters. Whether those
 * coordinates are believable is decided on this side, against the fix that is
 * already stored — see `location-integrity.ts` for what that check can and
 * cannot claim. A client that could set `is_mock_location` itself would be
 * marking its own homework.
 *
 * Every write goes through `getSupabaseAdmin()`: `upsert_inspector_location` is
 * granted to `service_role` only, and the table has no RLS-readable policy.
 */

export type LocationStatus = 'available' | 'en_route' | 'inspecting' | 'offline'

export type LocationReport = {
  inspectorId: string
  latitude: number
  longitude: number
  accuracy: number | null
  heading: number
  speed: number
  status: LocationStatus
  batteryLevel: number | null
}

export type ReportOutcome =
  | { status: 'ok'; mock: boolean; reason: IntegrityReason | null }
  | { status: 'unavailable' }

/**
 * Records a position and returns the integrity verdict that was applied.
 *
 * `unavailable` is returned rather than thrown when `inspector_locations` is
 * absent, because the reporter runs on a timer inside the field dashboard: a
 * missing migration must not break the screen an inspector works from all day.
 * The console says the table is missing; the field surface stays quiet.
 */
export async function reportInspectorLocation(report: LocationReport): Promise<ReportOutcome> {
  const supabase = getSupabaseAdmin()

  const { data: previousRow, error: readError } = await supabase
    .from('inspector_locations')
    .select('latitude, longitude, accuracy_m, recorded_at')
    .eq('inspector_id', report.inspectorId)
    .maybeSingle()

  if (isMissingRelationError(readError)) return { status: 'unavailable' }
  if (readError) throw new Error(`Supabase field location read failed: ${readError.message}`)

  const previous = toFix(previousRow as Record<string, unknown> | null)
  const current: LocationFix = {
    latitude: report.latitude,
    longitude: report.longitude,
    accuracy: report.accuracy,
    recordedAtMs: Date.now(),
  }
  const verdict = assessFix(current, previous)

  const { error: writeError } = await supabase.rpc('upsert_inspector_location', {
    p_inspector_id: report.inspectorId,
    p_latitude: report.latitude,
    p_longitude: report.longitude,
    p_heading: report.heading,
    p_speed: report.speed,
    p_status: report.status,
    p_battery_level: report.batteryLevel,
    p_is_mock_location: verdict.mock,
    p_accuracy_m: report.accuracy,
  })

  if (isMissingRelationError(writeError)) return { status: 'unavailable' }
  if (writeError) throw new Error(`Supabase field location write failed: ${writeError.message}`)

  return { status: 'ok', mock: verdict.mock, reason: verdict.reason }
}

/** `null` in, `null` out — a first report has no predecessor to compare with. */
function toFix(row: Record<string, unknown> | null): LocationFix | null {
  if (!row) return null

  const latitude = row.latitude
  const longitude = row.longitude
  const recordedAt = row.recorded_at
  if (typeof latitude !== 'number' || typeof longitude !== 'number' || typeof recordedAt !== 'string') {
    return null
  }

  const recordedAtMs = Date.parse(recordedAt)
  if (!Number.isFinite(recordedAtMs)) return null

  const accuracy = row.accuracy_m
  return {
    latitude,
    longitude,
    accuracy: typeof accuracy === 'number' ? accuracy : null,
    recordedAtMs,
  }
}
