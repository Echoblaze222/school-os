'use client'
// src/components/mentoring/StarRating.tsx
// 1-5 star control. Read-only when onChange is omitted.

import styles from './mentoring.module.css'

interface Props {
  value: number
  onChange?: (v: number) => void
  size?: number
}

function Star({ filled, size }: { filled: boolean; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"
      fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8"
      strokeLinejoin="round" strokeLinecap="round">
      <path d="M12 2.8l2.9 5.9 6.5.9-4.7 4.6 1.1 6.4L12 17.5l-5.8 3.1 1.1-6.4L2.6 9.6l6.5-.9L12 2.8z" />
    </svg>
  )
}

export default function StarRating({ value, onChange, size = 20 }: Props) {
  const stars = [1, 2, 3, 4, 5]
  if (!onChange) {
    return (
      <span className={styles.stars} role="img" aria-label={`${value} out of 5`}>
        {stars.map(n => <Star key={n} filled={n <= Math.round(value)} size={size} />)}
      </span>
    )
  }
  return (
    <span className={styles.stars}>
      {stars.map(n => (
        <button key={n} type="button" className={styles.starBtn}
          onClick={() => onChange(n)} aria-label={`${n} star${n > 1 ? 's' : ''}`}
          aria-pressed={n <= value}>
          <Star filled={n <= value} size={size} />
        </button>
      ))}
    </span>
  )
}
