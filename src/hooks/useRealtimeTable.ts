/**
 * useRealtimeTable.ts
 *
 * A generic Supabase Realtime hook for SchoolOS.
 *
 * Drop it into any Client component that holds a list of rows.
 * It subscribes to INSERT / UPDATE / DELETE events on a given table
 * and keeps local state in sync automatically -- no manual refresh needed.
 *
 * Usage:
 *
 *   const [rows, setRows] = useRealtimeTable<MyRow>({
 *     table:     'announcements',
 *     filter:    `school_id=eq.${schoolId}`,   // optional Supabase filter string
 *     initial:   propAnnouncements,            // data from server component
 *     orderBy:   (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
 *   })
 *
 * The hook returns [rows, setRows] so you can still do optimistic local
 * mutations (delete, update) the same way you did before.
 *
 * Requirements:
 *   - Supabase Realtime must be enabled for the table in the Supabase dashboard
 *     (Database > Replication > enable for table).
 *   - Row-level security must allow SELECT for the authenticated user.
 */

'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Options<T extends { id: string }> {
  /** Supabase table name, e.g. 'announcements' */
  table: string
  /** Optional Supabase realtime filter, e.g. 'school_id=eq.abc123' */
  filter?: string
  /** Initial rows passed down from the server component via props */
  initial: T[]
  /**
   * Optional sort comparator applied after every INSERT/UPDATE.
   * Defaults to newest-first by created_at if the rows have that field.
   */
  orderBy?: (a: T, b: T) => number
}

/**
 * Returns [rows, setRows].
 *
 * `rows`    — always up-to-date list, auto-synced with Supabase Realtime.
 * `setRows` — escape hatch for local optimistic updates (deletes, etc.).
 */
export function useRealtimeTable<T extends { id: string }>({
  table,
  filter,
  initial,
  orderBy,
}: Options<T>): [T[], React.Dispatch<React.SetStateAction<T[]>>] {
  const [rows, setRows] = useState<T[]>(initial)
  // Keep a stable ref so the subscription closure always has fresh rows
  const rowsRef = useRef<T[]>(initial)
  rowsRef.current = rows

  useEffect(() => {
    const supabase = createClient()

    // Build channel name: unique per table + filter so multiple instances
    // on the same page don't collide.
    const channelName = filter
      ? `rt:${table}:${filter}`
      : `rt:${table}`

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',             // INSERT | UPDATE | DELETE
          schema: 'public',
          table,
          ...(filter ? { filter } : {}),
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newRow = payload.new as T
            setRows((prev) => {
              // Avoid duplicate if an optimistic insert already added it
              if (prev.some((r) => r.id === newRow.id)) return prev
              const next = [newRow, ...prev]
              return orderBy ? [...next].sort(orderBy) : next
            })
          }

          if (payload.eventType === 'UPDATE') {
            const updated = payload.new as T
            setRows((prev) => {
              const next = prev.map((r) => (r.id === updated.id ? updated : r))
              return orderBy ? [...next].sort(orderBy) : next
            })
          }

          if (payload.eventType === 'DELETE') {
            const deleted = payload.old as { id: string }
            setRows((prev) => prev.filter((r) => r.id !== deleted.id))
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  // Re-subscribe only if the table or filter changes (almost never)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, filter])

  return [rows, setRows]
}
