'use client'
// src/app/dashboard/layout.tsx
// Wraps all authenticated role dashboards with the auto-lock system:
// after a configurable period of inactivity, the app locks (password
// required to resume) instead of signing out - see useAutoLock.ts for
// why. Reads the user's own auto_lock_enabled/auto_lock_minutes
// preference from profiles (editable in each role's Settings page via
// <AutoLockSettings/>) and falls back to the column defaults
// (enabled, 10 minutes) while that fetch is in flight or if it fails.

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAutoLock } from '@/lib/useAutoLock'
import LockScreen from '@/components/auth/LockScreen'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState({ enabled: true, minutes: 10 })

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return
      const { data: profile } = await supabase
        .from('profiles')
        .select('auto_lock_enabled, auto_lock_minutes')
        .eq('id', data.user.id)
        .maybeSingle()
      if (profile) {
        setPrefs({
          enabled: profile.auto_lock_enabled ?? true,
          minutes: profile.auto_lock_minutes ?? 10,
        })
      }
    })
  }, [])

  const { locked, unlock } = useAutoLock(prefs)

  return (
    <>
      {children}
      {locked && <LockScreen onUnlock={unlock} />}
    </>
  )
}
