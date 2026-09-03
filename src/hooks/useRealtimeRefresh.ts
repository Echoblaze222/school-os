/**
 * useRealtimeRefresh.ts
 *
 * Companion to useRealtimeTable for screens where useRealtimeTable
 * doesn't fit: when the data on screen comes from an API route that
 * joins/computes across tables (e.g. hostel_incidents joined with
 * profiles for the student's name), a raw postgres_changes payload
 * only contains that one table's columns - merging it directly into
 * state the way useRealtimeTable does would silently drop the joined
 * fields. This hook sidesteps that by not trying to merge payloads at
 * all: it just re-runs your existing `load()` (debounced) whenever any
 * row changes on the given table(s), so a second concurrent user sees
 * the change without a manual reload, without duplicating the API's
 * join logic on the client.
 *
 * Usage:
 *
 *   useRealtimeRefresh({
 *     tables: ['hostel_incidents'],
 *     filter: hostelId ? `hostel_id=eq.${hostelId}` : undefined,
 *     onChange: load,
 *   })
 *
 * Requirements (same as useRealtimeTable):
 *   - The table(s) must be added to the supabase_realtime publication.
 *   - RLS must allow SELECT for the authenticated user - Realtime
 *     evaluates that policy per subscriber, so this never exposes a
 *     row the user couldn't already read via a normal query.
 */

'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Options {
  /** One or more Supabase table names to watch. Pass [] to skip subscribing entirely. */
  tables: string[]
  /** Optional Supabase realtime filter, applied to every table watched. */
  filter?: string
  /** Called (debounced) after any INSERT/UPDATE/DELETE on any watched table. */
  onChange: () => void
  /** Debounce window in ms, so one user action that touches two tables (e.g. a
   *  request row + its audit-log row) triggers one refetch, not two. Default 400. */
  debounceMs?: number
}

export function useRealtimeRefresh({ tables, filter, onChange, debounceMs = 400 }: Options) {
  // Keep a stable ref so the subscription closure always calls the latest load()
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const tableKey = tables.join(',')

  useEffect(() => {
    if (tables.length === 0) return

    const supabase = createClient()
    const channelName = `rt-refresh:${tableKey}${filter ? `:${filter}` : ''}`
    const channel = supabase.channel(channelName)

    let timer: ReturnType<typeof setTimeout> | null = null
    const trigger = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => onChangeRef.current(), debounceMs)
    }

    for (const table of tables) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) },
        trigger,
      )
    }
    channel.subscribe()

    return () => {
      if (timer) clearTimeout(timer)
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableKey, filter])
}
