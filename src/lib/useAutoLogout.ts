'use client'
// src/lib/useAutoLogout.ts
// Bulletproof auto-logout using an interval-based last-activity check.
// Avoids timer drift issues and works correctly across tab switches,
// minimisation, and browser backgrounding on mobile.

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const INACTIVITY_LIMIT_MS = 5 * 60 * 1000   // 5 min no activity  → logout
const WARNING_MS          = 4 * 60 * 1000   // 4 min              → warn
const AWAY_LIMIT_MS       = 2 * 60 * 1000   // 2 min hidden tab   → logout
const CHECK_INTERVAL_MS   = 10 * 1000       // check every 10 sec

const LAST_ACTIVITY_KEY = 'scos_last_activity'
const HIDDEN_SINCE_KEY  = 'scos_hidden_since'

interface Options {
  onWarning?: () => void
  onLogout?:  () => void
}

export function useAutoLogout({ onWarning, onLogout }: Options = {}) {
  const router          = useRef(useRouter())
  const supabase        = useRef(createClient())
  const warningFired    = useRef(false)
  const logoutInFlight  = useRef(false)

  // ── stamp activity ───────────────────────────────────────────────
  const stamp = () => sessionStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString())

  // ── perform logout ───────────────────────────────────────────────
  const doLogout = async () => {
    if (logoutInFlight.current) return
    logoutInFlight.current = true
    onLogout?.()
    sessionStorage.removeItem(LAST_ACTIVITY_KEY)
    sessionStorage.removeItem(HIDDEN_SINCE_KEY)
    try { await supabase.current.auth.signOut() } catch (_) {}
    router.current.replace('/login?reason=timeout')
  }

  useEffect(() => {
    // Stamp on mount
    stamp()

    // ── activity listeners ───────────────────────────────────────
    const EVENTS = ['mousemove','mousedown','keydown','touchstart','touchmove','scroll','wheel','click']
    const onActivity = () => { stamp(); warningFired.current = false }
    EVENTS.forEach(e => window.addEventListener(e, onActivity, { passive: true }))

    // ── tab visibility ───────────────────────────────────────────
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        sessionStorage.setItem(HIDDEN_SINCE_KEY, Date.now().toString())
      } else {
        // came back — check if away too long
        const hiddenSince = sessionStorage.getItem(HIDDEN_SINCE_KEY)
        sessionStorage.removeItem(HIDDEN_SINCE_KEY)
        if (hiddenSince) {
          const awayMs = Date.now() - parseInt(hiddenSince, 10)
          if (awayMs >= AWAY_LIMIT_MS) { doLogout(); return }
        }
        // not too long — re-stamp so inactivity clock resets
        stamp()
        warningFired.current = false
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    // ── page close/navigate away ─────────────────────────────────
    const onUnload = () => sessionStorage.setItem(HIDDEN_SINCE_KEY, Date.now().toString())
    window.addEventListener('pagehide',     onUnload)
    window.addEventListener('beforeunload', onUnload)

    // ── interval check (the core mechanism) ─────────────────────
    // Instead of relying on setTimeout (which drifts when tab is backgrounded),
    // we poll every 10s and compare against the stored timestamp.
    const interval = setInterval(() => {
      // Skip check if tab is hidden — visibilitychange handles that
      if (document.visibilityState === 'hidden') return

      const raw = sessionStorage.getItem(LAST_ACTIVITY_KEY)
      if (!raw) { doLogout(); return }

      const idleMs = Date.now() - parseInt(raw, 10)

      if (idleMs >= INACTIVITY_LIMIT_MS) {
        doLogout()
      } else if (idleMs >= WARNING_MS && !warningFired.current) {
        warningFired.current = true
        onWarning?.()
      }
    }, CHECK_INTERVAL_MS)

    return () => {
      clearInterval(interval)
      EVENTS.forEach(e => window.removeEventListener(e, onActivity))
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide',     onUnload)
      window.removeEventListener('beforeunload', onUnload)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])   // empty deps — refs keep values stable, no re-registration needed
      }
