'use client'
// src/app/offline/teacher/attendance/page.tsx
// Offline twin of /dashboard/teacher/attendance. Lives under /offline/ on purpose:
// that path is already public in src/middleware.ts, so the service worker can
// precache it without being redirected to /login, and no middleware change (and
// no change to any access rule) is needed.
//
// This page holds no user data. It is served by public/sw.js only when opening
// the real page fails because there is no network, and rebuilds everything from
// what is saved on the phone (see OfflineShell).
//
// ?warm=1 is used by useOfflineReady to load this page once in a hidden frame
// while online so its scripts get cached; in that mode nothing renders.

import { useEffect, useState } from 'react'
import OfflineShell from '@/components/offline/OfflineShell'
import AttendanceClient from '@/app/dashboard/teacher/attendance/AttendanceClient'

export default function OfflineTeacherAttendancePage() {
  const [mode, setMode] = useState<'pending' | 'warm' | 'app'>('pending')

  useEffect(() => {
    setMode(new URLSearchParams(window.location.search).has('warm') ? 'warm' : 'app')
  }, [])

  if (mode !== 'app') return null

  return (
    <OfflineShell role="teacher">
      {({ userId, profile, school }) => <AttendanceClient profile={profile} school={school} userId={userId} />}
    </OfflineShell>
  )
}
