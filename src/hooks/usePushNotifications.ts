// src/hooks/usePushNotifications.ts
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Capacitor } from '@capacitor/core'

// ANDROID: this app has no separate native bundle - capacitor.config.ts
// points the WebView straight at the live production URL, so this exact
// file runs both in ordinary mobile/desktop browsers AND inside the
// Capacitor Android app shell. isNativeAndroid() is how it tells those
// two contexts apart at runtime. Inside the shell, the standard Web Push
// API (pushManager.subscribe, VAPID keys) isn't the right tool - Android
// WebViews don't reliably support it the way a real browser does, and
// the app already has a native FCM path server-side (lib/fcm.ts,
// api/push/subscribe's platform:'android' branch) with nothing on the
// client side to ever call it. This hook is that missing piece: same
// public API (supported/subscribed/loading/permission/subscribe/
// unsubscribe/error) either way, so PushToggle and everything else that
// already uses this hook needs zero changes.
function isNativeAndroid(): boolean {
  return typeof window !== 'undefined'
    && Capacitor.isNativePlatform()
    && Capacitor.getPlatform() === 'android'
}

// Returns ArrayBuffer (not Uint8Array) so TypeScript accepts it anywhere
// BufferSource is expected - including applicationServerKey in pushManager.subscribe()
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

/** POST a freshly-obtained Android FCM token to the server. Shared by the
 *  mount-time auto-register path and the explicit subscribe() click -
 *  both just need "we have a token, save it", so this is the one place
 *  that actually talks to the server for the Android branch. */
async function persistAndroidToken(fcmToken: string): Promise<void> {
  const res = await fetch('/api/push/subscribe', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ platform: 'android', fcmToken }),
  })
  if (!res.ok) {
    const d = await res.json().catch(() => ({}))
    throw new Error((d as any).error ?? `Server error ${res.status}`)
  }
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
  const router = useRouter()
  const [supported,  setSupported]  = useState(false)
  const [subscribed, setSubscribed] = useState(false)
  const [loading,    setLoading]    = useState(true)
  const [permission, setPermission] = useState<PushPermissionState>('default')
  const [error,      setError]      = useState<string | null>(null)

  // Holds the current FCM token so unsubscribe() can construct the same
  // `fcm:<token>` endpoint string the server stored it under (see
  // api/push/subscribe's android branch) - there's no equivalent of the
  // web path's pushManager.getSubscription() to look this back up later,
  // so it has to be kept around client-side from whenever we last saw it.
  const androidTokenRef = useRef<string | null>(null)

  // ── Initial state check ───────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return

    if (isNativeAndroid()) {
      setSupported(true)
      let cancelled = false
      let removeRegistration: (() => void) | undefined
      let removeRegistrationError: (() => void) | undefined
      let removeActionPerformed: (() => void) | undefined

      ;(async () => {
        const { PushNotifications } = await import('@capacitor/push-notifications')

        // BUG FIX: this listener didn't exist at all before, so tapping a
        // push notification on Android never navigated anywhere - it just
        // resumed the WebView on whatever page it was already showing
        // (e.g. the messages screen), regardless of what the notification
        // was actually about. lib/fcm.ts already sends the right
        // destination as data.url on every push; this is what actually
        // reads it and navigates there.
        const actionHandle = await PushNotifications.addListener(
          'pushNotificationActionPerformed',
          (action) => {
            const url = action.notification?.data?.url
            if (url) router.push(url)
          }
        )
        removeActionPerformed = () => actionHandle.remove()

        // Registered unconditionally on mount, not just inside subscribe()
        // - so a token from a *previous* launch (permission already
        // granted, register() below re-fires it without prompting again)
        // still gets captured and re-persisted this session.
        const regHandle = await PushNotifications.addListener('registration', async (token) => {
          androidTokenRef.current = token.value
          try {
            await persistAndroidToken(token.value)
            setSubscribed(true)
            setError(null)
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save this device for notifications.')
          } finally {
            setLoading(false)
          }
        })
        removeRegistration = () => regHandle.remove()

        const errHandle = await PushNotifications.addListener('registrationError', (err) => {
          setError(err?.error || 'Failed to register for push notifications.')
          setLoading(false)
        })
        removeRegistrationError = () => errHandle.remove()

        if (cancelled) return

        const status = await PushNotifications.checkPermissions()
        setPermission(
          status.receive === 'granted' ? 'granted' :
          status.receive === 'denied'  ? 'denied'  : 'default'
        )

        if (status.receive === 'granted') {
          // Re-registering when permission is already granted doesn't
          // re-prompt - it just re-fires 'registration' with the current
          // token, which is exactly what we want on every app launch.
          await PushNotifications.register()
        } else {
          setLoading(false)
        }
      })()

      return () => {
        cancelled = true
        removeRegistration?.()
        removeRegistrationError?.()
        removeActionPerformed?.()
      }
    }

    // ── Web branch (unchanged) ────────────────────────────────
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
  }, [router])

  // ── Subscribe ────────────────────────────────────────────────
  const subscribe = useCallback(async () => {
    setLoading(true)
    setError(null)

    if (isNativeAndroid()) {
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications')
        const status = await PushNotifications.requestPermissions()
        setPermission(status.receive === 'granted' ? 'granted' : 'denied')
        if (status.receive !== 'granted') {
          setError(
            status.receive === 'denied'
              ? "Notifications are blocked. Allow them in this device's app settings."
              : 'Notification permission was not granted.'
          )
          setLoading(false)
          return
        }
        // Fires the 'registration' listener set up on mount, which
        // captures the token and POSTs it - nothing further to do here.
        await PushNotifications.register()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to enable notifications. Please try again.')
        setLoading(false)
      }
      return
    }

    // ── Web branch (unchanged) ────────────────────────────────
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

      // 3. Subscribe - applicationServerKey accepts ArrayBuffer directly
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

    if (isNativeAndroid()) {
      try {
        if (androidTokenRef.current) {
          await fetch('/api/push/subscribe', {
            method:  'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ endpoint: `fcm:${androidTokenRef.current}` }),
          })
        }
        // Note: this only stops the server from sending to this device -
        // Android notification permission itself can't be revoked by the
        // app once granted (only the user can, in system Settings). If
        // they re-tap "enable", subscribe() re-registers and re-persists
        // without needing that OS permission to be re-granted.
        setSubscribed(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to disable notifications')
      } finally {
        setLoading(false)
      }
      return
    }

    // ── Web branch (unchanged) ────────────────────────────────
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
