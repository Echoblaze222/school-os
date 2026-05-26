'use client'
// components/RolePageWrapper.tsx
// Shared layout used by every role sub-page.
// Handles: sidebar nav, header, trial banner, page body.

import DashboardHeader from './DashboardHeader'
import RoleNav from './RoleNav'
import TrialBanner from './TrialBanner'

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
    <div style={{ display:'flex', minHeight:'100dvh', background:'var(--bg-base)' }}>
      {/* Sidebar + mobile bottom nav */}
      <RoleNav userId={userId} profile={profile} school={school} role={role} schoolColor={schoolColor} />

      {/* Main content */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0, marginLeft:'var(--sidebar-width)' }}
        className="role-content">
        <DashboardHeader
          userId={userId} role={role}
          profile={profile} school={school}
          schoolColor={schoolColor}
          title={title} showBack={showBack}
        />

        {school?.setup_status === 'trial' && school?.trial_ends_at && (
          <TrialBanner
            trialEndsAt={school.trial_ends_at}
            schoolId={school.id}
            setupStatus={school.setup_status}
            schoolColor={schoolColor}
          />
        )}

        <main style={{ padding:'var(--space-6) var(--space-5)', maxWidth:900, margin:'0 auto', width:'100%' }}>
          {children}
        </main>
      </div>

      <style>{`
        @media (max-width: 1023px) {
          .role-content { margin-left: 0 !important; }
        }
      `}</style>
    </div>
  )
}
