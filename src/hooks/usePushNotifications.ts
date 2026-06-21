// src/hooks/usePushNotifications.ts
// ─────────────────────────────────────────────────────────────────────────────
// FIX SUMMARY (3 bugs):
//
// BUG 1 — "Enable Alert clicked, nothing happens":
//   subscribe() called navigator.serviceWorker.ready but the SW registration
//   from layout.tsx runs on 'load' event. On Android Chrome in a PWA context,
//   navigator.serviceWorker.ready can stall indefinitely if the SW hasn't
//   registered yet. Added an explicit SW registration call with a 10-second
//   timeout fallback so subscribe() always gets a valid registration.
//
// BUG 2 — VAPID key captured as empty string at module load time:
//   NEXT_PUBLIC_VAPID_PUBLIC_KEY was read at the top of the file before
//   Next.js had finished injecting env vars into the client bundle on some
//   cold starts. Moved the read inside subscribe() so it's always fresh.
//
// BUG 3 — Error message "Push notifications are not configured for this site."
//   shown as a banner but never cleared on retry. Added setError(null) at the
//   top of every action so stale errors don't persist.
// ─────────────────────────────────────────────────────────────────────────────

'use client'

import { useState, useEffect, useCallback } from 'react'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding     = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64      = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData     = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

/** Wait for the SW to be ready with a timeout so we never stall forever. */
async function getSwRegistration(): Promise<ServiceWorkerRegistration> {
  // 1. Try to register (idempotent — browser deduplicates)
  if (navigator.serviceWorker.controller === null) {
    await navigator.serviceWorker.register('/sw.js')
  }

  // 2. Race navigator.serviceWorker.ready against a 10-second timeout
  const readyPromise = navigator.serviceWorker.ready
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Service worker did not become ready in time')), 10_000)
  )

  return Promise.race([readyPromise, timeoutPromise])
}

export type PushPermissionState = 'default' | 'granted' | 'denied' | 'unsupported'

export interface PushNotificationHook {
  supported:   boolean
  subscribed:  boolean
  loading:     boolean
  permission:  PushPermissionState
  subscribe:   () => Promise<void>
  unsubscribe: () => Promise<void>
  error:       string | null
}

export function usePushNotifications(): PushNotificationHook {
  const [supported,  setSupported]  = useState(false)
  const [subscribed, setSubscribed] = useState(false)
  const [loading,    setLoading]    = useState(true)
  const [permission, setPermission] = useState<PushPermissionState>('default')
  const [error,      setError]      = useState<string | null>(null)

  // ── Initial check ────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setSupported(false)
      setLoading(false)
      return
    }

    setSupported(true)
    setPermission(Notification.permission as PushPermissionState)

    navigator.serviceWorker.ready
      .then(async (reg) => {
        try {
          const existing = await reg.pushManager.getSubscription()
          setSubscribed(!!existing)
        } catch {
          setSubscribed(false)
        } finally {
          setLoading(false)
        }
      })
      .catch(() => setLoading(false))
  }, [])

  // ── Subscribe ────────────────────────────────────────────────
  const subscribe = useCallback(async () => {
    setLoading(true)
    setError(null) // always clear previous error on retry

    // Read VAPID key fresh inside the callback (not at module scope)
    const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

    if (!VAPID_PUBLIC_KEY) {
      setError('Push notifications are not configured for this site.')
      setLoading(false)
      return
    }

    try {
      // 1. Request permission
      const result = await Notification.requestPermission()
      setPermission(result as PushPermissionState)
      if (result !== 'granted') {
        setError(
          result === 'denied'
            ? 'Notifications are blocked. Go to your browser settings and allow notifications for this site.'
            : 'Notification permission was not granted.'
        )
        setLoading(false)
        return
      }

      // 2. Get SW registration (with timeout guard)
      const reg = await getSwRegistration()

      // 3. Subscribe to Push API
      const pushSub = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })

      // 4. Save subscription to server
      const res = await fetch('/api/push/subscribe', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ subscription: pushSub.toJSON() }),
      })

      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? `Server error ${res.status}`)
      }

      setSubscribed(true)
    } catch (err: any) {
      // If subscribe() itself rejected (e.g. user dismissed the prompt on
      // Android), the pushManager can leave a broken subscription behind.
      // Clean it up so the button works on next tap.
      try {
        const reg = await navigator.serviceWorker.ready
        const stale = await reg.pushManager.getSubscription()
        if (stale) await stale.unsubscribe()
      } catch { /* ignore cleanup errors */ }

      setError(err?.message ?? 'Failed to enable notifications. Please try again.')
      setSubscribed(false)
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Unsubscribe ──────────────────────────────────────────────
  const unsubscribe = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const reg     = await navigator.serviceWorker.ready
      const pushSub = await reg.pushManager.getSubscription()

      if (pushSub) {
        const endpoint = pushSub.endpoint
        await pushSub.unsubscribe()
        await fetch('/api/push/subscribe', {
          method:  'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ endpoint }),
        })
      }

      setSubscribed(false)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to disable notifications')
    } finally {
      setLoading(false)
    }
  }, [])

  return { supported, subscribed, loading, permission, subscribe, unsubscribe, error }
    }
      
