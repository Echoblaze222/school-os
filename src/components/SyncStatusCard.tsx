'use client'
// src/components/SyncStatusCard.tsx
// "Offline & sync" status for a settings page: what is saved on this phone and how old it
// is, changes waiting to upload, changes the server refused (with Retry / Discard), whether
// the browser will keep the data, and a Sync now button. Mount it in any dashboard's
// settings screen: <SyncStatusCard userId={userId} role={profile.role} />.
//
// Wording is plain on purpose: this is read by teachers on a bad connection.

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { discardItem, listOutbox, retryFailedItem } from '@/lib/offline/outbox'
import { flushOutbox, type SyncClient } from '@/lib/offline/syncEngine'
import { pullAll } from '@/lib/offline/pullSync'
import { readSyncEnabled } from '@/lib/offline/flags'
import { requestPersistentStorage } from '@/lib/offline/storage'
import type { OutboxItem } from '@/lib/offline/db'
import { useSyncStatus } from '@/hooks/useSyncStatus'
import styles from './SyncStatusCard.module.css'

function ago(ms: number | null): string {
  if (!ms) return 'never'
  const mins = Math.round((Date.now() - ms) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 48) return `${hours} h ago`
  return `${Math.round(hours / 24)} days ago`
}

const SERVICE_TEXT: Record<string, string> = {
  ok: 'Connected',
  offline: 'No connection',
  degraded: 'Connection is slow',
  down: 'SchoolOS is unreachable right now',
}

export default function SyncStatusCard({ userId, role }: { userId: string; role?: string | null }) {
  const status = useSyncStatus(userId)
  const [failedItems, setFailedItems] = useState<OutboxItem[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [persistent, setPersistent] = useState<boolean | null>(null)

  const loadFailed = useCallback(async () => {
    try {
      setFailedItems(await listOutbox(userId, 'failed'))
    } catch {
      setFailedItems([])
    }
  }, [userId])

  useEffect(() => {
    // Loading from local storage on mount / when the failed count changes is a legitimate effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadFailed()
  }, [loadFailed, status.failed])

  async function syncNow() {
    setBusy(true)
    setMessage(null)
    try {
      const supabase = createClient()
      const sent = await flushOutbox(supabase as unknown as SyncClient, userId)
      let note = sent.sent > 0 ? `Uploaded ${sent.sent} change${sent.sent === 1 ? '' : 's'}. ` : ''
      if (readSyncEnabled()) {
        const pulled = await pullAll(supabase, userId, { role })
        note += pulled.stopped === 'done' ? 'Up to date.' : pulled.stopped === 'network' ? 'No connection.' : 'Could not finish updating.'
      }
      setMessage(note || 'Nothing to do.')
    } catch {
      setMessage('Could not sync right now.')
    } finally {
      setBusy(false)
      void loadFailed()
    }
  }

  async function keepData() {
    setPersistent(await requestPersistentStorage())
  }

  const { summary, storage } = status
  const kept = persistent ?? storage?.persistent ?? false

  return (
    <section className={styles.card} aria-label="Offline and sync">
      <h3 className={styles.title}>Offline &amp; sync</h3>
      <p className={styles.row}>
        <span>Connection</span>
        <strong>{SERVICE_TEXT[status.service] ?? status.service}</strong>
      </p>
      {readSyncEnabled() && (
        <p className={styles.row}>
          <span>Saved on this phone</span>
          <strong>
            {summary && summary.tablesReady > 0
              ? `${summary.rows.toLocaleString()} records, updated ${ago(summary.lastSyncAt)}`
              : 'Nothing yet. Open the app with a connection.'}
          </strong>
        </p>
      )}
      <p className={styles.row}>
        <span>Waiting to upload</span>
        <strong>{status.pending}</strong>
      </p>

      {failedItems.length > 0 && (
        <div className={styles.failed} role="alert">
          <p className={styles.failedTitle}>
            {failedItems.length} change{failedItems.length === 1 ? '' : 's'} could not be uploaded
          </p>
          {failedItems.map((item) => (
            <div key={item.id} className={styles.failedItem}>
              <span>{item.label}</span>
              <div className={styles.actions}>
                <button type="button" onClick={() => void retryFailedItem(item.id).then(loadFailed)}>
                  Try again
                </button>
                <button type="button" onClick={() => void discardItem(item.id).then(loadFailed)}>
                  Discard
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {storage && !kept && (
        <p className={styles.note}>
          Your phone may clear offline data when it runs low on space.{' '}
          <button type="button" className={styles.link} onClick={() => void keepData()}>
            Ask to keep it
          </button>
        </p>
      )}
      {storage?.nearlyFull && <p className={styles.note}>Phone storage is almost full. Free some space so offline changes are not lost.</p>}

      <div className={styles.footer}>
        <button type="button" className={styles.primary} disabled={busy || status.service !== 'ok'} onClick={() => void syncNow()}>
          {busy ? 'Syncing...' : 'Sync now'}
        </button>
        {message && <span className={styles.message}>{message}</span>}
      </div>
    </section>
  )
}
