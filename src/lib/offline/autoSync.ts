// src/lib/offline/autoSync.ts
// CLIENT ONLY. Decides WHEN to flush the outbox. Reuses the connectivity signal
// SchoolOS already has (src/lib/serviceStatus.ts) instead of a second detector.
//
// Triggers: on start, when the service flips back to 'ok', when the tab becomes
// visible, and every 30s as a safety net. Never while the service is known to be
// down/offline (no hammering). Resume triggers wait a random 0-3s first so a
// whole school coming back online does not hit the database in the same second.

import { getSnapshot, subscribe } from '@/lib/serviceStatus'
import { flushOutbox, type FlushResult, type SyncClient } from './syncEngine'

export interface AutoSyncOptions {
  client: SyncClient
  userId: string
  /** Called after a flush that sent or failed something, so screens can refresh. */
  onFlushed?: (result: FlushResult) => void
  resumeJitterMs?: number
  intervalMs?: number
}

export function startAutoSync(opts: AutoSyncOptions): () => void {
  const { client, userId, onFlushed } = opts
  const jitter = opts.resumeJitterMs ?? 3_000
  const intervalMs = opts.intervalMs ?? 30_000
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | null = null

  async function run() {
    if (stopped) return
    if (getSnapshot().state !== 'ok') return
    try {
      const result = await flushOutbox(client, userId)
      if (!stopped && (result.sent > 0 || result.failed > 0)) onFlushed?.(result)
    } catch (err) {
      // Storage unavailable or similar: offline mode degrades, the app does not.
      console.warn('[offline] flush failed', err)
    }
  }

  function runSoon() {
    if (stopped) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      void run()
    }, Math.random() * jitter)
  }

  let previous = getSnapshot().state
  const unsubscribe = subscribe(() => {
    const current = getSnapshot().state
    if (current === 'ok' && previous !== 'ok') runSoon()
    previous = current
  })

  const onVisible = () => {
    if (document.visibilityState === 'visible') runSoon()
  }
  document.addEventListener('visibilitychange', onVisible)

  const interval = setInterval(() => {
    if (document.visibilityState !== 'hidden') void run()
  }, intervalMs)

  runSoon()

  return () => {
    stopped = true
    if (timer) clearTimeout(timer)
    clearInterval(interval)
    unsubscribe()
    document.removeEventListener('visibilitychange', onVisible)
  }
}
