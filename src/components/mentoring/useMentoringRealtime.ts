'use client'
// src/components/mentoring/useMentoringRealtime.ts
// Re-runs `onChange` (debounced) whenever a mentoring table changes. Supabase realtime applies the
// tables' SELECT policies per subscriber, so each person only hears about rows they may read.

import { useEffect, useRef } from 'react'
import type { createClient } from '@/lib/supabase/client'

const TABLES = ['mentors', 'mentoring_requests', 'mentoring_pairings', 'mentoring_sessions', 'mentoring_reports']

export function useMentoringRealtime(supabase: ReturnType<typeof createClient>, onChange: () => void) {
  const cb = useRef(onChange)
  useEffect(() => { cb.current = onChange }, [onChange])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const bump = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => cb.current(), 400)
    }
    let channel = supabase.channel(`mentoring-${Math.random().toString(36).slice(2)}`)
    TABLES.forEach(table => {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, bump)
    })
    channel.subscribe()
    return () => {
      if (timer) clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  }, [supabase])
}
