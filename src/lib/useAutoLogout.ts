'use client'
// src/lib/useAutoLogout.ts
// Tracks inactivity AND tab/window visibility to sign out the user.
//
// Logout triggers:
//   1. No activity for INACTIVITY_MS (mouse, keyboard, touch, scroll)
//   2. Tab hidden for longer than AWAY_MS (switched tab / minimised)
//   3. Page unloaded (closed tab, closed browser, navigated away externally)
//      → stores a timestamp in sessionStorage; on next load the middleware
//        or the layout can check it and redirect to /login?reason=timeout

import { useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const INACTIVITY_MS = 5 * 60 * 1000   // 5 min of no activity  → logout
const WARNING_MS    = 4 * 60 * 1000   // 4 min                 → warn
const AWAY_MS       = 2 * 60 * 1000   // 2 min hidden tab      → logout

const AWAY_KEY = 'schoolos_away_since'

interface Options {
  onWarning?: () => void
  onLogout?:  () => void
}

export function useAutoLogout({ onWarning, onLogout }: Options = {}) {
  const router   = useRouter()
  const supabase = createClient()

  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const warningTimer    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const awayTimer       = useRef<ReturnType<typeof setTimeout> | null>(null)
  const warningFired    = useRef(false)

  // ── helpers ────────────────────────────────────────────────────────────────

  const clearTimers = useCallback(() => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current)
    if (warningTimer.current)    clearTimeout(warningTimer.current)
    if (awayTimer.current)       clearTimeout(awayTimer.current)
  }, [])

  const logout = useCallback(async () => {
    clearTimers()
    sessionStorage.removeItem(AWAY_KEY)
    onLogout?.()
    await supabase.auth.signOut()
    router.replace('/login?reason=timeout')
  }, [clearTimers, onLogout, router, supabase.auth])

  const resetTimers = useCallback(() => {
    clearTimers()
    warningFired.current = false

    warningTimer.current    = setTimeout(() => {
      if (!warningFired.current) { warningFired.current = true; onWarning?.() }
    }, WARNING_MS)

    inactivityTimer.current = setTimeout(logout, INACTIVITY_MS)
  }, [clearTimers, logout, onWarning])

  // ── main effect ────────────────────────────────────────────────────────────

  useEffect(() => {
    // 1. Activity events reset the inactivity clock
    const EVENTS = [
      'mousemove', 'mousedown', 'keydown',
      'touchstart', 'touchmove', 'scroll', 'wheel', 'click',
    ]
    const handleActivity = () => resetTimers()
    EVENTS.forEach(evt => window.addEventListener(evt, handleActivity, { passive: true }))

    // 2. Tab hidden → start an "away" countdown; tab visible → check how long they were gone
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        // Record when they left
        sessionStorage.setItem(AWAY_KEY, Date.now().toString())

        // Start a timer — if they don't come back within AWAY_MS, sign out
        // (This fires even if the tab is just backgrounded on mobile)
        awayTimer.current = setTimeout(logout, AWAY_MS)
      } else {
        // They came back — check if they were gone too long
        clearTimeout(awayTimer.current!)
        const wentAway = sessionStorage.getItem(AWAY_KEY)
        if (wentAway) {
          const elapsed = Date.now() - parseInt(wentAway, 10)
          sessionStorage.removeItem(AWAY_KEY)
          if (elapsed >= AWAY_MS) {
            logout()
            return
          }
        }
        // Not gone too long — just reset the inactivity clock
        resetTimers()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    // 3. Page unload (closed tab, browser closed, navigated away)
    //    We can't reliably async-sign-out here, so store a timestamp.
    //    On next load, if the session is still alive but the stamp is old, force logout.
    const handleUnload = () => {
      sessionStorage.setItem(AWAY_KEY, Date.now().toString())
    }
    // pagehide is more reliable than beforeunload on mobile/Safari
    window.addEventListener('pagehide',     handleUnload)
    window.addEventListener('beforeunload', handleUnload)

    // Start the inactivity clock
    resetTimers()

    return () => {
      clearTimers()
      EVENTS.forEach(evt => window.removeEventListener(evt, handleActivity))
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('pagehide',     handleUnload)
      window.removeEventListener('beforeunload', handleUnload)
    }
  }, [resetTimers, clearTimers, logout])
}
