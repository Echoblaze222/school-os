'use client'
// components/RoleHeroHeader.tsx
// Generic chalkboard-ledger header for any role's dashboard home screen.
// Reuses the app's real NotificationsBell and useTheme rather than
// re-implementing either. Principal's page now uses this too (see below).
//
// On desktop (1024px and up) the band becomes a quiet greeting area on the
// page surface and DesktopShell supplies the sidebar. Mobile is unchanged.

import Link from 'next/link'
import Image from 'next/image'
import NotificationsBell from './NotificationsBell'
import AllFeaturesSheet, { FeatureGroup } from './AllFeaturesSheet'
import DesktopShell from './DesktopShell'
import GlobalSearchOverlay from './GlobalSearchOverlay'
import RoleHomeCharts from './analytics/RoleHomeCharts'
import { SunIcon, MoonIcon, UserIcon, TagIcon } from './Icons'
import { useTheme } from '@/hooks/useTheme'
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
  const { theme, toggleTheme } = useTheme()
  const initials = (school?.name ?? 'S').slice(0, 2).toUpperCase()

  return (
    <>
    <DesktopShell role={role} profile={profile} school={school} featureGroups={featureGroups} />
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

            <button
              className={`${styles.iconBtn} ${styles.mobileOnly} ${motion.rippleHost} ${motion.focusable}`}
              onClick={toggleTheme}
              title="Toggle dark mode"
              aria-label="Toggle dark mode"
              onMouseDown={ripple(motion)}
            >
              {theme === 'dark' ? <SunIcon size={16} /> : <MoonIcon size={16} />}
            </button>

            <NotificationsBell userId={userId} role={role} />

            <Link
              href={`/dashboard/${role}/profile`}
              className={`${styles.avatarBtn} ${styles.mobileOnly} ${motion.focusable}`}
              title="Account"
              aria-label="Account"
            >
              {profile?.avatar_url
                ? <Image src={profile.avatar_url} alt="" width={38} height={38} className={styles.avatarImg} />
                : <UserIcon size={18} />}
            </Link>

            <span className={styles.mobileOnly}>
              <AllFeaturesSheet groups={featureGroups} role={role} />
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
