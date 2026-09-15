'use client'
// src/lib/useAutoLock.ts
// Replaces the old "log the user out after 5 minutes idle" behaviour
// (useAutoLogout.ts, deleted - its only other reference was an already-
// orphaned duplicate layout file, also removed) with a lock screen
// instead: after N minutes of inactivity, the app shows a password
// prompt but does NOT sign out. The Supabase session stays valid the
// whole time, so push notifications and any background sync keep
// working while locked - the whole point of this over a hard logout.
//
// Uses localStorage, not sessionStorage, for the activity timestamp and
// lock flag. This is the specific fix for "even if you clear your RAM
// the app should still know you were inactive": localStorage is written
// to disk and survives the OS killing the app's process to free memory -
// sessionStorage's persistence across a killed-and-relaunched app is not
// guaranteed the same way. Only an explicit "clear site data"/uninstall
// wipes localStorage.

import { useEffect, useRef, useState } from 'react'

const LAST_ACTIVITY_KEY = 'scos_last_activity'
const LOCKED_KEY        = 'scos_locked'
const HIDDEN_SINCE_KEY  = 'scos_hidden_since'
const CHECK_INTERVAL_MS = 10 * 1000

interface Options {
  enabled: boolean   // profiles.auto_lock_enabled
  minutes: number     // profiles.auto_lock_minutes
}

export function useAutoLock({ enabled, minutes }: Options) {
  const [locked, setLocked] = useState(() =>
    typeof window !== 'undefined' && localStorage.getItem(LOCKED_KEY) === '1'
  )
  const limitMs = useRef(minutes * 60 * 1000)
  useEffect(() => { limitMs.current = minutes * 60 * 1000 }, [minutes])

  const lock = () => {
    localStorage.setItem(LOCKED_KEY, '1')
    setLocked(true)
  }

  // Called by LockScreen after a correct password. Resets everything so
  // the next lock is a full `minutes` away, not however long was left
  // when they unlocked.
  const unlock = () => {
    localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString())
    localStorage.removeItem(LOCKED_KEY)
    localStorage.removeItem(HIDDEN_SINCE_KEY)
    setLocked(false)
  }

  useEffect(() => {
    if (!enabled) return
    if (localStorage.getItem(LOCKED_KEY) === '1') return // already reflected in the useState initializer above

    // Only used within this effect, so it's defined here rather than at
    // hook scope - keeps the dependency array below accurate without a
    // useCallback wrapper.
    const stamp = () => localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString())
    stamp()

    const EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'touchmove', 'scroll', 'wheel', 'click']
    const onActivity = () => stamp()
    EVENTS.forEach(e => window.addEventListener(e, onActivity, { passive: true }))

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        localStorage.setItem(HIDDEN_SINCE_KEY, Date.now().toString())
      } else {
        const hiddenSince = localStorage.getItem(HIDDEN_SINCE_KEY)
        localStorage.removeItem(HIDDEN_SINCE_KEY)
        if (hiddenSince && Date.now() - parseInt(hiddenSince, 10) >= limitMs.current) {
          lock()
          return
        }
        stamp()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    const onUnload = () => localStorage.setItem(HIDDEN_SINCE_KEY, Date.now().toString())
    window.addEventListener('pagehide', onUnload)

    // This is what makes the "survives a killed process" guarantee real:
    // on every relaunch this effect re-runs, reads LAST_ACTIVITY_KEY back
    // from disk, and locks immediately if too much time already passed -
    // it doesn't need the interval below to have been running the whole
    // time, only to run this check once on mount.
    const raw = localStorage.getItem(LAST_ACTIVITY_KEY)
    if (raw && Date.now() - parseInt(raw, 10) >= limitMs.current) { lock(); }

    const interval = setInterval(() => {
      if (document.visibilityState === 'hidden') return
      const raw = localStorage.getItem(LAST_ACTIVITY_KEY)
      if (!raw) { stamp(); return }
      if (Date.now() - parseInt(raw, 10) >= limitMs.current) lock()
    }, CHECK_INTERVAL_MS)

    return () => {
      clearInterval(interval)
      EVENTS.forEach(e => window.removeEventListener(e, onActivity))
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onUnload)
    }
  }, [enabled])

  return { locked, unlock }
}
