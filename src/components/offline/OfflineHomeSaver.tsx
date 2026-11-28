'use client'
// src/components/offline/OfflineHomeSaver.tsx
// Renders nothing. Put on a role's online Home page. While the person is online it:
//  1. saves who they are (profile + school) so the offline twin can rebuild the screen;
//  2. loads the offline twin once per session in a hidden frame so its scripts are cached;
//  3. keeps the Home screen's summary figures on the phone for the twin to show.

import { useEffect } from 'react'
import { useOfflineReady } from '@/hooks/useOfflineReady'
import { saveHomeProps } from '@/lib/offline/homeProps'

interface Props {
  role: string
  userId: string
  profile: unknown
  school: unknown
  /** Plain, non-sensitive summary figures. See lib/offline/homeProps.ts. */
  data: unknown
}

export default function OfflineHomeSaver({ role, userId, profile, school, data }: Props) {
  useOfflineReady({ userId, profile, school, twinPath: `/offline/${role}` })

  // Compare by content so an identical re-render does not save again.
  const serialized = JSON.stringify(data)

  useEffect(() => {
    const save = () => {
      void saveHomeProps(userId, role, JSON.parse(serialized))
    }
    const w = globalThis as unknown as {
      requestIdleCallback?: (cb: () => void) => number
      cancelIdleCallback?: (id: number) => void
    }
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(save)
      return () => w.cancelIdleCallback?.(id)
    }
    const t = setTimeout(save, 300)
    return () => clearTimeout(t)
  }, [userId, role, serialized])

  return null
}
