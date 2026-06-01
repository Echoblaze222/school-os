// public/sw.js
// Service Worker for SchoolOS PWA
// This runs in the background and caches pages so the app
// loads fast even on slow Nigerian networks.

const CACHE_NAME = 'schoolos-v1'

// Pages to cache immediately when app is first installed
const PRECACHE_URLS = [
  '/login',
  '/offline',
]

// ── Install: cache core pages ──────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch(() => {
        // If precaching fails (e.g. offline during install), continue anyway
        console.log('Precache partial failure — continuing')
      })
    })
  )
  self.skipWaiting()
})

// ── Activate: clean up old caches ─────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  )
  self.clients.claim()
})

// ── Fetch: serve from cache when possible ─────────────
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return

  // Don't intercept API calls or Supabase requests
  const url = new URL(event.request.url)
  if (
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('supabase') ||
    url.hostname.includes('googleapis')
  ) {
    return
  }

  event.respondWith(
    // Try network first, fall back to cache
    fetch(event.request)
      .then((response) => {
        // Cache successful responses
        if (response && response.status === 200) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone)
          })
        }
        return response
      })
      .catch(() => {
        // Network failed — try cache
        return caches.match(event.request).then((cached) => {
          if (cached) return cached
          // If nothing cached, show offline page
          if (event.request.destination === 'document') {
            return caches.match('/offline')
          }
        })
      })
  )
})
