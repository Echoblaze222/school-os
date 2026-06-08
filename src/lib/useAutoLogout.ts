'use client'
// src/lib/useAutoLogout.ts
// Client-side hook that tracks user inactivity and signs them out.
// Works in tandem with the middleware — middleware catches idle sessions
// on navigation; this hook catches pure inactivity (tab open, no navigation).

import { useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const INACTIVITY_MS = 30 * 60 * 1000  // 30 minutes
const WARNING_MS    = 25 * 60 * 1000  // Warn at 25 minutes

interface Options {
  onWarning?: () => void
  onLogout?: () => void
}

export function useAutoLogout({ onWarning, onLogout }: Options = {}) {
  const router = useRouter()
  const supabase = createClient()
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const warningTimer    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const warningFired    = useRef(false)
  const isLoggingOut    = useRef(false)

  const clearTimers = useCallback(() => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current)
    if (warningTimer.current)    clearTimeout(warningTimer.current)
  }, [])

  const logout = useCallback(async () => {
    // Guard against double-logout
    if (isLoggingOut.current) return
    isLoggingOut.current = true

    clearTimers()
    onLogout?.()

    // Sign out from Supabase — this clears the client-side session cookie
    await supabase.auth.signOut()

    // Hard navigate (not router.replace) so Next.js middleware re-evaluates
    // the now-cleared session and doesn't serve a cached dashboard
    window.location.replace('/login?reason=timeout')
  }, [clearTimers, onLogout, supabase.auth])

  const resetTimers = useCallback(() => {
    if (isLoggingOut.current) return
    clearTimers()
    warningFired.current = false

    warningTimer.current = setTimeout(() => {
      if (!warningFired.current && !isLoggingOut.current) {
        warningFired.current = true
        onWarning?.()
      }
    }, WARNING_MS)

    inactivityTimer.current = setTimeout(logout, INACTIVITY_MS)
  }, [clearTimers, logout, onWarning])

  useEffect(() => {
    const EVENTS = [
      'mousemove', 'mousedown', 'keydown',
      'touchstart', 'touchmove', 'scroll', 'wheel', 'click',
    ]

    const handleActivity = () => resetTimers()
    EVENTS.forEach(evt => window.addEventListener(evt, handleActivity, { passive: true }))

    resetTimers()

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && !isLoggingOut.current) {
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
