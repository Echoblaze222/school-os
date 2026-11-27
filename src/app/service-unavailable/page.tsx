'use client'
// src/app/service-unavailable/page.tsx
// Where middleware sends a signed-in person when it cannot reach Supabase
// (auth or database). Without this, an outage looked like being logged out:
// the session check failed, the user was bounced to /login, and they kept
// retrying a sign-in that could not work. Nothing is signed out or cleared
// here. The page checks on its own and returns the person to where they were
// headed as soon as the service answers.

import { useEffect, useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import {
  subscribe, getSnapshot, getServerSnapshot,
  installServiceStatusObserver, checkNow,
} from '@/lib/serviceStatus'
import styles from './ServiceUnavailable.module.css'

const MANUAL_COOLDOWN_MS = 5000

function safeNext(raw: string | null): string {
  if (raw && raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/service-unavailable')) return raw
  return '/dashboard'
}

export default function ServiceUnavailablePage() {
  const router = useRouter()
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const [target, setTarget] = useState('/dashboard')
  const [hasChecked, setHasChecked] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [cooldownUntil, setCooldownUntil] = useState(0)

  useEffect(() => {
    installServiceStatusObserver()
    setTarget(safeNext(new URLSearchParams(window.location.search).get('next')))
    // It may already be back by the time this page loads.
    void checkNow().then(() => setHasChecked(true))
  }, [])

  // Back up: go where the person was headed.
  useEffect(() => {
    if (hasChecked && snap.state === 'ok') router.replace(target)
  }, [hasChecked, snap.state, target, router])

  useEffect(() => {
    if (snap.nextCheckAt === null) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [snap.nextCheckAt])

  const secondsLeft = snap.nextCheckAt ? Math.max(0, Math.ceil((snap.nextCheckAt - now) / 1000)) : null
  const buttonDisabled = snap.checking || now < cooldownUntil

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>We can&apos;t reach SchoolOS right now</h1>
        <p className={styles.text}>
          The service your account depends on isn&apos;t responding. You haven&apos;t been signed out.
          We&apos;re checking automatically and will take you back as soon as it&apos;s up, so there&apos;s
          no need to keep refreshing or signing in again.
        </p>
        <p className={styles.meta} role="status" aria-live="polite">
          {snap.state === 'offline'
            ? "You're offline. We'll check again when your connection returns."
            : snap.checking || !hasChecked
              ? 'Checking now...'
              : secondsLeft !== null
                ? `Next check in ${secondsLeft}s`
                : 'Waiting for this tab to be visible'}
        </p>
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
    </main>
  )
}
