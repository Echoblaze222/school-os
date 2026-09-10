'use client'
// src/components/AndroidBackHandler.tsx
//
// Capacitor's default hardware-back behaviour is: go back in the WebView's
// history if possible, otherwise exit the app immediately. That default is
// what was actually being hit - not a bug in Capacitor itself, but the
// wrong behaviour for this app, since many in-app transitions use
// router.replace() or window.location.href (both of which this session
// added deliberately elsewhere, to defeat stale Router Cache issues) and
// those don't add a history entry the way router.push() does. The result:
// the WebView's history is often much shallower than the number of screens
// the user has actually visited, so "no history left" - and therefore
// "exit the app" - triggers far sooner than a user would expect.
//
// This replaces that default with standard Android app-navigation UX:
//   - If the WebView genuinely has history, go back in it (unchanged).
//   - If not, and the user isn't on a dashboard "root" screen, send them
//     to their dashboard home instead of exiting - that's always a
//     reasonable "back" destination even when literal history ran out.
//   - If they ARE on a root screen, minimise the app (standard Android
//     behaviour - this is what pressing back on any app's home screen
//     normally does) rather than killing it, with a "press back again to
//     exit" grace period as a safety net against accidental double-taps.
//
// Native platforms only - has no effect on the web experience.

import { useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useToast } from '@/contexts/ToastContext'

const EXIT_GRACE_MS = 2000

// A "root" screen: bare /dashboard, or exactly one segment under it
// (/dashboard/teacher), or the pre-auth entry points. Anything deeper
// (/dashboard/teacher/attendance) is not a root - back should navigate
// within the app, never minimise or exit from there.
function isRootScreen(pathname: string): boolean {
  if (pathname === '/dashboard') return true
  if (/^\/dashboard\/[a-z-]+$/.test(pathname)) return true
  if (pathname === '/select-school' || pathname === '/login') return true
  return false
}

function dashboardHomeFor(pathname: string): string {
  const match = pathname.match(/^\/dashboard\/([a-z-]+)/)
  return match ? `/dashboard/${match[1]}` : '/dashboard'
}

export default function AndroidBackHandler() {
  const router   = useRouter()
  const pathname = usePathname()
  const { showToast } = useToast()

  const pathnameRef   = useRef(pathname)
  const lastBackPress = useRef(0)
  pathnameRef.current  = pathname

  useEffect(() => {
    let removeListener: (() => void) | undefined
    let cancelled = false

    ;(async () => {
      // Capacitor plugins throw/no-op harmlessly on web, but guard with
      // isNativePlatform anyway so this never runs a WebView-only API path
      // in a normal browser tab.
      const { Capacitor } = await import('@capacitor/core')
      if (!Capacitor.isNativePlatform()) return

      const { App } = await import('@capacitor/app')
      const handle = await App.addListener('backButton', ({ canGoBack }) => {
        const current = pathnameRef.current

        if (canGoBack) {
          window.history.back()
          return
        }

        if (!isRootScreen(current)) {
          router.push(dashboardHomeFor(current))
          return
        }

        const now = Date.now()
        if (now - lastBackPress.current < EXIT_GRACE_MS) {
          App.exitApp()
          return
        }
        lastBackPress.current = now
        showToast({ message: 'Press back again to exit', variant: 'info' })
      })

      if (cancelled) {
        handle.remove()
      } else {
        removeListener = () => handle.remove()
      }
    })()

    return () => {
      cancelled = true
      removeListener?.()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
