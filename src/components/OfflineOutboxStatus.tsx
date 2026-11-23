'use client'
// src/components/OfflineOutboxStatus.tsx
//
// Mounted once for every signed-in dashboard page (see app/dashboard/layout.tsx).
// Does two jobs:
//  1. Sends anything queued while the phone was offline (chat messages,
//     attendance registers, "mark as read") - when the app opens, when the
//     connection returns, when the app comes back to the front, and once a
//     minute while something is still waiting.
//  2. Shows a small note while something is waiting, and tells the person if
//     the server refused something, so nothing is ever lost silently.
// Renders nothing when the queue is empty.

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  flushOutbox, pendingCount, listFailed, discardFailed, OUTBOX_EVENT,
} from '@/lib/offlineOutbox'

const RETRY_EVERY_MS = 60_000

export default function OfflineOutboxStatus() {
  const [supabase] = useState(() => createClient())
  const [userId,  setUserId]  = useState<string | null>(null)
  const [pending, setPending] = useState(0)
  const [failed,  setFailed]  = useState<{ count: number; reason: string }>({ count: 0, reason: '' })

  useEffect(() => {
    let cancelled = false
    // Reads the session saved on the phone (no network call), the same way
    // app/dashboard/layout.tsx does. The queue itself only ever sends for the
    // user who queued it.
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setUserId(data.session?.user?.id ?? null)
    })
    return () => { cancelled = true }
  }, [supabase])

  const refresh = useCallback(async () => {
    if (!userId) return
    const [n, bad] = await Promise.all([pendingCount(userId), listFailed(userId)])
    setPending(n)
    setFailed({ count: bad.length, reason: bad[0]?.failedReason ?? '' })
  }, [userId])

  useEffect(() => {
    if (!userId) return
    let cancelled = false

    async function flush() {
      await flushOutbox(supabase, userId!)
      if (!cancelled) refresh()
    }
    const onVisible = () => { if (document.visibilityState === 'visible') flush() }

    flush()
    window.addEventListener('online', flush)
    window.addEventListener(OUTBOX_EVENT, refresh)
    document.addEventListener('visibilitychange', onVisible)
    const timer = setInterval(() => { if (pending > 0) flush() }, RETRY_EVERY_MS)

    return () => {
      cancelled = true
      window.removeEventListener('online', flush)
      window.removeEventListener(OUTBOX_EVENT, refresh)
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(timer)
    }
  }, [supabase, userId, refresh, pending])

  if (!userId || (pending === 0 && failed.count === 0)) return null

  const box: React.CSSProperties = {
    position: 'fixed',
    left: 12, right: 12,
    bottom: 'calc(84px + env(safe-area-inset-bottom, 0px))',
    zIndex: 60,
    maxWidth: 420,
    margin: '0 auto',
    padding: '10px 14px',
    borderRadius: 10,
    background: 'var(--bg-base, #fff)',
    color: 'var(--text-primary, #111)',
    border: '1px solid var(--border, rgba(128,128,128,0.35))',
    fontSize: '0.8rem',
    lineHeight: 1.4,
  }

  return (
    <div role="status" aria-live="polite" style={{ display: 'contents' }}>
      {pending > 0 && (
        <div style={{ ...box, borderColor: 'var(--warning, #f59e0b)' }}>
          {pending} {pending === 1 ? 'item is' : 'items are'} saved on this phone and will be sent when you are back online.
        </div>
      )}
      {failed.count > 0 && (
        <div style={{ ...box, borderColor: 'var(--danger, #ef4444)', bottom: pending > 0 ? 'calc(144px + env(safe-area-inset-bottom, 0px))' : box.bottom }}>
          <p style={{ margin: 0 }}>
            {failed.count} {failed.count === 1 ? 'item' : 'items'} could not be sent: the server refused {failed.count === 1 ? 'it' : 'them'}
            {failed.reason ? ` (${failed.reason})` : ''}.
          </p>
          <button
            type="button"
            onClick={async () => { await discardFailed(userId); refresh() }}
            style={{ marginTop: 6, background: 'none', border: 'none', padding: 0, color: 'var(--danger, #ef4444)', fontWeight: 600, cursor: 'pointer' }}
          >
            Discard
          </button>
        </div>
      )}
    </div>
  )
}
