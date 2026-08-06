'use client'
// components/BottomDock.tsx
// Replaces a persistent sidebar/tab bar with one small floating control:
// Home (this page) and AI (the role's AI Insights page). That's the entire
// nav chrome outside of the "All features" sheet.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { HomeIcon, SparklesIcon } from './Icons'
import { ripple } from '@/lib/ripple'
import motion from './dashboard-motion.module.css'
import styles from './BottomDock.module.css'

interface Props {
  homeHref: string
  aiHref:   string
}

export default function BottomDock({ homeHref, aiHref }: Props) {
  const pathname = usePathname()
  const onHome = pathname === homeHref

  return (
    <div className={styles.dock}>
      <Link
        href={homeHref}
        className={`${styles.btn} ${onHome ? styles.active : ''} ${motion.rippleHost} ${motion.focusable}`}
        onMouseDown={ripple(motion)}
        aria-label="Home"
      >
        <HomeIcon size={17} />
        Home
      </Link>
      <div className={styles.divider} />
      <Link
        href={aiHref}
        className={`${styles.btn} ${motion.rippleHost} ${motion.focusable}`}
        onMouseDown={ripple(motion)}
        aria-label="AI Insights"
      >
        <SparklesIcon size={17} />
        AI
      </Link>
    </div>
  )
}
