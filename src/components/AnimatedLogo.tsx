// components/AnimatedLogo.tsx
// The 4-tile mark with the sequential zoom-out/zoom-in pulse, as a reusable
// component instead of a raw <img>. Each tile grows then shrinks during the
// first quarter of its own 2s cycle, staggered by 0.5s each, so exactly one
// tile is ever moving at a time - see styles module for the timing math.
//
// Premium surface: pages that carry data-surface="premium" (see
// src/app/premium-surface.css) define --logo-primary / --logo-accent, which
// override the two fills below, so the mark stays readable on pure black and
// on pure white without every caller having to pick a variant. Everywhere else
// those variables are undefined and the original colors apply unchanged.

import styles from './AnimatedLogo.module.css'

interface Props {
  size?: number
  variant?: 'color' | 'dark-bg'
  className?: string
}

export default function AnimatedLogo({ size = 64, variant = 'color', className = '' }: Props) {
  const primary = variant === 'dark-bg' ? '#7A1030' : '#4A0012'
  const accent  = variant === 'dark-bg' ? '#1C93AC' : '#006B85'
  const primaryStyle = { fill: `var(--logo-primary, ${primary})` }
  const accentStyle  = { fill: `var(--logo-accent, ${accent})` }

  return (
    <svg
      width={size} height={size} viewBox="0 0 100 100"
      className={`${styles.mark} ${className}`}
      role="img" aria-label="SchoolOS"
    >
      <g transform="rotate(45 50 50)">
        <rect className={`${styles.tile} ${styles.t1}`} x="18" y="18" width="28" height="28" rx="6" fill={primary} style={primaryStyle} />
        <rect className={`${styles.tile} ${styles.t2}`} x="54" y="18" width="28" height="28" rx="6" fill={primary} style={primaryStyle} />
        <rect className={`${styles.tile} ${styles.t3}`} x="18" y="54" width="28" height="28" rx="6" fill={primary} style={primaryStyle} />
        <rect className={`${styles.tile} ${styles.t4}`} x="54" y="54" width="28" height="28" rx="6" fill={accent} style={accentStyle} />
      </g>
    </svg>
  )
}
