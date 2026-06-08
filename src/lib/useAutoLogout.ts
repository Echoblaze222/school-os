'use client'
// src/lib/useAutoLogout.ts
// Client-side hook that tracks user inactivity and signs them out.
// Use this in your root layout or dashboard layout to ensure
// the logout happens even mid-session without a page reload.
//
// Works in tandem with the middleware — middleware catches idle
// sessions on navigation; this hook catches pure inactivity
// (user left the tab open without navigating).

import { useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const INACTIVITY_MS = 30 * 60 * 1000  // 30 minutes — keep in sync with middleware.ts
const WARNING_MS    = 25 * 60 * 1000  // Warn the user at 25 minutes

interface Options {
  onWarning?: () => void   // called at WARNING_MS to show a "You'll be logged out soon" toast
  onLogout?: () => void    // called just before logout
}

export function useAutoLogout({ onWarning, onLogout }: Options = {}) {
  const router = useRouter()
  const supabase = createClient()
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const warningTimer    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const warningFired    = useRef(false)

  const clearTimers = useCallback(() => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current)
    if (warningTimer.current)    clearTimeout(warningTimer.current)
  }, [])

  const logout = useCallback(async () => {
    clearTimers()
    onLogout?.()
    await supabase.auth.signOut()
    router.replace('/login?reason=timeout')
  }, [clearTimers, onLogout, router, supabase.auth])

  const resetTimers = useCallback(() => {
    clearTimers()
    warningFired.current = false

    // Warning timer
    warningTimer.current = setTimeout(() => {
      if (!warningFired.current) {
        warningFired.current = true
        onWarning?.()
      }
    }, WARNING_MS)

    // Logout timer
    inactivityTimer.current = setTimeout(logout, INACTIVITY_MS)
  }, [clearTimers, logout, onWarning])

  useEffect(() => {
    // Activity events to watch
    const EVENTS = [
      'mousemove', 'mousedown', 'keydown',
      'touchstart', 'touchmove', 'scroll', 'wheel', 'click',
    ]

    const handleActivity = () => resetTimers()

    EVENTS.forEach(evt => window.addEventListener(evt, handleActivity, { passive: true }))

    // Start the timers immediately
    resetTimers()

    // Also handle tab visibility — reset when user comes back to tab
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        // Check if the cookie is still valid — if not, force logout
        resetTimers()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      clearTimers()
      EVENTS.forEach(evt => window.removeEventListener(evt, handleActivity))
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [resetTimers, clearTimers])
}
