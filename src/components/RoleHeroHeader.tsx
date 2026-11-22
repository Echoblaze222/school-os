'use client'
// components/RoleHeroHeader.tsx
// Generic glass header for any role's dashboard home screen. Reuses the
// app's real NotificationsBell rather than re-implementing it. Principal's
// page now uses this too (see below).
//
// Mobile: rounded glass card with school + role, search, notifications and a
// three-line menu button that opens the same glass drawer as the bottom dock.
// Theme and account live in that drawer.
// On desktop (1024px and up) the card becomes a quiet greeting area on the
// page surface and DesktopShell supplies the sidebar.

import Link from 'next/link'
import Image from 'next/image'
import NotificationsBell from './NotificationsBell'
import type { FeatureGroup } from './AllFeaturesSheet'
import GlassMenuButton from './GlassMenuButton'
import DesktopShell from './DesktopShell'
import GlobalSearchOverlay from './GlobalSearchOverlay'
import RoleHomeCharts from './analytics/RoleHomeCharts'
import { TagIcon } from './Icons'
import { ripple } from '@/lib/ripple'
import motion from './dashboard-motion.module.css'
import styles from './RoleHeroHeader.module.css'

interface Props {
  userId:      string
  role:        string           // 'principal' | 'teacher' | 'secretary' | 'bursar' | 'parent' | 'student'
  roleLabel:   string            // e.g. "Class Teacher", "Front Desk", "Bursary"
  profile:     any
  school:      any
  greeting:    string
  headline:    string
  sub:         string
  featureGroups: FeatureGroup[]
  showBranding?: boolean         // only the Principal edits branding — others just see the school's
}

export default function RoleHeroHeader({
  userId, role, roleLabel, profile, school, greeting, headline, sub, featureGroups,
  showBranding = false,
}: Props) {
  const initials = (school?.name ?? 'S').slice(0, 2).toUpperCase()

  return (
    <>
    <DesktopShell home role={role} profile={profile} school={school} featureGroups={featureGroups} />
    <header className={styles.hero}>
      <div className={styles.frame}>
        <div className={styles.topRow}>
          <div className={styles.brand}>
            <div className={styles.crest}>
              {school?.logo_url
                ? <Image src={school.logo_url} alt="" width={42} height={42} className={styles.crestImg} />
                : initials}
            </div>
            <div>
              <div className={styles.name}>{school?.name ?? 'Your school'}</div>
              <div className={styles.sub}>{roleLabel}</div>
            </div>
          </div>

          <div className={styles.controls}>
            {showBranding && (
              <Link
                href="/dashboard/principal/settings"
                className={`${styles.iconBtn} ${motion.rippleHost} ${motion.focusable}`}
                title="School branding"
                aria-label="School branding"
                onMouseDown={ripple(motion)}
              >
                <TagIcon size={17} />
              </Link>
            )}

            <GlobalSearchOverlay triggerClassName={`${styles.iconBtn} ${styles.mobileOnly} ${motion.rippleHost} ${motion.focusable}`} />

            <NotificationsBell userId={userId} role={role} />

            <span className={styles.mobileOnly}>
              <GlassMenuButton
                className={styles.menuBtn}
                role={role}
                groups={featureGroups}
                aiHref={`/dashboard/${role}/ai`}
                homeHref={`/dashboard/${role}`}
                profile={profile}
                school={school}
              />
            </span>
          </div>
        </div>

        <div className={`${styles.headline} ${motion.riseIn}`}>
          <div className={styles.eyebrow}>{greeting}</div>
          <h1>{headline}</h1>
          <p>{sub}</p>
        </div>
      </div>
    </header>
    {/* Principal renders its own richer block inside its page. */}
    {role !== 'principal' && <RoleHomeCharts role={role} />}
    </>
  )
}
