'use client'
// components/AiInsightBanner.tsx
// The prominent full-width "AI Insight" card from the approved prototype —
// distinct from the AI Insights page link, this surfaces one concrete,
// specific observation right on the home screen.

import Link from 'next/link'
import { SparklesIcon } from './Icons'
import { ripple } from '@/lib/ripple'
import motion from './dashboard-motion.module.css'
import styles from './AiInsightBanner.module.css'

interface Props {
  insight:  string
  actionLabel?: string
  actionHref:   string
}

export default function AiInsightBanner({ insight, actionLabel = 'Review →', actionHref }: Props) {
  return (
    <div className={`${styles.banner} ${motion.riseIn}`} role="note">
      <div className={styles.icon}><SparklesIcon size={18} /></div>
      <div className={styles.body}>
        <div className={styles.eyebrow}>AI Insight</div>
        <p>{insight}</p>
      </div>
      <Link
        href={actionHref}
        className={`${styles.action} ${motion.rippleHost} ${motion.focusable}`}
        onMouseDown={ripple(motion)}
      >
        {actionLabel}
      </Link>
    </div>
  )
}
