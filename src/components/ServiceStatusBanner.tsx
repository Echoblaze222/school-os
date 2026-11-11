'use client'
// src/components/ServiceStatusBanner.tsx
// Mounted once in the root layout. Installs the fetch observer from
// src/lib/serviceStatus.ts and shows a small notice when SchoolOS cannot reach
// its backend (or the device is offline), instead of letting people retry a
// failing action again and again. Stays out of the way when everything works.

import { useEffect, useState, useSyncExternalStore } from 'react'
import { usePathname } from 'next/navigation'
import {
  subscribe, getSnapshot, getServerSnapshot,
  installServiceStatusObserver, checkNow,
} from '@/lib/serviceStatus'
import styles from './ServiceStatusBanner.module.css'

const MANUAL_COOLDOWN_MS = 5000

const COPY = {
  offline: {
    title: "You're offline",
    detail: "Changes can't be saved right now. We'll reconnect automatically when your connection is back.",
  },
  down: {
    title: "We can't reach SchoolOS right now",
    detail: "We're checking automatically, so there's no need to keep retrying. This will clear as soon as the service is back.",
  },
  degraded: {
    title: "Some SchoolOS services aren't responding",
    detail: "Signing in or saving may fail for now. We're checking automatically, so there's no need to keep retrying.",
  },
} as const

export default function ServiceStatusBanner() {
  const pathname = usePathname()
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const [now, setNow] = useState(() => Date.now())
  const [cooldownUntil, setCooldownUntil] = useState(0)

  useEffect(() => {
    installServiceStatusObserver()
  }, [])

  // Tick once a second only while a countdown is showing.
  useEffect(() => {
    if (snap.state === 'ok' || snap.nextCheckAt === null) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [snap.state, snap.nextCheckAt])

  // The /service-unavailable page explains everything itself.
  if (pathname?.startsWith('/service-unavailable')) return null

  if (snap.state === 'ok' && !snap.recovered) return null

  if (snap.state === 'ok') {
    return (
      <div className={`${styles.banner} ${styles.good}`} role="status" aria-live="polite">
        <div className={styles.text}>
          <p className={styles.title}>Back online</p>
          <p className={styles.detail}>SchoolOS is reachable again.</p>
        </div>
      </div>
    )
  }

  const copy = COPY[snap.state]
  const secondsLeft = snap.nextCheckAt ? Math.max(0, Math.ceil((snap.nextCheckAt - now) / 1000)) : null
  const buttonDisabled = snap.checking || now < cooldownUntil

  return (
    <div
      className={`${styles.banner} ${snap.state === 'down' ? styles.bad : styles.warn}`}
      role="status"
      aria-live="polite"
    >
      <div className={styles.text}>
        <p className={styles.title}>{copy.title}</p>
        <p className={styles.detail}>{copy.detail}</p>
        <p className={styles.meta}>
          {snap.checking ? 'Checking now...' : secondsLeft !== null ? `Next check in ${secondsLeft}s` : 'Waiting for this tab to be visible'}
        </p>
      </div>
      <button
        type="button"
        className={styles.button}
        disabled={buttonDisabled}
        onClick={() => {
          setCooldownUntil(Date.now() + MANUAL_COOLDOWN_MS)
          setNow(Date.now())
          void checkNow()
        }}
      >
        Check now
      </button>
    </div>
  )
}
