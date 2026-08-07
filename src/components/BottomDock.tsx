'use client'
// components/BottomDock.tsx
// Floating control used on every dashboard page — the 6 home screens
// (RoleHeroHeader) and every sub-page (RoleSubHeader): Menu (opens the
// same "all features" sheet used in the header) and AI (the role's AI
// Insights page). Menu replaces the old Home button.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { GridIcon, SparklesIcon, XIcon } from './Icons'
import { ripple } from '@/lib/ripple'
import motion from './dashboard-motion.module.css'
import styles from './BottomDock.module.css'
import sheetStyles from './AllFeaturesSheet.module.css'
import { FeatureGroup } from './AllFeaturesSheet'

interface Props {
  aiHref: string
  groups: FeatureGroup[]
  role:   string
}

export default function BottomDock({ aiHref, groups, role }: Props) {
  const pathname = usePathname()
  const onAi = pathname === aiHref
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <>
      <div className={styles.dock}>
        <button
          className={`${styles.btn} ${motion.rippleHost} ${motion.focusable}`}
          onClick={() => setMenuOpen(true)}
          onMouseDown={ripple(motion)}
          aria-label="Menu — all features"
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

      {/* Same sheet markup/styles as the header's "All features" trigger,
          so Menu opens an identical, familiar panel. */}
      {menuOpen && (
        <div className={sheetStyles.overlay} onClick={(e) => { if (e.target === e.currentTarget) setMenuOpen(false) }}>
          <div className={sheetStyles.sheet}>
            <div className={sheetStyles.head}>
              <h3>All features</h3>
              <button className={sheetStyles.closeBtn} onClick={() => setMenuOpen(false)} aria-label="Close">
                <XIcon size={15} />
              </button>
            </div>

            <div className={sheetStyles.note}>
              Showing {role.charAt(0).toUpperCase() + role.slice(1)} features only. This account can't open any other role's dashboard.
            </div>

            {groups.map(g => (
              <div key={g.name} className={sheetStyles.group}>
                <h4>{g.name}</h4>
                <div className={sheetStyles.grid}>
                  {g.items.map(item => (
                    <Link key={item.id} href={item.href} className={sheetStyles.feat} onClick={() => setMenuOpen(false)}>
                      <item.Icon size={20} />
                      <span>{item.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
