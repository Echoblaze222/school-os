// src/hooks/usePushNotifications.ts
'use client'

import { useState, useEffect, useCallback } from 'react'

// Returns ArrayBuffer (not Uint8Array) so TypeScript accepts it anywhere
// BufferSource is expected — including applicationServerKey in pushManager.subscribe()
function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const buf     = new ArrayBuffer(rawData.length)
  const view    = new Uint8Array(buf)
  for (let i = 0; i < rawData.length; ++i) {
    view[i] = rawData.charCodeAt(i)
  }
  return buf
}

/** Register SW explicitly and wait for it to be ready, with a 10-second timeout. */
async function getSwRegistration(): Promise<ServiceWorkerRegistration> {
  if (!navigator.serviceWorker.controller) {
    await navigator.serviceWorker.register('/sw.js')
  }
  const readyPromise   = navigator.serviceWorker.ready
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

  // ── Initial state check ───────────────────────────────────────
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
    setError(null)

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
            ? 'Notifications are blocked. Allow them in your browser settings for this site.'
            : 'Notification permission was not granted.'
        )
        setLoading(false)
        return
      }

      // 2. Get SW registration (with timeout guard so we never stall)
      const reg = await getSwRegistration()

      // 3. Subscribe — applicationServerKey accepts ArrayBuffer directly
      const pushSub = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })

      // 4. Persist subscription on server
      const res = await fetch('/api/push/subscribe', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ subscription: pushSub.toJSON() }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error((d as any).error ?? `Server error ${res.status}`)
      }

      setSubscribed(true)
    } catch (err: unknown) {
      // Clean up any broken subscription so the button works on next tap
      try {
        const reg   = await navigator.serviceWorker.ready
        const stale = await reg.pushManager.getSubscription()
        if (stale) await stale.unsubscribe()
      } catch { /* ignore */ }

      const msg = err instanceof Error ? err.message : 'Failed to enable notifications. Please try again.'
      setError(msg)
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to disable notifications'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  return { supported, subscribed, loading, permission, subscribe, unsubscribe, error }
      }
