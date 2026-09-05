// src/hooks/useRealtimeNotifications.ts
//
// Shared realtime subscription for the `notifications` table, used by both
// NotificationsBell and the per-role notifications page. Unlike a bare
// `.channel().on(...).subscribe()` call, this tracks connection status and
// calls `onReconnect` after a dropped connection recovers, so callers can
// refetch anything that might have been missed while disconnected instead
// of silently going stale.
'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

export type RealtimeConnectionStatus = 'connecting' | 'connected' | 'disconnected'

interface UseRealtimeNotificationsOptions {
  userId: string
  onInsert: (row: any) => void
  /** Called once after a dropped connection reconnects — use it to refetch. */
  onReconnect?: () => void
}

export function useRealtimeNotifications({
  userId,
  onInsert,
  onReconnect,
}: UseRealtimeNotificationsOptions) {
  const [status, setStatus] = useState<RealtimeConnectionStatus>('connecting')
  const channelRef = useRef<RealtimeChannel | null>(null)
  const wasDisconnected = useRef(false)

  // Keep the latest callbacks without re-subscribing the channel every render.
  const onInsertRef = useRef(onInsert)
  const onReconnectRef = useRef(onReconnect)
  onInsertRef.current = onInsert
  onReconnectRef.current = onReconnect

  useEffect(() => {
    if (!userId) return
    const supabase = createClient()

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      }, (payload) => onInsertRef.current(payload.new))
      .subscribe((s) => {
        if (s === 'SUBSCRIBED') {
          setStatus('connected')
          if (wasDisconnected.current) {
            wasDisconnected.current = false
            onReconnectRef.current?.()
          }
        } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') {
          setStatus('disconnected')
          wasDisconnected.current = true
        }
      })

    channelRef.current = channel

    // The Supabase client reconnects its websocket on its own, but a tab
    // that was backgrounded/offline for a while benefits from an explicit
    // nudge to refetch as soon as the browser reports it's back online.
    function handleOnline() {
      if (wasDisconnected.current) {
        wasDisconnected.current = false
        onReconnectRef.current?.()
      }
    }
    window.addEventListener('online', handleOnline)

    return () => {
      window.removeEventListener('online', handleOnline)
      supabase.removeChannel(channel)
    }
  }, [userId])

  return { status }
}
