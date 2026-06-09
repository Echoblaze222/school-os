// sw.js — SchoolOS Service Worker
// Strategy: Network-first for navigation (HTML pages), cache-first for assets

const CACHE_NAME = 'schoolos-v2'
const OFFLINE_URL = '/offline'

// Assets to pre-cache on install
const PRECACHE_ASSETS = [
  OFFLINE_URL,
  '/icons/logo.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
]

// ── Install: pre-cache offline page and core assets ──────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_ASSETS))
  )
  // Take over immediately — don't wait for old SW to be discarded
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
  // Claim all clients immediately
  self.clients.claim()
})

// ── Fetch: smart strategy per request type ───────────────────
self.addEventListener('fetch', event => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET, cross-origin, and API/Supabase requests entirely
  // Let these go straight to network — never intercept them
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
    return // Let browser handle normally — no SW intervention
  }

  // For HTML navigation requests (page loads): NETWORK FIRST
  // Only fall back to offline page if truly no connection
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Cache a fresh copy of successfully fetched pages
          if (response.ok) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone))
          }
          return response
        })
        .catch(() => {
          // Network failed — check cache first, then show offline page
          return caches.match(request).then(cached => {
            if (cached) return cached
            return caches.match(OFFLINE_URL)
          })
        })
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
        })
      })
    )
    return
  }

  // Everything else: network only (no SW caching)
})
