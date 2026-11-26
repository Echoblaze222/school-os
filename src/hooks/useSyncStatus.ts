'use client'
// src/hooks/useSyncStatus.ts
// Everything the "Offline & sync" status card needs, live: queued changes, what is on this
// phone and how old it is, whether the browser will keep it, and whether the backend is up.

import { useEffect, useState, useSyncExternalStore } from 'react'
import { liveQuery } from 'dexie'
import { offlineStorageAvailable } from '@/lib/offline/db'
import { getSyncSummary, type SyncSummary } from '@/lib/offline/pullSync'
import { getStorageHealth, type StorageHealth } from '@/lib/offline/storage'
import { getServerSnapshot, getSnapshot, subscribe, type ServiceState } from '@/lib/serviceStatus'
import { useOutboxCounts } from '@/hooks/useOutboxCounts'

export interface SyncStatus {
  service: ServiceState
  pending: number
  failed: number
  summary: SyncSummary | null
  storage: StorageHealth | null
}

export function useSyncStatus(userId: string | null): SyncStatus {
  const service = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const { pending, failed } = useOutboxCounts(userId)
  const [summary, setSummary] = useState<SyncSummary | null>(null)
  const [storage, setStorage] = useState<StorageHealth | null>(null)

  useEffect(() => {
    if (!userId || !offlineStorageAvailable()) return
    const sub = liveQuery(() => getSyncSummary(userId)).subscribe({
      next: setSummary,
      error: () => setSummary(null),
    })
    return () => sub.unsubscribe()
  }, [userId])

  useEffect(() => {
    let active = true
    void getStorageHealth().then((h) => {
      if (active) setStorage(h)
    })
    return () => {
      active = false
    }
  }, [])

  return { service: service.state, pending, failed, summary: userId ? summary : null, storage }
}
