'use client'

import { useCallback, useSyncExternalStore } from 'react'
import type { FieldFix, FieldLocationState, LocatedFix } from '@/lib/field/types'

/**
 * How long a fix stays "fresh". A GPS reading older than this is still usable
 * for the audit trail but must be labelled, because an inspector who ducked
 * into a basement car park is handed a cached fix and would otherwise believe
 * it is current.
 */
const FRESHNESS_MS = 30_000

/** Above this, the fix is worth a visible warning but not a refusal. */
const POOR_ACCURACY_M = 120

const IDLE: FieldLocationState = { fix: null, status: 'idle', error: null }

function toFix(position: GeolocationPosition): FieldFix {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
    capturedAt: new Date(position.timestamp || Date.now()).toISOString(),
  }
}

function locate(fix: FieldFix | null): LocatedFix | null {
  if (!fix) return null
  const ageMs = Date.now() - Date.parse(fix.capturedAt)
  return { ...fix, ageMs, stale: ageMs > FRESHNESS_MS }
}

/**
 * A single device-wide geolocation store.
 *
 * This is deliberately module-level rather than per-hook-instance. Three
 * components on the field dashboard want the fix (the ribbon, the claim feed,
 * the support form), and three independent `watchPosition` subscriptions would
 * mean three GPS locks held at once — the single fastest way to drain a phone
 * battery on a shift. One watch, many readers.
 *
 * It is an external store, so it is read with `useSyncExternalStore`: that keeps
 * the server snapshot deterministic (no window, no fix) without a hydration
 * mismatch, and it means starting the subscription is an effect whose only job
 * is to *subscribe* — not to copy values into React state.
 */
const locationStore = {
  listeners: new Set<() => void>(),
  snapshot: IDLE,
  watcherId: null as number | null,
  started: false,
  /** True between issuing a one-shot read and its callback firing. */
  pending: false,

  emit() {
    for (const listener of locationStore.listeners) listener()
  },

  set(next: Partial<FieldLocationState>) {
    locationStore.snapshot = { ...locationStore.snapshot, ...next }
    locationStore.emit()
  },

  /** Issue a one-shot read. Used on mount and by an explicit "refresh". */
  read() {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      locationStore.set({ fix: null, status: 'unsupported', error: 'المتصفح لا يدعم تحديد الموقع.' })
      return
    }
    locationStore.pending = true
    navigator.geolocation.getCurrentPosition(
      (position) => {
        locationStore.pending = false
        locationStore.set({ fix: locate(toFix(position)), status: 'ready', error: null })
      },
      (error) => {
        locationStore.pending = false
        const denied = error.code === error.PERMISSION_DENIED
        locationStore.set({
          status: denied ? 'denied' : 'error',
          error: denied
            ? 'تم رفض إذن الموقع. يمكنك متابعة العمل وسيُسجّل الإجراء بدون إحداثيات.'
            : 'تعذّر تحديد الموقع الآن. سيُسجّل الإجراء بدون إحداثيات.',
        })
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 15_000 },
    )
  },

  subscribe(listener: () => void) {
    locationStore.listeners.add(listener)

    // Start on the first subscriber, stop when the last one goes away — so a
    // user who navigates off the field surface is not left with a live GPS
    // watcher running in the background.
    if (!locationStore.started) {
      locationStore.started = true
      locationStore.read()
      if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
        locationStore.watcherId = navigator.geolocation.watchPosition(
          (position) => locationStore.set({ fix: locate(toFix(position)), status: 'ready', error: null }),
          () => {
            /* Transient failures during a watch are expected; keep the last good fix. */
          },
          { enableHighAccuracy: true, maximumAge: 10_000 },
        )
      }
    }

    return () => {
      locationStore.listeners.delete(listener)
      if (locationStore.listeners.size === 0) {
        locationStore.started = false
        if (
          locationStore.watcherId !== null &&
          typeof navigator !== 'undefined' &&
          'geolocation' in navigator
        ) {
          navigator.geolocation.clearWatch(locationStore.watcherId)
          locationStore.watcherId = null
        }
      }
    }
  },

  getSnapshot(): FieldLocationState {
    // A cached fix is re-aged on every read, so `stale` reflects "now" rather
    // than the instant the browser handed the position over.
    const aged = locationStore.snapshot.fix ? locate({ ...locationStore.snapshot.fix }) : null
    const status =
      locationStore.snapshot.status === 'idle' && locationStore.pending
        ? ('requesting' as const)
        : locationStore.snapshot.status
    if (aged === locationStore.snapshot.fix && status === locationStore.snapshot.status) {
      return locationStore.snapshot
    }
    locationStore.snapshot = { ...locationStore.snapshot, fix: aged, status }
    return locationStore.snapshot
  },
}

/** The server has no geolocation, so it renders the idle state. */
const SERVER_SNAPSHOT: FieldLocationState = IDLE

function subscribe(listener: () => void) {
  return locationStore.subscribe(listener)
}

function getSnapshot() {
  return locationStore.getSnapshot()
}

/**
 * One-shot + streaming geolocation for the field surface.
 *
 * Reads are deliberately best-effort: every action in the field workflow can be
 * recorded without a fix, because refusing to let an inspector log a cancelled
 * visit merely because the showroom has no signal would be worse than a gap in
 * the trail. Callers record `null` coordinates and the audit UI shows the gap.
 */
export function useFieldLocation() {
  const state = useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT)
  const refresh = useCallback(() => locationStore.read(), [])

  const poorAccuracy =
    state.fix?.accuracy !== null && state.fix?.accuracy !== undefined && state.fix.accuracy > POOR_ACCURACY_M

  return { ...state, poorAccuracy, refresh, accuracyWarning: poorAccuracy }
}

/** Reverse geocoding without a paid API: we only ever need the city. */
export async function reverseGeocodeCity(latitude: number, longitude: number): Promise<string | null> {
  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse')
    url.searchParams.set('format', 'jsonv2')
    url.searchParams.set('lat', String(latitude))
    url.searchParams.set('lon', String(longitude))
    url.searchParams.set('accept-language', 'ar')
    url.searchParams.set('zoom', '10')
    const response = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!response.ok) return null
    const body = (await response.json()) as { address?: Record<string, string> }
    return body.address?.city ?? body.address?.town ?? body.address?.state ?? null
  } catch {
    return null
  }
}
