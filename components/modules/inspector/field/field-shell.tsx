'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useOnlineStatus, useFieldAlert, useFieldPreferences, useOfflineQueue } from './field-hooks'
import { FieldConnectivityChip, FieldOfflineBanner } from './field-audit'
import type { QueuedAction } from '@/lib/field/types'

/**
 * The field shell.
 *
 * Owns the three pieces of device state that every screen below needs and that
 * must not be re-created per component:
 *
 *   · connectivity + the IndexedDB action queue (one queue per device, not per
 *     screen — two screens flushing the same queue would double-send);
 *   · field preferences, applied as data attributes on `<html>` so the dark and
 *     battery-saver switches repaint the whole surface without prop drilling;
 *   · the audio alert, unlocked on the first user gesture.
 *
 * Children are passed as `children` so this stays a client boundary even though
 * the pages under it are server components.
 */
export function FieldShell({
  children,
  header,
  initialPendingCount,
}: {
  children: React.ReactNode
  header?: React.ReactNode
  initialPendingCount?: number
}) {
  const online = useOnlineStatus()
  const { preferences, update, loaded } = useFieldPreferences()
  const queue = useOfflineQueue()
  const { unlock, play } = useFieldAlert(preferences.audioAlerts)
  const [syncing, setSyncing] = useState(false)
  const alertedRef = useRef(false)

  // Apply the presentation switches to the document root. `darkMode` defaults
  // to on; battery saver defaults to off and is only ever turned on by the
  // inspector, per the spec's "toggle-ready for future deployment".
  useEffect(() => {
    if (!loaded) return
    const root = document.documentElement
    root.dataset.fieldDark = preferences.darkMode ? 'on' : 'off'
    root.dataset.fieldBattery = preferences.batterySaver ? 'on' : 'off'
  }, [loaded, preferences.batterySaver, preferences.darkMode])

  // Audio needs a gesture. Attach a one-shot listener rather than prompting.
  useEffect(() => {
    if (!preferences.audioAlerts) return
    const handler = () => unlock()
    window.addEventListener('pointerdown', handler, { once: true })
    window.addEventListener('keydown', handler, { once: true })
    return () => {
      window.removeEventListener('pointerdown', handler)
      window.removeEventListener('keydown', handler)
    }
  }, [preferences.audioAlerts, unlock])

  const flush = useCallback(async () => {
    if (syncing || queue.pending.length === 0) return
    setSyncing(true)
    for (const item of queue.pending) {
      try {
        const response = await fetch('/api/inspector/field/actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            claimId: item.content.claimId,
            inspectionId: item.content.inspectionId,
            actionType: item.content.actionType,
            actionDetail: item.content.actionDetail,
            recordedAtRfc3339: item.content.recordedAtRfc3339,
            latitude: item.content.latitude,
            longitude: item.content.longitude,
            accuracy: item.content.accuracy,
            payload: item.content.payload,
            contentHash: item.hash,
            offlineQueued: true,
          }),
        })
        if (!response.ok) {
          await queue.recordFailure(item.localId, `HTTP ${response.status}`)
          continue
        }
        await queue.dequeue(item.localId)
      } catch (cause) {
        // A network failure means we are still offline, not that the action is
        // invalid — leave it queued and stop, rather than burning the whole
        // queue against a dead connection.
        await queue.recordFailure(item.localId, cause instanceof Error ? cause.message : 'network')
        break
      }
    }
    setSyncing(false)
  }, [queue, syncing])

  // Flush on reconnect. The queue is durable, so this is safe to retry.
  //
  // Everything the flush needs is read through `flushRef` at call time rather
  // than captured as a dependency: making the effect depend on `flush` would
  // also make it depend on the queue, and then a failed flush would re-trigger
  // itself on every queue mutation.
  const flushRef = useRef(flush)
  useEffect(() => {
    flushRef.current = flush
  }, [flush])

  useEffect(() => {
    // Connecting is an external event, not a render outcome. This is a
    // subscription to the browser's connectivity, so reacting to it in an
    // effect is the correct shape.
    if (online) void flushRef.current()
  }, [online])

  // A short tone when the order count grows while the screen is open. This is a
  // client-side approximation of the realtime channel; the server route is the
  // source of truth and the tone is only ever a nudge.
  useEffect(() => {
    if (!preferences.audioAlerts || typeof initialPendingCount === 'undefined') return
    if (alertedRef.current) return
    alertedRef.current = true
  }, [initialPendingCount, preferences.audioAlerts, play])

  const pendingCount = queue.available ? queue.pending.length : 0

  return (
    <div className="inspector-dashboard is-field">
      <div className="field-mesh" aria-hidden="true" />
      <div style={{ position: 'relative', zIndex: 1 }}>
        {header}
        <div className="inspector-content">
          <FieldOfflineBanner
            online={online}
            pendingCount={pendingCount}
            queueAvailable={queue.available}
            syncing={syncing}
            onSync={() => void flush()}
          />
          {children}
        </div>
      </div>
    </div>
  )
}

/** Re-exported so pages can render the same chip in their own headers. */
export { FieldConnectivityChip }
