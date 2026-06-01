'use client'
// components/RolePageWrapper.tsx
// Shared layout used by every role sub-page.
// Handles: sidebar nav, header, trial banner, page body.

import DashboardHeader from './DashboardHeader'
import RoleNav from './RoleNav'
import TrialBanner from './TrialBanner'
import styles from './RolePageWrapper.module.css'

interface Props {
  userId:      string
  role:        string
  profile:     any
  school:      any
  title:       string
  showBack?:   boolean
  children:    React.ReactNode
}

export default function RolePageWrapper({
  userId, role, profile, school, title, showBack = true, children,
}: Props) {
  const schoolColor = school?.primary_color ?? '#7C3AED'

  return (
    <div className={styles.shell}>
      {/* Sidebar (desktop) + mobile bottom nav */}
      <RoleNav
        userId={userId}
        profile={profile}
        school={school}
        role={role}
        schoolColor={schoolColor}
      />

      {/* Main content — offset from sidebar on desktop */}
      <div className={styles.content}>
        <DashboardHeader
          userId={userId}
          role={role}
          profile={profile}
          school={school}
          schoolColor={schoolColor}
          title={title}
          showBack={showBack}
        />

        {school?.setup_status === 'trial' && school?.trial_ends_at && (
          <TrialBanner
            trialEndsAt={school.trial_ends_at}
            schoolId={school.id}
            setupStatus={school.setup_status}
            schoolColor={schoolColor}
          />
        )}

        <main className={styles.main}>
          {children}
        </main>
      </div>
    </div>
  )
}
