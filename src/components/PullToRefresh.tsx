'use client'
// Pull-to-refresh for the dashboard shell.
//
// Why this exists: the Android build is a Capacitor WebView pointed at the
// live web deployment (see capacitor.config.ts), not a native shell - so
// there's no OS-level pull-to-refresh the way a truly native app gets for
// free. Most pages get fresh data automatically (server-component props on
// navigation, router.refresh() after mutations, a few realtime subscriptions),
// but any of those can be delayed by a slow connection, or a page's data
// simply isn't wired to a realtime channel. This is the manual escape hatch:
// pull down from the top of any dashboard screen to force a full reload.
//
// Deliberately uses window.location.reload() rather than router.refresh():
// router.refresh() only re-runs server-component data fetching, but several
// pages hold their own client-fetched state (e.g. ParentDashboardClient's
// children list) that router.refresh() wouldn't touch. This is a rare,
// explicit, user-initiated gesture - not something that fires automatically
// after every small action - so paying for a full reload here is the right
// trade, unlike the automatic post-mutation reloads removed elsewhere.
//
// Only attaches touch listeners when the device actually supports touch,
// so this is inert (zero overhead) on desktop.
//
// FIX (reported: "I'm scrolling and instead of scrolling it just
// refreshes itself"): onTouchStart only checked window.scrollY === 0 at
// the instant a new touch began, with no check for whether the page had
// actually settled there. Mobile scrolling has momentum - flick-scroll
// to the top, touch down again quickly to keep scrolling (an entirely
// normal, common gesture), and the page can still be mid-settle when
// the new touch lands. scrollY can already read 0 a beat before the
// momentum animation is visually finished, so the very next ordinary
// scroll gesture gets armed as a pull-to-refresh candidate instead.
// SETTLE_MS below requires a brief quiet period (no scroll events) at
// the top before a new touch is allowed to arm pull-tracking at all -
// a deliberate pull that starts from a page genuinely at rest is
// unaffected; a touch that lands while the page is still settling from
// momentum is correctly treated as a continued scroll attempt, not a
// pull, and falls through to normal scrolling instead.

import { useEffect, useRef, useState } from 'react'
import { RefreshIcon } from './Icons'
import styles from './PullToRefresh.module.css'

const PULL_THRESHOLD  = 72   // px of pull needed to trigger a refresh on release
const MAX_PULL        = 120  // px - visual cap so the indicator doesn't fly off-screen
const RESISTANCE      = 0.5  // pull distance grows slower than the finger for a natural feel
const SETTLE_MS       = 150  // minimum quiet time at the top before a new touch can arm a pull

export default function PullToRefresh({ children, disabled = false }: { children: React.ReactNode; disabled?: boolean }) {
  const [pullDistance, setPullDistance] = useState(0)
  const [refreshing,   setRefreshing]   = useState(false)
  const touchStartY   = useRef<number | null>(null)
  const tracking       = useRef(false)
  // Updated on every scroll event regardless of position - what matters
  // for the settle check is "was the page moving very recently", not
  // "what was its last non-zero position".
  const lastScrollAt   = useRef(0)

  useEffect(() => {
    if (typeof window === 'undefined' || !('ontouchstart' in window)) return

    function onScroll() {
      lastScrollAt.current = Date.now()
    }

    function onTouchStart(e: TouchEvent) {
      if (disabled) return
      // Only start tracking a possible pull if the page is already scrolled
      // to the very top AND has been sitting there for a moment - otherwise
      // this is either a normal scroll gesture, or a new touch landing
      // while momentum scrolling is still settling at the top (see file
      // header).
      if (window.scrollY > 0) { tracking.current = false; return }
      if (Date.now() - lastScrollAt.current < SETTLE_MS) { tracking.current = false; return }
      touchStartY.current = e.touches[0].clientY
      tracking.current = true
    }

    function onTouchMove(e: TouchEvent) {
      if (!tracking.current || touchStartY.current === null || refreshing) return
      const delta = e.touches[0].clientY - touchStartY.current
      if (delta <= 0) { setPullDistance(0); return }
      // Still at the top and pulling down - this is our gesture, not a
      // page scroll, so prevent the browser's own overscroll/bounce.
      if (window.scrollY === 0) e.preventDefault()
      setPullDistance(Math.min(delta * RESISTANCE, MAX_PULL))
    }

    async function onTouchEnd() {
      if (!tracking.current) return
      tracking.current = false
      touchStartY.current = null
      if (pullDistance >= PULL_THRESHOLD && !refreshing) {
        setRefreshing(true)
        // Full reload, see file header for why this doesn't use router.refresh().
        window.location.reload()
      } else {
        setPullDistance(0)
      }
    }

    window.addEventListener('scroll',     onScroll,     { passive: true })
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove',  onTouchMove,  { passive: false })
    window.addEventListener('touchend',   onTouchEnd,   { passive: true })
    return () => {
      window.removeEventListener('scroll',     onScroll)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove',  onTouchMove)
      window.removeEventListener('touchend',   onTouchEnd)
    }
  }, [pullDistance, refreshing, disabled])

  const progress = Math.min(pullDistance / PULL_THRESHOLD, 1)

  return (
    <>
      {(pullDistance > 0 || refreshing) && (
        <div
          className={styles.indicator}
          style={{
            height: refreshing ? PULL_THRESHOLD : pullDistance,
            opacity: progress,
            transition: pullDistance === 0 ? 'height 0.3s var(--ease-overshoot)' : undefined,
          }}
        >
          <RefreshIcon
            size={22}
            className={refreshing ? styles.spinning : styles.icon}
            strokeWidth={2}
          />
        </div>
      )}
      <div
        style={{
          transform: pullDistance > 0 ? `translateY(${pullDistance}px)` : undefined,
          transition: pullDistance === 0 ? 'transform 0.3s var(--ease-overshoot)' : undefined,
        }}
      >
        {children}
      </div>
    </>
  )
}
