'use client'
// src/hooks/useOfflineReady.ts
// Makes a screen usable offline later. Call from a screen's client component
// while it is online:
//  1. saves who the user is (profile + school) so the offline twin page can
//     rebuild the screen with no server;
//  2. quietly loads the offline twin page once per session in a hidden frame, so
//     the service worker has every script and style it needs. Without this a page
//     that was never opened online could not start offline.

import { useEffect } from 'react'
import { saveIdentity } from '@/lib/offline/identity'

const WARM_FLAG = 'schoolos_offline_warm:'

export function useOfflineReady(opts: { userId: string; profile: unknown; school: unknown; twinPath: string }) {
  const { userId, profile, school, twinPath } = opts

  useEffect(() => {
    if (!userId || !profile) return
    void saveIdentity(userId, profile, school)
    // profile/school come from the server render and do not change while mounted
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (navigator.onLine === false || !('serviceWorker' in navigator)) return
    const timer = setTimeout(() => {
      try {
        if (sessionStorage.getItem(WARM_FLAG + twinPath)) return
        sessionStorage.setItem(WARM_FLAG + twinPath, '1')
        const frame = document.createElement('iframe')
        frame.src = `${twinPath}?warm=1`
        frame.setAttribute('aria-hidden', 'true')
        frame.tabIndex = -1
        frame.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden'
        document.body.appendChild(frame)
        setTimeout(() => frame.remove(), 20_000)
      } catch {
        // best effort
      }
    }, 4_000)
    return () => clearTimeout(timer)
  }, [twinPath])
}
