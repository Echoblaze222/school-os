'use client'
// src/app/splash/page.tsx
// Redesigned splash: glass-card hero, radial progress ring, typewriter tagline, live counters.
// Keeps SchoolOS's own Violet × Gold tokens — structural cues (ring, glass, calm motion)
// borrowed from the Trybe Focus reference, none of its literal colors.

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import styles from './splash.module.css'

const RING_SIZE = 128
const RING_STROKE = 6
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2
const RING_CIRC = 2 * Math.PI * RING_RADIUS

export default function SplashPage() {
  const router = useRouter()
  const taglineRef = useRef<HTMLSpanElement>(null)
  const statsAnimated = useRef(false)
  const ringRef = useRef<SVGCircleElement>(null)

  // ── Typewriter ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const phrases = [
      'School Management Portal',
      'Built for Nigerian Schools',
      'Every Role. One Platform.',
      'Secure · Smart · Simple',
    ]
    let pi = 0, ci = 0, deleting = false
    let timer: ReturnType<typeof setTimeout>

    const tick = () => {
      const el = taglineRef.current
      if (!el) return
      const phrase = phrases[pi]

      if (!deleting) {
        ci++
        el.textContent = phrase.slice(0, ci)
        if (ci === phrase.length) {
          deleting = true
          timer = setTimeout(tick, 2000)
          return
        }
        timer = setTimeout(tick, 65)
      } else {
        ci--
        el.textContent = phrase.slice(0, ci)
        if (ci === 0) {
          deleting = false
          pi = (pi + 1) % phrases.length
          timer = setTimeout(tick, 350)
          return
        }
        timer = setTimeout(tick, 32)
      }
    }

    const startTimer = setTimeout(tick, 1200)
    return () => { clearTimeout(startTimer); clearTimeout(timer) }
  }, [])

  // ── Counters ────────────────────────────────────────────────────────────────
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
          const p = Math.min((ts - start) / 1200, 1)
          const ease = 1 - Math.pow(1 - p, 3)
          el.textContent = Math.round(ease * target) + suffix
          if (p < 1) requestAnimationFrame(step)
        }
        requestAnimationFrame(step)
      }, delay)
    }

    countUp('stat-schools',  24,    '',  1600)
    countUp('stat-students', 12400, '+', 1600)
    countUp('stat-features', 40,    '',  1600)
  }, [])

  // ── Radial ring progress (0 → 1 over the splash duration) ───────────────────
  useEffect(() => {
    const DURATION = 4800
    const start = performance.now()
    let raf: number

    const step = (ts: number) => {
      const p = Math.min((ts - start) / DURATION, 1)
      const el = ringRef.current
      if (el) el.style.strokeDashoffset = String(RING_CIRC - p * RING_CIRC)
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [])

  // ── Loader label steps ───────────────────────────────────────────────────────
  useEffect(() => {
    const steps = [
      { t: 500,  label: 'Loading modules…' },
      { t: 1400, label: 'Connecting database…' },
      { t: 2400, label: 'Syncing school data…' },
      { t: 3300, label: 'Applying permissions…' },
      { t: 4300, label: 'Ready' },
    ]
    const timers = steps.map(({ t, label }) =>
      setTimeout(() => {
        const el = document.getElementById('loader-label')
        if (el) el.textContent = label
      }, t)
    )
    return () => timers.forEach(clearTimeout)
  }, [])

  // ── Redirect after splash ────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => router.replace('/select-school'), 5000)
    return () => clearTimeout(t)
  }, [router])

  // ── Soft ambient particles (calmer, sparser than before) ─────────────────────
  useEffect(() => {
    const canvas = document.getElementById('particle-canvas') as HTMLCanvasElement
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let raf: number
    let w = 0, h = 0

    const resize = () => {
      w = canvas.width  = window.innerWidth
      h = canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    const N = 34
    const pts = Array.from({ length: N }, () => ({
      x: Math.random() * (w || 400),
      y: Math.random() * (h || 800),
      vx: (Math.random() - 0.5) * 0.18,
      vy: (Math.random() - 0.5) * 0.18,
      r: Math.random() * 1.4 + 0.4,
    }))

    const draw = () => {
      ctx.clearRect(0, 0, w, h)
      for (const p of pts) {
        p.x += p.vx; p.y += p.vy
        if (p.x < 0) p.x = w; if (p.x > w) p.x = 0
        if (p.y < 0) p.y = h; if (p.y > h) p.y = 0
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(159, 103, 255, 0.35)'
        ctx.fill()
      }
      raf = requestAnimationFrame(draw)
    }
    draw()

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <div className={styles.splash}>

      {/* Soft particle layer */}
      <canvas id="particle-canvas" className={styles.particles} />

      {/* Ambient glow */}
      <div className={styles.glowViolet} />
      <div className={styles.glowGold} />

      {/* ── Main content ── */}
      <div className={styles.content}>

        {/* Logo inside radial progress ring */}
        <div className={styles.logoArea}>
          <svg className={styles.ringSvg} width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
            <circle
              cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS}
              stroke="rgba(255,255,255,0.08)" strokeWidth={RING_STROKE} fill="none"
            />
            <circle
              ref={ringRef}
              cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS}
              stroke="url(#ringGradient)" strokeWidth={RING_STROKE} fill="none"
              strokeLinecap="round"
              strokeDasharray={RING_CIRC}
              strokeDashoffset={RING_CIRC}
              transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
              className={styles.ringProgress}
            />
            <defs>
              <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#7C3AED" />
                <stop offset="100%" stopColor="#F59E0B" />
              </linearGradient>
            </defs>
          </svg>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/logo.png" alt="SchoolOS" className={styles.logo} />
        </div>

        {/* Brand + typewriter */}
        <div className={styles.brandWrap}>
          <h1 className={styles.brandName}>
            School<span className={styles.brandAccent}>OS</span>
          </h1>
          <p className={styles.tagline}>
            <span ref={taglineRef} />
            <span className={styles.cursor} />
          </p>
        </div>

        {/* Live stats — glass card */}
        <div className={`${styles.stats} glass-card`}>
          <div className={styles.stat}>
            <span id="stat-schools"  className={styles.statVal}>0</span>
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

        {/* Loader label */}
        <span id="loader-label" className={styles.loaderLabel}>
          Initialising SchoolOS…
        </span>

      </div>

      {/* Version */}
      <p className={styles.version}>SchoolOS · Premium School Management · v1.0</p>
    </div>
  )
}
