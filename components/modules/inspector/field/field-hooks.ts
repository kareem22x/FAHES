'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { hashFieldAction } from '@/lib/field/chain'
import type { FieldActionContent, FieldPreferences, QueuedAction } from '@/lib/field/types'
import { defaultFieldPreferences } from '@/lib/field/types'

// ---------------------------------------------------------------------------
// Connectivity
// ---------------------------------------------------------------------------

/**
 * `navigator.onLine` is a weak signal — it reports the presence of a network
 * interface, not reachability, so a captive portal or a dead cell tower both
 * read as "online". Every flush therefore also depends on the request itself
 * failing, and the UI treats a failed flush as "still offline".
 */
export function useOnlineStatus() {
  const [online, setOnline] = useState(true)

  useEffect(() => {
    if (typeof navigator === 'undefined') return
    const update = () => setOnline(navigator.onLine)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  return online
}

// ---------------------------------------------------------------------------
// Haptics
// ---------------------------------------------------------------------------

/**
 * Short vibration patterns for confirmations and warnings. Silently degrades on
 * iOS Safari and desktop, where the API is absent — never a reason to branch in
 * a component.
 */
export function useHaptics(enabled = true) {
  return useCallback(
    (pattern: 'tap' | 'success' | 'warning' | 'error') => {
      if (!enabled) return
      if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return
      const map = {
        tap: [10],
        success: [14, 40, 22],
        warning: [26, 50, 26],
        error: [40, 60, 40, 60, 40],
      } as const
      try {
        navigator.vibrate(map[pattern] as unknown as number[])
      } catch {
        /* Vibration is a nicety; a failure must never break the action. */
      }
    },
    [enabled],
  )
}

// ---------------------------------------------------------------------------
// Audio alert
// ---------------------------------------------------------------------------

/**
 * A short, unobtrusive two-tone chime for new orders in the inspector's zone.
 *
 * Synthesised with WebAudio rather than shipped as an audio file: no asset
 * request over a metered field connection, and the whole thing is ~600 bytes of
 * code. The context is created lazily on the first user gesture because every
 * browser blocks audio until then.
 */
export function useFieldAlert(enabled = true) {
  const contextRef = useRef<AudioContext | null>(null)

  const unlock = useCallback(() => {
    if (!enabled || typeof window === 'undefined') return
    if (contextRef.current) return
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    try {
      contextRef.current = new Ctor()
    } catch {
      contextRef.current = null
    }
  }, [enabled])

  const play = useCallback(() => {
    if (!enabled) return
    const context = contextRef.current
    if (!context) return
    if (context.state === 'suspended') void context.resume()

    // Rising two-tone: calm, short, distinguishable from a phone notification.
    const tones = [
      { frequency: 880, start: 0, duration: 0.1 },
      { frequency: 1318.5, start: 0.11, duration: 0.16 },
    ]
    const now = context.currentTime
    for (const tone of tones) {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.value = tone.frequency
      // Ramped envelope: a bare start/stop clicks audibly on small phone speakers.
      gain.gain.setValueAtTime(0.0001, now + tone.start)
      gain.gain.exponentialRampToValueAtTime(0.14, now + tone.start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.start + tone.duration)
      oscillator.connect(gain).connect(context.destination)
      oscillator.start(now + tone.start)
      oscillator.stop(now + tone.start + tone.duration + 0.02)
    }
  }, [enabled])

  useEffect(() => {
    return () => {
      void contextRef.current?.close().catch(() => undefined)
      contextRef.current = null
    }
  }, [])

  return { unlock, play }
}

// ---------------------------------------------------------------------------
// Offline queue (IndexedDB)
// ---------------------------------------------------------------------------

const DB_NAME = 'fahes-field'
const DB_VERSION = 1
const ACTION_STORE = 'pending-actions'
const PREF_STORE = 'preferences'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(ACTION_STORE)) {
        db.createObjectStore(ACTION_STORE, { keyPath: 'localId' })
      }
      if (!db.objectStoreNames.contains(PREF_STORE)) {
        db.createObjectStore(PREF_STORE, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'))
  })
}

function runTransaction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(storeName, mode)
        const request = work(transaction.objectStore(storeName))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
        transaction.oncomplete = () => db.close()
      }),
  )
}

/**
 * Durable local queue for field actions.
 *
 * The queue is the offline story: an action is hashed and written to IndexedDB
 * *before* the network is attempted, so a lost signal never loses the record.
 * The hash is computed at queue time, not at flush time, which is what makes an
 * offline action provably recorded-when-it-happened rather than
 * recorded-when-it-synced — the `offlineQueued` flag carries that distinction
 * into the audit trail.
 */
export function useOfflineQueue() {
  const [pending, setPending] = useState<QueuedAction[]>([])
  const [available, setAvailable] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const rows = await runTransaction<QueuedAction[]>(ACTION_STORE, 'readonly', (store) => store.getAll())
      setPending(rows.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt)))
      setAvailable(true)
    } catch {
      // Private browsing modes and locked-down WebViews have no IndexedDB.
      // Degrading to "no offline support" is correct; hiding the failure is not,
      // so the UI reads `available` and says so.
      setAvailable(false)
      setPending([])
    }
  }, [])

  useEffect(() => {
    // The queue lives in IndexedDB, an external store, so the first read is a
    // subscription rather than a render — hence the effect. The lint rule that
    // flags this is about accidental render loops; this callback cannot loop
    // because it only ever runs once per `refresh` identity, and `refresh` is
    // dependency-free.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- external store sync
    void refresh()
  }, [refresh])

  const enqueue = useCallback(
    async (content: FieldActionContent) => {
      const hash = await hashFieldAction(content)
      const entry: QueuedAction = {
        localId: `${content.claimId}:${content.recordedAtRfc3339}:${content.actionType}`,
        content,
        hash,
        attempts: 0,
        lastError: null,
        queuedAt: new Date().toISOString(),
      }
      await runTransaction(ACTION_STORE, 'readwrite', (store) => store.put(entry))
      setPending((current) => [...current.filter((item) => item.localId !== entry.localId), entry])
      return entry
    },
    [],
  )

  const dequeue = useCallback(async (localId: string) => {
    await runTransaction(ACTION_STORE, 'readwrite', (store) => store.delete(localId))
    setPending((current) => current.filter((item) => item.localId !== localId))
  }, [])

  const recordFailure = useCallback(async (localId: string, message: string) => {
    const rows = await runTransaction<QueuedAction[]>(ACTION_STORE, 'readonly', (store) => store.getAll())
    const entry = rows.find((item) => item.localId === localId)
    if (!entry) return
    const next: QueuedAction = { ...entry, attempts: entry.attempts + 1, lastError: message }
    await runTransaction(ACTION_STORE, 'readwrite', (store) => store.put(next))
    setPending((current) => current.map((item) => (item.localId === localId ? next : item)))
  }, [])

  const clear = useCallback(async () => {
    await runTransaction(ACTION_STORE, 'readwrite', (store) => store.clear())
    setPending([])
  }, [])

  return { pending, available, enqueue, dequeue, recordFailure, clear, refresh }
}

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

const PREFERENCE_KEY = 'field-preferences'

/**
 * Field preferences are an external store, not component state.
 *
 * They live in `localStorage` because they describe the handset in the
 * inspector's pocket (screen, battery, noise), not the account — two inspectors
 * sharing a login on different phones should get different answers. Reading an
 * external store is what `useSyncExternalStore` exists for: it keeps the SSR
 * snapshot deterministic without a hydration mismatch, and it picks up a change
 * made in another tab.
 */
const preferenceStore = {
  listeners: new Set<() => void>(),
  cache: null as FieldPreferences | null,
  subscribe(listener: () => void) {
    preferenceStore.listeners.add(listener)
    window.addEventListener('storage', preferenceStore.handleStorage)
    return () => {
      preferenceStore.listeners.delete(listener)
      window.removeEventListener('storage', preferenceStore.handleStorage)
    }
  },
  handleStorage() {
    // The cached object must be dropped, or the next snapshot read returns the
    // same reference and React concludes nothing changed.
    preferenceStore.cache = null
    for (const listener of preferenceStore.listeners) listener()
  },
  getSnapshot(): FieldPreferences {
    if (preferenceStore.cache) return preferenceStore.cache
    let parsed: Partial<FieldPreferences> | null = null
    try {
      const raw = window.localStorage.getItem(PREFERENCE_KEY)
      if (raw) parsed = JSON.parse(raw) as Partial<FieldPreferences>
    } catch {
      /* A corrupt preference blob must not block the dashboard. */
    }
    preferenceStore.cache = { ...defaultFieldPreferences, ...(parsed ?? {}) }
    return preferenceStore.cache
  },
  set(patch: Partial<FieldPreferences>) {
    const next = { ...preferenceStore.getSnapshot(), ...patch }
    try {
      window.localStorage.setItem(PREFERENCE_KEY, JSON.stringify(next))
    } catch {
      /* Storage full or blocked; the in-memory value still applies. */
    }
    preferenceStore.cache = next
    for (const listener of preferenceStore.listeners) listener()
  },
}

/**
 * The snapshot the server renders. Preferences are device-local, so the server
 * cannot know them; it renders the documented defaults and the client corrects
 * on hydration.
 */
const serverPreferences = defaultFieldPreferences

export function useFieldPreferences() {
  const preferences = useSyncExternalStore(
    preferenceStore.subscribe,
    preferenceStore.getSnapshot,
    () => serverPreferences,
  )
  const update = useCallback((patch: Partial<FieldPreferences>) => {
    preferenceStore.set(patch)
  }, [])
  return { preferences, update, loaded: true }
}

// ---------------------------------------------------------------------------
// Client-side image compression
// ---------------------------------------------------------------------------

export type CompressedImage = {
  blob: Blob
  fileName: string
  width: number
  height: number
  originalBytes: number
  compressedBytes: number
  mimeType: string
}

/**
 * Downscale and re-encode a photo before upload.
 *
 * Field reality: a phone camera produces 4–8 MB JPEGs, and an inspector on a
 * weak cell connection may need to send four of them. Re-encoding to WebP at a
 * 1600px long edge typically lands under 300 KB with no loss of the detail that
 * matters (a plate, an odometer, a signboard).
 *
 * Deliberately falls back to the original file if anything fails — a failed
 * compression must not fail the upload.
 */
export async function compressImage(file: File, options?: { maxEdge?: number; quality?: number }): Promise<CompressedImage> {
  const maxEdge = options?.maxEdge ?? 1600
  const quality = options?.quality ?? 0.82
  const originalBytes = file.size

  const fallback = (): CompressedImage => ({
    blob: file,
    fileName: file.name,
    width: 0,
    height: 0,
    originalBytes,
    compressedBytes: originalBytes,
    mimeType: file.type,
  })

  try {
    // `createImageBitmap` handles HEIC on the platforms that support it and is
    // significantly cheaper than routing through an <img> + object URL.
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return fallback()
    context.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', quality),
    )
    if (!blob || blob.size === 0) return fallback()

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'field-photo'
    return {
      blob,
      fileName: `${baseName}.webp`,
      width,
      height,
      originalBytes,
      compressedBytes: blob.size,
      mimeType: 'image/webp',
    }
  } catch {
    return fallback()
  }
}

/** Turn a Blob into a lowercase hex SHA-256, for the media content hash. */
export async function hashBlob(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return `sha256:${Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')}`
}

/** Human-readable byte count for the upload UI. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} بايت`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} ك.ب`
  return `${(bytes / (1024 * 1024)).toFixed(1)} م.ب`
}
