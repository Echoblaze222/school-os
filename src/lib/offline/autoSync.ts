// src/lib/offline/autoSync.ts
// CLIENT ONLY. Decides WHEN to flush the outbox. Reuses the connectivity signal
// SchoolOS already has (src/lib/serviceStatus.ts) instead of a second detector.
//
// Triggers: on start, when the service flips back to 'ok', when the tab becomes
// visible, and every 30s as a safety net. Never while the service is known to be
// down/offline (no hammering). Resume triggers wait a random 0-3s first so a
// whole school coming back online does not hit the database in the same second.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getSnapshot, subscribe } from '@/lib/serviceStatus'
import { flushOutbox, type FlushResult, type SyncClient } from './syncEngine'
import { loadIdentity } from './identity'
import { pullAll, type PullAllResult } from './pullSync'
import { requestPersistentStorage } from './storage'

export interface AutoSyncOptions {
  client: SyncClient
  userId: string
  /** Called after a flush that sent or failed something, so screens can refresh. */
  onFlushed?: (result: FlushResult) => void
  resumeJitterMs?: number
  intervalMs?: number
  /**
   * Read side. Pass a Supabase client to also keep the local copy current. Leave it out
   * (the default) and nothing is pulled: see flags.ts, the feature ships dark.
   */
  pullClient?: SupabaseClient
  /** Called after a pull that brought new rows or applied deletions, so screens can refresh. */
  onPulled?: (result: PullAllResult) => void
}

/** At most one full pass this often (a pass with nothing new is a handful of tiny requests). */
export const PULL_MIN_INTERVAL_MS = 5 * 60_000
/** After a failed pass (for example the migration is missing), stay quiet this long. */
export const PULL_ERROR_COOLDOWN_MS = 30 * 60_000

export function startAutoSync(opts: AutoSyncOptions): () => void {
  const { client, userId, onFlushed } = opts
  const jitter = opts.resumeJitterMs ?? 3_000
  const intervalMs = opts.intervalMs ?? 30_000
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let lastPullAt = 0
  let pullBlockedUntil = 0

  async function maybePull() {
    if (!opts.pullClient || stopped) return
    const now = Date.now()
    if (now - lastPullAt < PULL_MIN_INTERVAL_MS || now < pullBlockedUntil) return
    lastPullAt = now
    try {
      // The role only narrows what is copied (see profileScope); unknown = self-only.
      const role = (await loadIdentity(userId))?.profile?.role ?? null
      const result = await pullAll(opts.pullClient, userId, { role })
      if (result.stopped === 'schema' || result.stopped === 'error') {
        pullBlockedUntil = Date.now() + PULL_ERROR_COOLDOWN_MS
      }
      if (!stopped && (result.deleted > 0 || result.tables.some((t) => t.upserted > 0))) opts.onPulled?.(result)
    } catch (err) {
      pullBlockedUntil = Date.now() + PULL_ERROR_COOLDOWN_MS
      console.warn('[offline] pull failed', err)
    }
  }

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
    // Upload first, then download, so a pull never overwrites a change that is still queued.
    await maybePull()
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

  // Ask the browser not to evict the local copy and the outbox under storage pressure.
  void requestPersistentStorage()

  runSoon()

  return () => {
    stopped = true
    if (timer) clearTimeout(timer)
    clearInterval(interval)
    unsubscribe()
    document.removeEventListener('visibilitychange', onVisible)
  }
}
