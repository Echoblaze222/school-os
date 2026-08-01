// src/hooks/usePlatform.ts
//
// Single platform-detection layer for the mobile redesign. Sets
// data-platform="ios" | "android" | "desktop" on <html> so globals.css
// can apply Material-ish (bolder shadow/icons) vs iOS-style (lighter
// shadow, more whitespace, iOS-style transitions) treatment via CSS
// alone — no forked component trees per platform.
//
// Usage (call once, e.g. in each dashboard layout.tsx):
//   'use client'
//   import { usePlatform } from '@/hooks/usePlatform'
//   export default function Layout({ children }) {
//     usePlatform()
//     return <>{children}</>
//   }

import { useEffect } from 'react'

export type Platform = 'ios' | 'android' | 'desktop'

export function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'desktop'
  const ua = navigator.userAgent || ''
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'desktop'
}

export function usePlatform(): Platform {
  useEffect(() => {
    const platform = detectPlatform()
    document.documentElement.setAttribute('data-platform', platform)
  }, [])

  return typeof window === 'undefined' ? 'desktop' : detectPlatform()
}
