/**
 * Turning stored inspector rows into pins.
 *
 * This lives outside the page for the reason every other extracted rule in this
 * project does: an admin page is `force-dynamic`, so it is never prerendered and
 * a wrong pin is invisible to `tsc`, `eslint` and `next build`. The only thing
 * that ever catches one is an operator noticing the map is lying.
 *
 * ── Why the input is declared here rather than imported ────────────────────
 * `lib/admin/extended-store.ts` is `server-only`. Importing its row type would
 * mean a type-only import that is erased at build time and a runtime failure the
 * day someone drops the `type` keyword. Declaring the shape structurally costs
 * nothing — the store's own `InspectorLocation` already satisfies it, so the page
 * passes its rows straight in with no adapter in between — and it keeps this
 * module importable from a test and from a client component alike.
 */

import { inspectorLocationStatusLabels } from '@/lib/admin/labels'
import { isPlottable, type MapMarker, type MapTone } from './types'

/** The fields a pin needs. Satisfied structurally by `InspectorLocation`. */
export type InspectorPlot = {
  id: string
  inspector_name?: string
  inspector_phone?: string
  latitude: number
  longitude: number
  status: 'available' | 'en_route' | 'inspecting' | 'offline'
  battery_level: number | null
  speed: number
  accuracy_m: number | null
  is_mock_location: boolean
  updated_at: string
}

/**
 * How long a fix stays believable.
 *
 * A map that stops receiving updates still looks live: the pins simply stop
 * moving. An operator watching it has no way to tell "nobody is on shift" from
 * "the reporter broke an hour ago", so every pin carries its own age and a pin
 * older than this stops pulsing. Five minutes is roughly two missed report
 * intervals plus slack for a weak connection.
 */
export const LOCATION_STALE_AFTER_MS = 5 * 60_000

/**
 * Status to colour.
 *
 * `offline` maps to neutral rather than to `bad`: an inspector who has gone home
 * is not an incident. A spoofed fix is the only thing here that earns `bad`, and
 * it overrides the status — a faked position is the finding, whatever the
 * inspector's own status field claims.
 */
const STATUS_TONE: Record<InspectorPlot['status'], MapTone> = {
  available: 'good',
  en_route: 'warn',
  inspecting: 'info',
  offline: 'neutral',
}

/** One character, drawn inside the pin. Never user text — see `types.ts`. */
const STATUS_GLYPH: Record<InspectorPlot['status'], string> = {
  available: '✓',
  en_route: '→',
  inspecting: '◉',
  offline: '·',
}

/**
 * Arabic counted-noun agreement.
 *
 * Arabic does not use one plural form: 1 takes the singular, 2 has its own dual,
 * 3–10 take the plural, and 11 and up fall back to the singular. "قبل 3 دقيقة"
 * reads as broken to a native speaker in a way "قبل 3 دقائق" does not, and this
 * is the only place in the product that renders a bare count next to a noun.
 */
function arabicCount(count: number, singular: string, dual: string, plural: string): string {
  if (count === 1) return singular
  if (count === 2) return dual
  if (count >= 3 && count <= 10) return `${count} ${plural}`
  return `${count} ${singular}`
}

/** Elapsed milliseconds as an Arabic phrase. Pure — `now` is passed in. */
export function formatArabicAgo(elapsedMs: number): string {
  const seconds = Math.max(0, Math.floor(elapsedMs / 1000))
  if (seconds < 60) return 'الآن'

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `قبل ${arabicCount(minutes, 'دقيقة', 'دقيقتين', 'دقائق')}`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `قبل ${arabicCount(hours, 'ساعة', 'ساعتين', 'ساعات')}`

  const days = Math.floor(hours / 24)
  return `قبل ${arabicCount(days, 'يوم', 'يومين', 'أيام')}`
}

/** Age in milliseconds, or `null` when the timestamp cannot be read. */
export function ageOf(updatedAt: string, now: number): number | null {
  const parsed = Date.parse(updatedAt)
  return Number.isFinite(parsed) ? Math.max(0, now - parsed) : null
}

/**
 * Build the pins for a set of locations.
 *
 * Unplottable rows are dropped rather than clamped: a row with a null or NaN
 * coordinate is a data fault, and placing it at (0, 0) — which is what a naive
 * `Number()` gives — would put an inspector in the Atlantic.
 */
export function inspectorMarkers(locations: ReadonlyArray<InspectorPlot>, now: number): MapMarker[] {
  const markers: MapMarker[] = []

  for (const location of locations) {
    if (!isPlottable(location)) continue

    const age = ageOf(location.updated_at, now)
    const stale = age === null || age > LOCATION_STALE_AFTER_MS
    const flagged = location.is_mock_location === true

    const details: Array<{ label: string; value: string }> = [
      { label: 'الحالة', value: inspectorLocationStatusLabels[location.status] ?? location.status },
    ]
    if (age !== null) details.push({ label: 'آخر تحديث', value: formatArabicAgo(age) })
    if (location.speed > 0) details.push({ label: 'السرعة', value: `${location.speed.toFixed(0)} كم/س` })
    if (location.accuracy_m !== null) {
      details.push({ label: 'الدقة', value: `±${Math.round(location.accuracy_m)} م` })
    }
    details.push({
      label: 'البطارية',
      value: location.battery_level !== null ? `${location.battery_level}%` : 'غير معروفة',
    })
    details.push({
      label: 'الإحداثيات',
      value: `${location.latitude.toFixed(4)}، ${location.longitude.toFixed(4)}`,
    })

    markers.push({
      id: location.id,
      latitude: location.latitude,
      longitude: location.longitude,
      tone: flagged ? 'bad' : STATUS_TONE[location.status] ?? 'neutral',
      glyph: flagged ? '!' : STATUS_GLYPH[location.status] ?? '·',
      title: location.inspector_name || 'فاحص',
      subtitle: location.inspector_phone || undefined,
      details,
      // Only a fresh, moving fix pulses. A stale pin that keeps pulsing is the
      // exact illusion this component exists to prevent.
      pulse: !stale && (location.status === 'inspecting' || location.status === 'en_route'),
      flagged,
    })
  }

  return markers
}
