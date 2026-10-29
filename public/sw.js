// public/sw.js
// SchoolOS Service Worker - Web Push notifications + offline support
// =========================================================
// FIX: sw.js used '/icons/icon-192.png' but manifest.json defines
//      '/icons/icon-192x192.png'. Mismatched icon path caused Android
//      Chrome to show a blank/broken icon on push notifications.
//      Both icon and badge now use '/icons/icon-192x192.png'.
//
// OFFLINE SUPPORT ADDED:
//   A `/offline` page already existed in the app but was never actually
//   shown - this file defined a CACHE_NAME constant but had no `fetch`
//   listener at all, so nothing was ever cached and offline visitors just
//   saw the browser's default network-error page. Fixed below with:
//     - App shell pre-cached on install (/offline + icons + manifest)
//     - Navigations: network only; if the network fails, show /offline.
//       Navigation responses are NEVER stored: they are per-user HTML
//       (names, grades, fees) and the Cache API outlives logout, so on a
//       shared phone the next person could be served the previous user's
//       page while offline.
//     - Hashed Next.js build assets (/_next/static/, /icons/): cache-first
// - safe, since a given hashed URL's content never changes
//     - /api/* requests: NEVER cached or intercepted - fee balances,
//       attendance, and results must always be fetched live. Serving a
//       stale API response offline would be actively misleading, not helpful.
//     - Everything else same-origin that is a font or image:
//       stale-while-revalidate. Anything else (Next.js RSC/data fetches,
//       cross-origin requests such as signed Supabase file URLs) is left
//       completely alone and goes straight to the network.

const CACHE_VERSION      = 'v4' // bumped: v3 runtime cache held logged-in page HTML; the activate step below deletes every cache not named for this version, purging it from devices that already have it
const APP_SHELL_CACHE    = `schoolos-shell-${CACHE_VERSION}`
const RUNTIME_CACHE      = `schoolos-runtime-${CACHE_VERSION}`

// Static fallback - always cached, regardless of build output.
const STATIC_PRECACHE_URLS = [
  '/offline',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
]

// Real hashed JS/CSS chunks for the critical first-load routes, generated
// from Next.js's own build manifest by scripts/generate-sw-precache.js
// (runs automatically after `next build` - see the "postbuild" script in
// package.json). This is what makes a first-ever, never-been-online visit
// still work if the connection drops mid-session, instead of only caching
// pages opportunistically as someone happens to visit them.
try {
  importScripts('/sw-precache-manifest.js')
} catch (err) {
  console.warn('SW: sw-precache-manifest.js not found (did the build run generate-sw-precache.js?) - continuing with static precache only.', err)
}

const PRECACHE_URLS = [...STATIC_PRECACHE_URLS, ...(self.__PRECACHE_URLS || [])]

// ── Install & Activate ────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) =>
      // Individual cache.add() calls, not cache.addAll() - addAll fails the
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

// ── Fetch - offline support ───────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event

  // Only ever intercept GETs - never touch POST/PUT/DELETE (form submits,
  // payments, attendance marking, etc. must always hit the network directly
  // and fail loudly if there's no connection, not be silently swallowed).
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Never touch other origins (e.g. signed Supabase storage URLs, fonts CDN):
  // they can carry private, per-user content and are not ours to cache.
  if (url.origin !== self.location.origin) return

  // Never cache API responses - always live data.
  if (url.pathname.startsWith('/api/')) return

  // Full page navigations - network only, /offline as the last resort.
  // The response is deliberately NOT cached (see the header comment): these
  // are per-user pages and must not outlive the session that fetched them.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/offline'))
    )
    return
  }

  // Hashed, immutable Next.js build assets and icons - cache-first.
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

  // Only same-origin fonts and images are worth a stale-while-revalidate
  // copy. Everything else - RSC/data fetches for dashboard pages,
  // cross-origin requests (e.g. signed Supabase storage URLs) - is not
  // intercepted at all, so it can never be answered from a stale or
  // previous-user cache.
  if (request.destination !== 'font' && request.destination !== 'image') return

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        })
        .catch(() => cached)
      return cached || network
    })
  )
})

// ── Sign-out: drop anything cached at runtime ─────────────
// Posted by the app when a user logs out. After the change above the runtime
// cache only holds fonts/images, but clearing it on logout keeps that true
// even if caching rules are loosened later.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CLEAR_RUNTIME_CACHE') {
    event.waitUntil(caches.delete(RUNTIME_CACHE))
  }
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
    // FIX: was '/icons/icon-192.png' - file doesn't exist, correct name is icon-192x192.png
    icon:    icon   || '/icons/icon-192x192.png',
    badge:   badge  || '/icons/icon-192x192.png',
    // WHATSAPP FIX: tags are now unique per push (from webpush.ts), so this
    // fallback only matters for malformed/legacy payloads. renotify:true
    // means even if a tag IS reused, the OS still alerts (vibrate/sound)
    // instead of silently swapping the notification text - this is what
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
