'use client'
// components/KpiCard.tsx
// Premium-UX-prompt §7 KPI card: small label, dominant number, optional
// icon, optional trend/context line, optional action - not a decorative
// gauge. Distinct from GaugeStat (which is for rate-style values that
// suit a ring, like a % score) - this is for "here's the number that
// matters," matching the reference dashboards' KPI row style while
// staying on this app's own --brand/glass-card tokens rather than
// copying the reference images' literal color palette.
//
// trend is optional and only rendered "where meaningful" per the prompt -
// don't pass one if there's no real prior-period number to compare
// against; a fabricated trend is worse than no trend.

import styles from './KpiCard.module.css'

interface Trend {
  direction: 'up' | 'down' | 'flat'
  label: string          // e.g. "+4.2% this term", "-2 since yesterday"
  positive?: boolean     // whether this direction is good news; defaults to direction === 'up'
}

interface Props {
  label: string
  value: string | number
  icon?: React.ReactNode
  context?: string        // short supporting fragment, e.g. "Active staff"
  trend?: Trend
  actionLabel?: string
  actionHref?: string
  color?: string           // accent for the icon chip; defaults to var(--brand)
  valueColor?: string      // override the number's own color for semantic meaning
                           // (e.g. red for "Not Paid", green for "Collected") - several
                           // sub-pages already color-coded the value itself before this
                           // component existed; this preserves that on migration rather
                           // than flattening it to one neutral color.
}

export default function KpiCard({
  label, value, icon, context, trend, actionLabel, actionHref, color, valueColor,
}: Props) {
  const positive = trend ? (trend.positive ?? trend.direction === 'up') : false

  return (
    <div className={styles.card}>
      <div className={styles.top}>
        <p className={styles.label}>{label}</p>
        {icon && (
          <span className={styles.iconChip} style={{ background: `color-mix(in srgb, ${color ?? 'var(--brand)'} 16%, transparent)`, color: color ?? 'var(--brand)' }}>
            {icon}
          </span>
        )}
      </div>

      <p className={styles.value} style={valueColor ? { color: valueColor } : undefined}>{value}</p>

      {(trend || context) && (
        <p className={styles.sub}>
          {trend && (
            <span className={`${styles.trend} ${positive ? styles.trendUp : styles.trendDown}`}>
              {trend.direction === 'up' ? '↗' : trend.direction === 'down' ? '↘' : '→'} {trend.label}
            </span>
          )}
          {!trend && context && <span className={styles.context}>{context}</span>}
        </p>
      )}

      {actionLabel && actionHref && (
        <a href={actionHref} className={styles.action}>{actionLabel}</a>
      )}
    </div>
  )
}
