// src/hooks/usePushNotifications.ts
// ─────────────────────────────────────────────────────────────────────────────
// Drop this hook into any dashboard client component to add a "Enable/Disable
// Notifications" toggle.  It handles the full lifecycle:
//   1. Checks browser support
//   2. Registers the service worker (already registered by layout.tsx, but
//      we wait for it here before subscribing)
//   3. Requests permission + subscribes to the Push API
//   4. Saves the subscription to /api/push/subscribe
//   5. Handles unsubscription + cleanup
//
// Usage:
//   const { supported, subscribed, loading, permission, subscribe, unsubscribe }
//     = usePushNotifications()
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react'

// The VAPID public key must be available on the client
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!

// Convert a URL-safe base64 string to a Uint8Array (required by PushManager)
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding    = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64     = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData    = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export type PushPermissionState = 'default' | 'granted' | 'denied' | 'unsupported'

export interface PushNotificationHook {
  /** Browser supports Web Push */
  supported:    boolean
  /** User is currently subscribed */
  subscribed:   boolean
  /** Action in progress */
  loading:      boolean
  /** Current notification permission state */
  permission:   PushPermissionState
  /** Subscribe this browser */
  subscribe:    () => Promise<void>
  /** Unsubscribe this browser */
  unsubscribe:  () => Promise<void>
  /** Last error message, if any */
  error:        string | null
}

export function usePushNotifications(): PushNotificationHook {
  const [supported,  setSupported]  = useState(false)
  const [subscribed, setSubscribed] = useState(false)
  const [loading,    setLoading]    = useState(true)
  const [permission, setPermission] = useState<PushPermissionState>('default')
  const [error,      setError]      = useState<string | null>(null)

  // ── Initial check ──────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setSupported(false)
      setLoading(false)
      return
    }

    setSupported(true)
    setPermission(Notification.permission as PushPermissionState)

    // Check if this browser already has an active subscription
    navigator.serviceWorker.ready.then(async (reg) => {
      try {
        const existing = await reg.pushManager.getSubscription()
        setSubscribed(!!existing)
      } catch {
        setSubscribed(false)
      } finally {
        setLoading(false)
      }
    })
  }, [])

  // ── Subscribe ──────────────────────────────────────────────
  const subscribe = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // 1. Request permission
      const result = await Notification.requestPermission()
      setPermission(result as PushPermissionState)
      if (result !== 'granted') {
        setError('Notification permission denied. Please allow it in your browser settings.')
        setLoading(false)
        return
      }

      // 2. Get the service worker registration
      const reg = await navigator.serviceWorker.ready

      // 3. Subscribe to Push API
      const pushSub = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })

      // 4. Save to our server
      const res = await fetch('/api/push/subscribe', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ subscription: pushSub.toJSON() }),
      })

      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Failed to save subscription')
      }

      setSubscribed(true)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to enable notifications')
      setSubscribed(false)
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Unsubscribe ────────────────────────────────────────────
  const unsubscribe = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const reg      = await navigator.serviceWorker.ready
      const pushSub  = await reg.pushManager.getSubscription()

      if (pushSub) {
        const endpoint = pushSub.endpoint

        // Unsubscribe from the browser
        await pushSub.unsubscribe()

        // Remove from our server
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
