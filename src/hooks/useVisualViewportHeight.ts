// hooks/useVisualViewportHeight.ts
'use client'
import { useEffect } from 'react'

/**
 * Keeps a `--app-vh` CSS custom property in sync with the *actual visible*
 * viewport height (window.visualViewport), not just `100dvh`.
 *
 * Why this is needed: on iOS Safari (and several Android browsers), `100dvh`
 * accounts for browser chrome (address bar) showing/hiding, but does NOT
 * shrink when the on-screen keyboard opens. A layout built on `100dvh` keeps
 * thinking it has the full screen, so a "sticky" input bar pinned to the
 * bottom of that (now too-tall) layout ends up pushed below the visible
 * area — the whole page has to scroll to reach it, instead of it staying
 * put right above the keyboard.
 *
 * Usage: call this once near the root of any full-height chat-style layout,
 * then reference `var(--app-vh, 100dvh)` instead of `100dvh` in that layout's
 * CSS. Falls back to `window.innerHeight` on browsers without
 * `visualViewport`, and to the static `100dvh` value before JS has run.
 */
export function useVisualViewportHeight() {
  useEffect(() => {
    const vv = window.visualViewport

    function setHeight() {
      const height = vv?.height ?? window.innerHeight
      document.documentElement.style.setProperty('--app-vh', `${height}px`)
    }

    setHeight()
    vv?.addEventListener('resize', setHeight)
    vv?.addEventListener('scroll', setHeight)
    window.addEventListener('resize', setHeight)
    window.addEventListener('orientationchange', setHeight)

    return () => {
      vv?.removeEventListener('resize', setHeight)
      vv?.removeEventListener('scroll', setHeight)
      window.removeEventListener('resize', setHeight)
      window.removeEventListener('orientationchange', setHeight)
    }
  }, [])
}
