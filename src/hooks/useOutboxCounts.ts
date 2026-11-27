'use client'
// src/hooks/useOutboxCounts.ts
// Live count of this user's pending/failed offline changes. Backed by Dexie's
// liveQuery, so it also updates when another tab queues or flushes something.

import { useEffect, useState } from 'react'
import { liveQuery } from 'dexie'
import { offlineStorageAvailable } from '@/lib/offline/db'
import { getOutboxCounts } from '@/lib/offline/outbox'

export function useOutboxCounts(userId: string | null): { pending: number; failed: number } {
  const [counts, setCounts] = useState({ pending: 0, failed: 0 })

  useEffect(() => {
    if (!userId || !offlineStorageAvailable()) {
      setCounts({ pending: 0, failed: 0 })
      return
    }
    const subscription = liveQuery(() => getOutboxCounts(userId)).subscribe({
      next: setCounts,
      error: () => setCounts({ pending: 0, failed: 0 }),
    })
    return () => subscription.unsubscribe()
  }, [userId])

  return counts
}
