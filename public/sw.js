// public/sw.js
// SchoolOS Service Worker — Web Push notifications + offline support
// =========================================================
// FIX: sw.js used '/icons/icon-192.png' but manifest.json defines
//      '/icons/icon-192x192.png'. Mismatched icon path caused Android
//      Chrome to show a blank/broken icon on push notifications.
//      Both icon and badge now use '/icons/icon-192x192.png'.
//
// OFFLINE SUPPORT ADDED:
//   A `/offline` page already existed in the app but was never actually
//   shown — this file defined a CACHE_NAME constant but had no `fetch`
//   listener at all, so nothing was ever cached and offline visitors just
//   saw the browser's default network-error page. Fixed below with:
//     - App shell pre-cached on install (/offline + icons + manifest)
//     - Navigations: network-first, falling back to a cached copy of the
//       page, then to /offline if nothing cached is available
//     - Hashed Next.js build assets (/_next/static/, /icons/): cache-first
//       — safe, since a given hashed URL's content never changes
//     - /api/* requests: NEVER cached or intercepted — fee balances,
//       attendance, and results must always be fetched live. Serving a
//       stale API response offline would be actively misleading, not helpful.
//     - Everything else: stale-while-revalidate

const CACHE_VERSION      = 'v3' // bumped: new logo/icon set replaced old cached PNGs at the same filenames
const APP_SHELL_CACHE    = `schoolos-shell-${CACHE_VERSION}`
const RUNTIME_CACHE      = `schoolos-runtime-${CACHE_VERSION}`

// Static fallback — always cached, regardless of build output.
const STATIC_PRECACHE_URLS = [
  '/offline',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
]

// Real hashed JS/CSS chunks for the critical first-load routes, generated
// from Next.js's own build manifest by scripts/generate-sw-precache.js
// (runs automatically after `next build` — see the "postbuild" script in
// package.json). This is what makes a first-ever, never-been-online visit
// still work if the connection drops mid-session, instead of only caching
// pages opportunistically as someone happens to visit them.
try {
  importScripts('/sw-precache-manifest.js')
} catch (err) {
  console.warn('SW: sw-precache-manifest.js not found (did the build run generate-sw-precache.js?) — continuing with static precache only.', err)
}

const PRECACHE_URLS = [...STATIC_PRECACHE_URLS, ...(self.__PRECACHE_URLS || [])]

// ── Install & Activate ────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) =>
      // Individual cache.add() calls, not cache.addAll() — addAll fails the
      // ENTIRE precache if even one URL 404s (e.g. a stale manifest entry
      // after a partial rebuild). This way one bad URL just logs a warning
      // instead of silently leaving the whole app shell uncached.
      Promise.allSettled(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch((err) => console.warn(`SW: failed to precache ${url}`, err))
        )
      )
    )
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // Drop caches from older versions (e.g. the old unused 'schoolos-v1')
      caches.keys().then((names) =>
        Promise.all(
          names
            .filter((name) => name !== APP_SHELL_CACHE && name !== RUNTIME_CACHE)
            .map((name) => caches.delete(name))
        )
      ),
      self.clients.claim(),
    ])
  )
})

// ── Fetch — offline support ───────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event

  // Only ever intercept GETs — never touch POST/PUT/DELETE (form submits,
  // payments, attendance marking, etc. must always hit the network directly
  // and fail loudly if there's no connection, not be silently swallowed).
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Never cache API responses — always live data.
  if (url.pathname.startsWith('/api/')) return

  // Full page navigations — network-first, cache fallback, /offline last resort.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy))
          return response
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match('/offline'))
        )
    )
    return
  }

  // Hashed, immutable Next.js build assets and icons — cache-first.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request).then((response) => {
          const copy = response.clone()
          caches.open(APP_SHELL_CACHE).then((cache) => cache.put(request, copy))
          return response
        })
      })
    )
    return
  }

  // Everything else (fonts, misc same-origin GETs) — stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy))
          return response
        })
        .catch(() => cached)
      return cached || network
    })
  )
})

// ── Push received ─────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload
  try {
    payload = event.data.json()
  } catch {
    payload = { title: 'SchoolOS', body: event.data.text() }
  }

  const { title, body, icon, badge, url, tag } = payload

  const options = {
    body:    body   || '',
    // FIX: was '/icons/icon-192.png' — file doesn't exist, correct name is icon-192x192.png
    icon:    icon   || '/icons/icon-192x192.png',
    badge:   badge  || '/icons/icon-192x192.png',
    // WHATSAPP FIX: tags are now unique per push (from webpush.ts), so this
    // fallback only matters for malformed/legacy payloads. renotify:true
    // means even if a tag IS reused, the OS still alerts (vibrate/sound)
    // instead of silently swapping the notification text — this is what
    // was causing pushes to "not always drop".
    tag:      tag || `schoolos-${Date.now()}`,
    renotify: true,
    data:     { url: url || '/' },
    vibrate:  [200, 100, 200],
    timestamp: Date.now(),
    requireInteraction: false,
  }

  event.waitUntil(
    self.registration.showNotification(title || 'SchoolOS', options)
  )
})

// ── Notification click ────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const targetUrl = event.notification.data?.url || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus()
          client.navigate(targetUrl)
          return
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl)
      }
    })
  )
})

// ── Push subscription change ──────────────────────────────
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    event.newSubscription
      ? fetch('/api/push/subscribe', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            subscription: event.newSubscription.toJSON(),
            oldEndpoint:  event.oldSubscription?.endpoint,
          }),
        })
      : Promise.resolve()
  )
})
