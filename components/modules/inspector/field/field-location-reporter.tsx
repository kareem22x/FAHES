'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useFieldLocation } from './use-field-location'
import { deriveFieldStatus, type FieldPresenceStatus } from '@/lib/field/presence'
import type { LocatedFix } from '@/lib/field/types'

/**
 * Reports the inspector's position to the console.
 *
 * Renders nothing. It exists as a component rather than a hook call inside the
 * dashboard because mounting it is the opt-in: a surface that wants to be on the
 * map renders one line, and every surface that does not is unaffected.
 *
 * ── Two rules this obeys, and why ──────────────────────────────────────────
 *
 * 1. **A stale fix is never reported.** The whole value of the console map is
 *    that a pin's age means something. Re-sending the last known position on
 *    every tick would stamp a fresh timestamp on an old coordinate, so an
 *    inspector who lost signal in a car park would keep appearing to move. When
 *    the fix goes stale this stops sending, and the pin ages out on its own.
 *
 * 2. **A missing table stops the timer, permanently.** `stored: false` means the
 *    migration has not been applied. Retrying every thirty seconds would be a
 *    request per inspector per half-minute that cannot possibly succeed, for as
 *    long as the tab stays open.
 */

/** How often a fix is sent. Also the resolution of the console's map. */
const REPORT_INTERVAL_MS = 30_000

type BatteryLike = {
  level: number
  addEventListener: (type: string, listener: () => void) => void
  removeEventListener: (type: string, listener: () => void) => void
}

export function FieldLocationReporter({
  orders,
  isOnline,
}: {
  orders: ReadonlyArray<{ claim: { status: string } | null }>
  isOnline: boolean
}) {
  const { fix } = useFieldLocation()
  const presence = useMemo(() => deriveFieldStatus(orders, isOnline), [orders, isOnline])

  /*
   * The timer reads these, so the effect that owns it can depend on nothing.
   * An effect keyed on `fix` would tear down and rebuild the interval every time
   * the GPS produced a reading — and since a moving inspector produces one every
   * few seconds, the interval would never reach thirty and nothing would ever be
   * sent. The refs are written in an effect rather than during render, which
   * keeps them correct under concurrent rendering.
   */
  const latest = useRef<{ fix: LocatedFix | null; presence: FieldPresenceStatus }>({
    fix: null,
    presence,
  })

  useEffect(() => {
    latest.current = { fix, presence }
  }, [fix, presence])

  useEffect(() => {
    let stopped = false
    let battery: number | null = null
    let detachBattery: (() => void) | null = null

    // `navigator.getBattery` is Chromium-only and absent from lib.dom, so it is
    // read through a cast. Where it is missing the field stays null and the
    // popup says so rather than showing a made-up number.
    const navigatorWithBattery = navigator as Navigator & {
      getBattery?: () => Promise<BatteryLike>
    }
    if (typeof navigatorWithBattery.getBattery === 'function') {
      navigatorWithBattery
        .getBattery()
        .then((manager) => {
          if (stopped) return
          const sync = () => {
            battery = Math.max(0, Math.min(100, Math.round(manager.level * 100)))
          }
          sync()
          manager.addEventListener('levelchange', sync)
          detachBattery = () => manager.removeEventListener('levelchange', sync)
        })
        .catch(() => {
          /* Battery is decoration; a refusal here changes nothing. */
        })
    }

    const send = (current: LocatedFix, status: FieldPresenceStatus, keepalive = false) => {
      void fetch('/api/inspector/field/location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive,
        body: JSON.stringify({
          latitude: current.latitude,
          longitude: current.longitude,
          accuracy: current.accuracy,
          status,
          batteryLevel: battery,
        }),
      })
        .then(async (response) => {
          if (!response.ok) return
          const body = (await response.json()) as { stored?: boolean }
          // The table does not exist. Nothing will change until the page is
          // reloaded, so stop asking.
          if (body.stored === false) stopped = true
        })
        .catch(() => {
          /* Offline is the normal state on this surface; the next tick retries. */
        })
    }

    const tick = () => {
      if (stopped) return
      const { fix: current, presence: status } = latest.current
      // Rule 1: no fix, or one too old to stand behind.
      if (!current || current.stale) return
      send(current, status)
    }

    tick()
    const timer = setInterval(tick, REPORT_INTERVAL_MS)

    /*
     * One last report as the surface is hidden, marked offline. Without it the
     * console keeps showing a live pin for an inspector who closed the tab, and
     * the only thing that would correct it is the staleness timeout.
     */
    const onHidden = () => {
      if (document.visibilityState !== 'hidden' || stopped) return
      const { fix: current } = latest.current
      if (!current || current.stale) return
      send(current, 'offline', true)
    }
    document.addEventListener('visibilitychange', onHidden)

    return () => {
      stopped = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onHidden)
      detachBattery?.()
    }
  }, [])

  return null
}
