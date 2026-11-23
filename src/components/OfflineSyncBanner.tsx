'use client'
// src/components/OfflineSyncBanner.tsx
// Mounted once in the dashboard layout (and inside OfflineShell on offline twin
// pages, which pass the user id they already know). Starts the background sync
// for the signed-in user and shows a small notice while changes are saved on this
// device waiting to upload, or when the server refused some of them.
//
// It stays hidden whenever ServiceStatusBanner is showing (same screen slot), so
// the two never overlap.

import { useEffect, useState, useSyncExternalStore } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getServerSnapshot, getSnapshot, subscribe } from '@/lib/serviceStatus'
import { startAutoSync } from '@/lib/offline/autoSync'
import type { SyncClient } from '@/lib/offline/syncEngine'
import { useOutboxCounts } from '@/hooks/useOutboxCounts'
import styles from './OfflineSyncBanner.module.css'

export default function OfflineSyncBanner({ userId: knownUserId }: { userId?: string | null }) {
  const [sessionUserId, setSessionUserId] = useState<string | null>(null)
  // An offline page already knows the user and cannot rely on getSession(), which
  // returns nothing once the access token has expired and cannot be refreshed.
  const userId = knownUserId ?? sessionUserId
  const service = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const { pending, failed } = useOutboxCounts(userId)

  useEffect(() => {
    if (knownUserId) return
    const supabase = createClient()
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (active) setSessionUserId(data.session?.user?.id ?? null)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionUserId(session?.user?.id ?? null)
    })
    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [knownUserId])

  useEffect(() => {
    if (!userId) return
    // The engine only needs from(table).upsert(rows, opts); cast because the
    // generated Supabase client types are far wider than that.
    const client = createClient() as unknown as SyncClient
    return startAutoSync({ client, userId })
  }, [userId])

  if (pending === 0 && failed === 0) return null
  // ServiceStatusBanner owns this slot while the backend is down/offline/just recovered.
  if (service.state !== 'ok' || service.recovered) return null

  if (failed > 0) {
    return (
      <div className={`${styles.banner} ${styles.bad}`} role="status" aria-live="polite">
        <p className={styles.title}>
          {failed} saved change{failed === 1 ? '' : 's'} could not be uploaded
        </p>
        <p className={styles.detail}>The server refused {failed === 1 ? 'it' : 'them'}. Please enter {failed === 1 ? 'it' : 'them'} again or contact your school admin.</p>
      </div>
    )
  }

  return (
    <div className={`${styles.banner} ${styles.warn}`} role="status" aria-live="polite">
      <p className={styles.title}>
        {pending} change{pending === 1 ? '' : 's'} waiting to upload
      </p>
      <p className={styles.detail}>Saved on this device. {pending === 1 ? 'It' : 'They'} will upload automatically.</p>
    </div>
  )
}
