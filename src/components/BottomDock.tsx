'use client'
// components/BottomDock.tsx
// Floating glass control used on every dashboard page - the home screens
// and every sub-page (RoleSubHeader): Menu (opens the glass sidebar drawer)
// and AI (the role's AI Insights page).
//
// On desktop (1024px and up) the DesktopShell sidebar takes over this job;
// the data-mobile-dock attribute is the hook desktop-shell.css uses to hide it.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { GridIcon, SparklesIcon } from './Icons'
import { ripple } from '@/lib/ripple'
import motion from './dashboard-motion.module.css'
import styles from './BottomDock.module.css'
import { FeatureGroup } from './AllFeaturesSheet'
import MobileGlassNav from './MobileGlassNav'

interface Props {
  aiHref: string
  groups: FeatureGroup[]
  role:   string
  /** Optional. When omitted the drawer reads identity published by DesktopShell. */
  profile?:  any
  school?:   any
  homeHref?: string
}

export default function BottomDock({ aiHref, groups, role, profile, school, homeHref }: Props) {
  const pathname = usePathname()
  const onAi = pathname === aiHref
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <>
      <div className={styles.dock} data-mobile-dock>
        <button
          className={`${styles.btn} ${motion.rippleHost} ${motion.focusable}`}
          onClick={() => setMenuOpen(true)}
          onMouseDown={ripple(motion)}
          aria-label="Menu: all features"
        >
          <GridIcon size={17} />
          Menu
        </button>
        <div className={styles.divider} />
        <Link
          href={aiHref}
          className={`${styles.btn} ${onAi ? styles.active : ''} ${motion.rippleHost} ${motion.focusable}`}
          onMouseDown={ripple(motion)}
          aria-label="AI Insights"
        >
          <SparklesIcon size={17} />
          AI
        </Link>
      </div>

      {menuOpen && (
        <MobileGlassNav
          role={role}
          groups={groups}
          aiHref={aiHref}
          homeHref={homeHref}
          profile={profile}
          school={school}
          onClose={() => setMenuOpen(false)}
        />
      )}
    </>
  )
}
