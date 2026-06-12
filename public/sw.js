// public/sw.js
// SchoolOS Service Worker — handles Web Push notifications
// =========================================================
// Deploy location: /public/sw.js  →  served at /sw.js
// The root layout.tsx already registers this file.

const CACHE_NAME = 'schoolos-v1'

// ── Install & Activate ────────────────────────────────────
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
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
    icon:    icon   || '/icons/icon-192.png',
    badge:   badge  || '/icons/icon-192.png',
    tag:     tag    || 'schoolos-notification',
    data:    { url: url || '/' },
    // Show a vibration pattern on Android
    vibrate: [200, 100, 200],
    // Keep visible until user interacts
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
      // If a SchoolOS tab is already open, focus it and navigate
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus()
          client.navigate(targetUrl)
          return
        }
      }
      // Otherwise open a new tab
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl)
      }
    })
  )
})

// ── Push subscription change ──────────────────────────────
// Fires when the browser auto-renews a subscription.
// We tell our server about the new endpoint.
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
