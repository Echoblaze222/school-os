'use client'
// components/RoleSubHeader.tsx
// The RoleHeroHeader's sibling for every page that ISN'T the dashboard
// home screen. Same gradient band, crest, and icon-button language, just
// compact: a back button + page title instead of the big greeting/headline
// block. Pairs with BottomDock for nav (all sub-pages already get that
// automatically once they're wrapped here, so the old sidebar/RoleNav is
// no longer needed on any page using this).
//
// Usage:
//   <RoleSubHeader userId={userId} role="parent" profile={profile} school={school}
//     title="Fees" featureGroups={FEATURE_GROUPS} homeHref="/dashboard/parent" aiHref="/dashboard/parent/ai">
//     {page content}
//   </RoleSubHeader>

import Link from 'next/link'
import NotificationsBell from './NotificationsBell'
import AllFeaturesSheet, { FeatureGroup } from './AllFeaturesSheet'
import BottomDock from './BottomDock'
import { SunIcon, MoonIcon, UserIcon, ArrowLeftIcon } from './Icons'
import { useTheme } from '@/hooks/useTheme'
import { ripple } from '@/lib/ripple'
import motion from './dashboard-motion.module.css'
import styles from './RoleSubHeader.module.css'

interface Props {
  userId:        string
  role:          string
  profile:       any
  school:        any
  title:         string
  backHref?:     string          // defaults to the role's dashboard home
  featureGroups: FeatureGroup[]
  homeHref?:     string          // for BottomDock - defaults to the role's dashboard home
  aiHref?:       string          // for BottomDock - defaults to `${role}/ai`
  hideDock?:     boolean         // opt out of the floating dock (rare - e.g. a page that already has heavy fixed UI of its own)
  children:      React.ReactNode
}

export default function RoleSubHeader({
  userId, role, profile, school, title, backHref, featureGroups,
  homeHref, aiHref, hideDock = false, children,
}: Props) {
  const { theme, toggleTheme } = useTheme()
  const initials = (school?.name ?? 'S').slice(0, 2).toUpperCase()
  const resolvedHome = homeHref ?? `/dashboard/${role}`
  const resolvedBack = backHref ?? resolvedHome
  const resolvedAi   = aiHref ?? `/dashboard/${role}/ai`

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.frame}>
          <div className={styles.topRow}>
            <div className={styles.brand}>
              <Link
                href={resolvedBack}
                className={`${styles.backBtn} ${motion.rippleHost} ${motion.focusable}`}
                title="Back"
                aria-label="Back"
                onMouseDown={ripple(motion)}
              >
                <ArrowLeftIcon size={17} />
              </Link>
              <div className={styles.crest}>
                {school?.logo_url
                  ? <img src={school.logo_url} alt="" className={styles.crestImg} />
                  : initials}
              </div>
              <div className={styles.titleBlock}>
                <div className={styles.title}>{title}</div>
                <div className={styles.sub}>{school?.name ?? 'Your school'}</div>
              </div>
            </div>

            <div className={styles.controls}>
              <button
                className={`${styles.iconBtn} ${motion.rippleHost} ${motion.focusable}`}
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
                className={`${styles.avatarBtn} ${motion.focusable}`}
                title="Account"
                aria-label="Account"
              >
                {profile?.avatar_url
                  ? <img src={profile.avatar_url} alt="" className={styles.avatarImg} />
                  : <UserIcon size={18} />}
              </Link>

              <AllFeaturesSheet groups={featureGroups} role={role} />
            </div>
          </div>
        </div>
      </header>

      <main className={styles.main}>
        {children}
      </main>

      {!hideDock && <BottomDock aiHref={resolvedAi} groups={featureGroups} role={role} />}
    </div>
  )
}
