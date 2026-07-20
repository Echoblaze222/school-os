'use client'
// src/app/splash/page.tsx
// Simple, professional splash screen for SchoolOS.
// Calm fade + gentle scale only — no flashing, no strobing, no rapid motion.

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import styles from './splash.module.css'

export default function SplashPage() {
  const router = useRouter()
  const statsAnimated = useRef(false)

  // ── Live stats (single, quiet count-up) ─────────────────────────────────────
  useEffect(() => {
    if (statsAnimated.current) return
    statsAnimated.current = true

    const countUp = (id: string, target: number, suffix: string, delay: number) => {
      setTimeout(() => {
        const el = document.getElementById(id)
        if (!el) return
        let start: number | null = null
        const step = (ts: number) => {
          if (!start) start = ts
          const p = Math.min((ts - start) / 900, 1)
          const ease = 1 - Math.pow(1 - p, 3)
          el.textContent = Math.round(ease * target) + suffix
          if (p < 1) requestAnimationFrame(step)
        }
        requestAnimationFrame(step)
      }, delay)
    }

    countUp('stat-schools',   24,    '',  700)
    countUp('stat-students',  12400, '+', 700)
    countUp('stat-features',  40,    '',  700)
  }, [])

  // ── Loader label steps ───────────────────────────────────────────────────────
  useEffect(() => {
    const steps = [
      { t: 400,  label: 'Loading interface...' },
      { t: 1100, label: 'Connecting to database...' },
      { t: 1800, label: 'Syncing school data...' },
      { t: 2400, label: 'Ready' },
    ]
    const timers = steps.map(({ t, label }) =>
      setTimeout(() => {
        const el = document.getElementById('loader-label')
        if (el) el.textContent = label
      }, t)
    )
    return () => timers.forEach(clearTimeout)
  }, [])

  // ── Exit + redirect ──────────────────────────────────────────────────────────
  useEffect(() => {
    const exitTimer = setTimeout(() => {
      const root = document.getElementById('splash-root')
      if (root) root.classList.add(styles.exiting)
    }, 2600)
    const redirectTimer = setTimeout(() => router.replace('/select-school'), 3050)
    return () => { clearTimeout(exitTimer); clearTimeout(redirectTimer) }
  }, [router])

  return (
    <div id="splash-root" className={styles.splash}>
      <div className={styles.glow} />

      <div className={styles.content}>
        <div className={styles.logoWrap}>
          <div className={styles.logoRing} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/logo.png" alt="SchoolOS" className={styles.logo} />
        </div>

        <h1 className={styles.brandName}>
          School<span className={styles.brandAccent}>OS</span>
        </h1>
        <p className={styles.tagline}>School Management Portal</p>

        <div className={styles.stats}>
          <div className={styles.stat}>
            <span id="stat-schools" className={styles.statVal}>0</span>
            <span className={styles.statLabel}>Schools</span>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.stat}>
            <span id="stat-students" className={styles.statVal}>0</span>
            <span className={styles.statLabel}>Students</span>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.stat}>
            <span id="stat-features" className={styles.statVal}>0</span>
            <span className={styles.statLabel}>Features</span>
          </div>
        </div>

        <div className={styles.loaderWrap}>
          <div className={styles.loaderTrack}>
            <div className={styles.loaderFill} />
          </div>
          <span id="loader-label" className={styles.loaderLabel}>
            Loading...
          </span>
        </div>
      </div>

      <p className={styles.version}>SchoolOS · School Management · v1.0</p>
    </div>
  )
}
