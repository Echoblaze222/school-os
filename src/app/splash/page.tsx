'use client'
// src/app/splash/page.tsx
// Cinematic After-Effects–style splash: camera push-in, true 3D perspective
// on the logo, depth-of-field staging, light-sweep transitions, multi-stage reveal.

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import styles from './splash.module.css'

export default function SplashPage() {
  const router = useRouter()
  const taglineRef = useRef<HTMLSpanElement>(null)
  const statsAnimated = useRef(false)

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

    const startTimer = setTimeout(tick, 2500)
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

    countUp('stat-schools',   24,    '',  2900)
    countUp('stat-students',  12400, '+', 2900)
    countUp('stat-features',  40,    '',  2900)
  }, [])

  // ── Loader label steps ───────────────────────────────────────────────────────
  useEffect(() => {
    const steps = [
      { t: 900,  label: 'Rendering interface...' },
      { t: 1700, label: 'Loading modules...' },
      { t: 2600, label: 'Connecting database...' },
      { t: 3600, label: 'Syncing school data...' },
      { t: 4500, label: 'Applying permissions...' },
      { t: 5400, label: 'Ready ✓' },
    ]
    const timers = steps.map(({ t, label }) =>
      setTimeout(() => {
        const el = document.getElementById('loader-label')
        if (el) el.textContent = label
      }, t)
    )
    return () => timers.forEach(clearTimeout)
  }, [])

  // ── Exit sequence + redirect ─────────────────────────────────────────────────
  useEffect(() => {
    const exitTimer = setTimeout(() => {
      const root = document.getElementById('splash-root')
      if (root) root.classList.add(styles.exiting)
    }, 5700)
    const redirectTimer = setTimeout(() => router.replace('/select-school'), 6500)
    return () => { clearTimeout(exitTimer); clearTimeout(redirectTimer) }
  }, [router])

  // ── Particles canvas (depth-layered: far / near) ────────────────────────────
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

    const N = 90
    const colors = ['rgba(124,58,237,', 'rgba(0,180,216,', 'rgba(245,158,11,']
    const pts = Array.from({ length: N }, () => {
      const depth = Math.random() // 0 = far, 1 = near
      return {
        x: Math.random() * (w || 400),
        y: Math.random() * (h || 800),
        vx: (Math.random() - 0.5) * (0.15 + depth * 0.5),
        vy: (Math.random() - 0.5) * (0.15 + depth * 0.5),
        r: 0.4 + depth * 2.1,
        depth,
        c: colors[Math.floor(Math.random() * colors.length)],
      }
    })

    const draw = () => {
      ctx.clearRect(0, 0, w, h)
      for (const p of pts) {
        p.x += p.vx; p.y += p.vy
        if (p.x < 0) p.x = w; if (p.x > w) p.x = 0
        if (p.y < 0) p.y = h; if (p.y > h) p.y = 0
      }
      // connection lines (only among nearer particles, for depth separation)
      for (let i = 0; i < N; i++) {
        if (pts[i].depth < 0.4) continue
        for (let j = i + 1; j < N; j++) {
          if (pts[j].depth < 0.4) continue
          const dx = pts[i].x - pts[j].x
          const dy = pts[i].y - pts[j].y
          const d = Math.sqrt(dx * dx + dy * dy)
          if (d < 100) {
            ctx.beginPath()
            ctx.strokeStyle = `rgba(124,58,237,${(1 - d / 100) * 0.1})`
            ctx.lineWidth = 0.5
            ctx.moveTo(pts[i].x, pts[i].y)
            ctx.lineTo(pts[j].x, pts[j].y)
            ctx.stroke()
          }
        }
      }
      // dots — farther ones dimmer/smaller/blurred, nearer ones sharp/bright
      for (const p of pts) {
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = p.c + (0.15 + p.depth * 0.55) + ')'
        ctx.filter = p.depth < 0.35 ? 'blur(1.4px)' : 'none'
        ctx.fill()
        ctx.filter = 'none'
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
    <div id="splash-root" className={styles.splash}>

      {/* Stage 0 — black frame + lens flash (0 - 0.4s) */}
      <div className={styles.lensFlash} />

      {/* Camera-push wrapper: entire scene sits in 3D space and pushes in */}
      <div className={styles.cameraRig}>

        {/* Particle layer */}
        <canvas id="particle-canvas" className={styles.particles} />

        {/* Ambient glows */}
        <div className={styles.glowViolet} />
        <div className={styles.glowCyan} />
        <div className={styles.glowClaret} />

        {/* Circuit grid — floats on its own depth plane */}
        <div className={styles.circuitGrid} />

        {/* Vignette for cinematic depth-of-field feel */}
        <div className={styles.vignette} />

        {/* Light sweep — diagonal AE-style sweep across the whole frame */}
        <div className={styles.lightSweep} />

        {/* Scan line */}
        <div className={styles.scanLine} />

        {/* HUD corners */}
        <div className={`${styles.corner} ${styles.tl}`} />
        <div className={`${styles.corner} ${styles.tr}`} />
        <div className={`${styles.corner} ${styles.bl}`} />
        <div className={`${styles.corner} ${styles.br}`} />

        {/* ── Main content ── */}
        <div className={styles.content}>

          {/* Logo — true 3D perspective tumble-in, then float on X/Y/Z */}
          <div className={styles.logoStage}>
            <div className={styles.logoArea}>
              <div className={styles.orbitRing} />
              <div className={styles.ringOuter} />
              <div className={styles.ringMid} />
              <div className={styles.logo3d}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/icons/logo.png"
                  alt="SchoolOS"
                  className={styles.logo}
                />
                {/* Reflection plane beneath logo for depth */}
                <div className={styles.logoReflection}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/icons/logo.png" alt="" aria-hidden="true" />
                </div>
              </div>
            </div>
          </div>

          {/* Brand + typewriter */}
          <div className={styles.brandWrap}>
            <h1 className={styles.brandName}>
              <span className={styles.brandLetters}>
                {'School'.split('').map((ch, i) => (
                  <span key={i} className={styles.brandChar} style={{ animationDelay: `${1.15 + i * 0.045}s` }}>{ch}</span>
                ))}
              </span>
              <span className={`${styles.brandLetters} ${styles.brandAccent}`}>
                {'OS'.split('').map((ch, i) => (
                  <span key={i} className={styles.brandChar} style={{ animationDelay: `${1.15 + (6 + i) * 0.045}s` }}>{ch}</span>
                ))}
              </span>
            </h1>
            <p className={styles.tagline}>
              <span ref={taglineRef} />
              <span className={styles.cursor} />
            </p>
          </div>

          {/* Live stats */}
          <div className={styles.stats}>
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

          {/* Loader */}
          <div className={styles.loaderWrap}>
            <div className={styles.loaderTrack}>
              <div className={styles.loaderFill} />
            </div>
            <span id="loader-label" className={styles.loaderLabel}>
              Initialising SchoolOS...
            </span>
          </div>

        </div>

        {/* Version */}
        <p className={styles.version}>SchoolOS · Premium School Management · v1.0</p>
      </div>

      {/* Exit wipe layer — plays over everything on the way out */}
      <div className={styles.exitWipe} />
    </div>
  )
}
