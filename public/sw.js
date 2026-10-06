/* فاحص — service worker
 *
 * Scope: the whole origin. Registered by `components/pwa-register.tsx`.
 *
 * ── The one rule that shapes this whole file ──────────────────────────────
 * This app renders per-user data on the server: `/dashboard`, `/inspector`,
 * `/admin` and `/support` all stream HTML that belongs to the signed-in
 * account. A service worker that caches navigation responses would happily
 * hand one account's dashboard to the next person who opens the app on the
 * same device — a real data leak, not a theoretical one, because a shared
 * phone is the normal case for this product.
 *
 * So: **HTML navigations are never cached.** They go network-first and, when
 * the network is gone, fall back to a static offline page that contains no
 * user data. Only immutable build output and static assets are cached.
 *
 * The `/api/` prefix is excluded outright for the same reason — those
 * responses are authenticated and must never be replayed from disk.
 */

const VERSION = 'v1'
const STATIC_CACHE = `fahes-static-${VERSION}`

const OFFLINE_URL = '/offline'

/** Everything here is public, user-independent, and safe to serve from disk. */
const PRECACHE = [
  OFFLINE_URL,
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png',
]

/**
 * Caching is disabled on loopback.
 *
 * In development Turbopack serves chunks under the same `/_next/static/` prefix
 * as production, but without content hashes — caching them there pins stale
 * modules and makes hot reload appear broken. Production is the only place this
 * worker is meant to do real work, and PWABuilder packages the production build.
 */
const IS_LOOPBACK = ['localhost', '127.0.0.1', '[::1]', ''].includes(self.location.hostname)

/** Build output is content-hashed and immutable, so a hit never needs revalidation. */
const IMMUTABLE_BUILD_OUTPUT = /^\/_next\/static\//
const STATIC_ASSET = /\.(?:png|jpe?g|svg|webp|avif|ico|gif|woff2?|ttf|otf)$/i

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE)
      // `addAll` rejects the whole install if any single entry 404s, which would
      // leave the app with no worker at all. Add individually and tolerate
      // failures so one renamed asset cannot disable the PWA.
      await Promise.all(
        PRECACHE.map((url) => cache.add(url).catch(() => undefined)),
      )
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((key) => key !== STATIC_CACHE).map((key) => caches.delete(key)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  // Only GETs are cacheable, and a cross-origin request (Clerk's auth iframes
  // and XHRs, Supabase) must be left completely alone — intercepting those
  // would break sign-in in ways that are very hard to trace back to here.
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Authenticated, user-specific, must always be fresh.
  if (url.pathname.startsWith('/api/')) return

  if (IS_LOOPBACK) return

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request)
        } catch {
          const cache = await caches.open(STATIC_CACHE)
          const offline = await cache.match(OFFLINE_URL)
          return offline ?? Response.error()
        }
      })(),
    )
    return
  }

  if (IMMUTABLE_BUILD_OUTPUT.test(url.pathname) || STATIC_ASSET.test(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE)
        const hit = await cache.match(request)
        if (hit) {
          // Serve from cache immediately, refresh in the background. The refresh
          // is deliberately not awaited: a slow network must not delay a file
          // we already have.
          fetch(request)
            .then((response) => {
              if (response.ok) return cache.put(request, response.clone())
              return undefined
            })
            .catch(() => undefined)
          return hit
        }
        const response = await fetch(request)
        if (response.ok) cache.put(request, response.clone())
        return response
      })(),
    )
  }
})
