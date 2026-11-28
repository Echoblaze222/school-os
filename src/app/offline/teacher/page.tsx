'use client'
// src/app/offline/teacher/page.tsx
// Offline twin of /dashboard/teacher (the teacher Home screen). It renders the very
// same TeacherDashboardClient as the online page, so it looks identical and carries
// the school's own brand; only the data comes from the phone instead of the server.
// Lives under /offline/ so it stays public in src/middleware.ts. Holds no user data.

import OfflineHomeTwin from '@/components/offline/OfflineHomeTwin'
import TeacherDashboardClient from '@/app/dashboard/teacher/TeacherDashboardClient'
import type { TeacherHomeProps } from '@/app/dashboard/teacher/homeProps'

export default function OfflineTeacherHomePage() {
  return (
    <OfflineHomeTwin<TeacherHomeProps> role="teacher">
      {({ userId, profile, school, saved }) => (
        <TeacherDashboardClient
          profile={profile}
          school={school}
          userId={userId}
          counts={saved.counts}
          activities={[]}
          examAppointmentLabel={saved.examAppointmentLabel}
        />
      )}
    </OfflineHomeTwin>
  )
}
