'use client'
// components/GaugeStat.tsx
// A stat represented as an animated ring + count-up number, instead of a
// plain figure or a sentence. Used across dashboard home screens so every
// headline number has a graphic doing the talking, not prose.

import { useEffect, useRef, useState } from 'react'
import styles from './GaugeStat.module.css'

interface Props {
  label:      string
  value:      number          // drives the ring fill (0-100 if isPercent, else full ring once >0)
  isPercent?: boolean
  displayValue?: string       // overrides what's shown as the number, e.g. "3.8" for a GPA whose ring is scaled 0-100
  caption?:   string          // short supporting fragment, not a sentence
  color?:     string          // defaults to var(--status-ok)
  size?:      number
  delayMs?:   number
}

export default function GaugeStat({
  label, value, isPercent = false, displayValue, caption, color, size = 72, delayMs = 0,
}: Props) {
  const [display, setDisplay] = useState(0)
  const ringRef = useRef<SVGCircleElement>(null)
  const radius = (size - 8) / 2
  const circumference = 2 * Math.PI * radius

  useEffect(() => {
    const timeout = setTimeout(() => {
      let start: number | null = null
      const duration = 1000
      function step(ts: number) {
        if (start === null) start = ts
        const p = Math.min((ts - start) / duration, 1)
        const eased = 1 - Math.pow(1 - p, 3)
        const current = Math.round(value * eased)
        setDisplay(current)
        if (ringRef.current) {
          const pct = isPercent ? current / 100 : (value === 0 ? 0 : current / value)
          ringRef.current.style.strokeDashoffset = String(circumference - circumference * pct)
        }
        if (p < 1) requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    }, delayMs)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, isPercent])

  return (
    <div className={styles.wrap}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="var(--bg-elevated)" strokeWidth="8"
        />
        <circle
          ref={ringRef}
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color ?? 'var(--status-ok)'} strokeWidth="8"
          strokeDasharray={circumference} strokeDashoffset={circumference}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className={styles.ring}
        />
      </svg>
      <div className={styles.text}>
        <p className={styles.num}>{displayValue ?? `${display}${isPercent ? '%' : ''}`}</p>
        <p className={styles.label}>{label}</p>
        {caption && <p className={styles.caption}>{caption}</p>}
      </div>
    </div>
  )
}
