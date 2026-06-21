// public/sw.js
// SchoolOS Service Worker — handles Web Push notifications
// =========================================================
// FIX: sw.js used '/icons/icon-192.png' but manifest.json defines
//      '/icons/icon-192x192.png'. Mismatched icon path caused Android
//      Chrome to show a blank/broken icon on push notifications.
//      Both icon and badge now use '/icons/icon-192x192.png'.

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
    // FIX: was '/icons/icon-192.png' — file doesn't exist, correct name is icon-192x192.png
    icon:    icon   || '/icons/icon-192x192.png',
    badge:   badge  || '/icons/icon-192x192.png',
    tag:     tag    || 'schoolos-notification',
    data:    { url: url || '/' },
    vibrate: [200, 100, 200],
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
