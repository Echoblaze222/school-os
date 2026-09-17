'use client'
// Why this exists:
//
// supabase-js keeps a Realtime websocket's auth (and therefore what its
// row-level security checks see) fresh via an internal setTimeout scheduled
// against the current session's expiry. That timer is silently dropped
// whenever the JS event loop is paused - which is exactly what Android does
// to a backgrounded WebView to save battery. This app's Android build is a
// Capacitor WebView (see capacitor.config.ts), so backgrounding it for
// anything longer than the JWT's lifetime (Supabase's default is ~1 hour)
// leaves every open realtime channel silently stuck: still reporting
// "SUBSCRIBED", but evaluating RLS against a token that's already expired,
// so nothing new comes through.
//
// This doesn't affect regular page navigation, because middleware refreshes
// the session from cookies on every request - which is exactly why chat,
// announcements, and notifications can all go quiet at once after a long
// idle stretch while everything else in the app still looks fine.
//
// The fix: whenever the tab/WebView becomes visible or focused again,
// explicitly re-authenticate the realtime client with a fresh token. This
// is Supabase's own documented pattern for this situation - it updates the
// auth used by the *existing* socket connection in place, so already-open
// channel subscriptions don't need to be torn down and recreated.

import { useEffect, useRef } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

export function useRealtimeReconnect(supabase: SupabaseClient, onReconnect?: () => void) {
  const lastRefresh = useRef(0)
  const onReconnectRef = useRef(onReconnect)
  useEffect(() => {
    onReconnectRef.current = onReconnect
  })

  useEffect(() => {
    async function reauth() {
      // Guard against a burst of visibility/focus events (quickly switching
      // apps, alt-tabbing) firing several redundant refreshes back to back.
      const now = Date.now()
      if (now - lastRefresh.current < 5000) return
      lastRefresh.current = now

      // getSession() refreshes the token first if it's expired, so this
      // always hands realtime a currently-valid one.
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        supabase.realtime.setAuth(session.access_token)
        onReconnectRef.current?.()
      }
    }

    function handleVisibility() {
      if (document.visibilityState === 'visible') reauth()
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('focus', reauth)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', reauth)
    }
  }, [supabase])
}
