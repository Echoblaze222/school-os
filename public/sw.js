// sw.js — SchoolOS Service Worker
// Strategy: Network-first for navigation (HTML pages), cache-first for assets

const CACHE_NAME = 'schoolos-v3'
const OFFLINE_URL = '/offline'

// Assets to pre-cache on install
// Only include files that actually exist in /public
// A single 404 in cache.addAll() breaks the entire SW install
const PRECACHE_ASSETS = [
  OFFLINE_URL,
  '/icons/logo.png',
  '/icons/icon-144x144.png',
]

// ── Install: pre-cache offline page and core assets ──────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      // Promise.allSettled so one missing file never breaks the whole install
      Promise.allSettled(
        PRECACHE_ASSETS.map(url =>
          cache.add(url).catch(err =>
            console.warn(`[SW] Precache skipped: ${url}`, err)
          )
        )
      )
    )
  )
  self.skipWaiting()
})

// ── Activate: delete old caches ──────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  )
  self.clients.claim()
})

// ── Fetch: smart strategy per request type ───────────────────
self.addEventListener('fetch', event => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET, cross-origin, and API/Supabase requests entirely
  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/_next/') ||
    url.hostname.includes('supabase') ||
    url.hostname.includes('paystack') ||
    url.hostname.includes('fonts.googleapis') ||
    url.hostname.includes('fonts.gstatic')
  ) {
    return // Let browser handle normally
  }

  // For HTML navigation requests (page loads): NETWORK FIRST
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone))
          }
          return response
        })
        .catch(() =>
          caches.match(request).then(cached =>
            cached || caches.match(OFFLINE_URL).then(offlinePage =>
              offlinePage || new Response('You are offline', {
                status: 503,
                headers: { 'Content-Type': 'text/plain' }
              })
            )
          )
        )
    )
    return
  }

  // For static assets (images, icons): CACHE FIRST, network fallback
  if (
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/fonts/') ||
    url.pathname.match(/\.(png|jpg|jpeg|webp|svg|ico|woff2?)$/)
  ) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached
        return fetch(request).then(response => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone))
          }
          return response
        }).catch(() => new Response('', { status: 404 }))
      })
    )
    return
  }

  // Everything else: network only
})