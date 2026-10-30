'use client'
// src/components/savedView/SaveSnapshot.tsx
// Renders nothing. Each time a screen arrives from the server, it quietly
// keeps a copy of the screen's summary on this phone (see lib/savedView/store)
// so the next visit can show it instantly while fresh data loads.

import { useEffect } from 'react'
import { saveView } from '@/lib/savedView/store'

interface Props {
  userId:   string
  routeKey: string
  data:     unknown
}

export default function SaveSnapshot({ userId, routeKey, data }: Props) {
  // Compare by content, so a re-render with identical data doesn't re-save.
  const serialized = JSON.stringify(data)

  useEffect(() => {
    const save = () => { void saveView(userId, routeKey, JSON.parse(serialized)) }
    // Wait for the browser to be idle: saving must never compete with the
    // screen's own work on a slow phone.
    const w = globalThis as unknown as {
      requestIdleCallback?: (cb: () => void) => number
      cancelIdleCallback?:  (id: number) => void
    }
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(save)
      return () => w.cancelIdleCallback?.(id)
    }
    const t = setTimeout(save, 300)
    return () => clearTimeout(t)
  }, [userId, routeKey, serialized])

  return null
}
