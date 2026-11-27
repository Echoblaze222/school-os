'use client'
// src/hooks/useRealtimePull.ts
// Bridges Supabase Realtime to the local copy: when someone changes announcements, classes,
// class assignments or results at this school, pull just that table (debounced), so the phone
// stays current without refetching whole screens. Does nothing while the read sync is off,
// offline, or the backend is down (the periodic pull in autoSync is the safety net).
//
// Realtime cannot filter DELETE events, so deletions are not applied here; they arrive with
// the next periodic pullAll through the sync_deletions tombstones.

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getSnapshot } from '@/lib/serviceStatus'
import { readSyncEnabled } from '@/lib/offline/flags'
import { pullTable } from '@/lib/offline/pullSync'
import { createPullScheduler } from '@/lib/offline/realtimePull'
import { REALTIME_SYNC_TABLES, SYNC_TABLES } from '@/lib/offline/syncTables'

export function useRealtimePull(opts: { userId: string | null; schoolId: string | null; role?: string | null }) {
  const { userId, schoolId, role } = opts

  useEffect(() => {
    if (!readSyncEnabled() || !userId || !schoolId) return
    const supabase = createClient()

    const scheduler = createPullScheduler({
      canPull: () => getSnapshot().state === 'ok',
      pull: async (tables) => {
        for (const name of tables) {
          const cfg = SYNC_TABLES.find((c) => c.table === name)
          if (cfg) await pullTable(supabase, userId, cfg, { role })
        }
      },
    })

    let channel = supabase.channel(`offline-pull:${schoolId}`)
    for (const table of REALTIME_SYNC_TABLES) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `school_id=eq.${schoolId}` },
        () => scheduler.notify(table),
      )
    }
    channel.subscribe()

    return () => {
      scheduler.stop()
      void supabase.removeChannel(channel)
    }
  }, [userId, schoolId, role])
}
