'use client'
// src/app/login/page.tsx
// Splash overlay plays for 5s on first load, then fades out to reveal login form

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import styles from './login.module.css'
import {
  MailIcon, GlobeIcon, SchoolIcon, UsersIcon, SparklesIcon,
  CreditCardIcon, PhoneIcon, ShieldIcon, EyeIcon, EyeOffIcon,
} from '@/components/Icons'

type Tab       = 'login' | 'register'
type LoginMode = 'existing' | 'new-user'

interface SelectedSchool {
  id: string
  name: string
  primaryColor: string | null
}

const SCHOOL_KEY    = 'schoolos_selected_school'
const SPLASH_KEY    = 'schoolos_splash_shown'
const SPLASH_MS     = 5000

export default function LoginPage() {
  const router   = useRouter()
  const supabase = createClient()

  // ── Splash state ──────────────────────────────────────────────────────────
  const [splashVisible, setSplashVisible] = useState(true)
  const [splashFading,  setSplashFading]  = useState(false)
  const taglineRef  = useRef<HTMLSpanElement>(null)
  const statsAnimated = useRef(false)

  useEffect(() => {
    // Show splash every time the app is opened fresh (session-based)
    // Use sessionStorage so it shows once per app launch, not once ever
    const shown = sessionStorage.getItem(SPLASH_KEY)
    if (shown) {
      setSplashVisible(false)
      return
    }
    sessionStorage.setItem(SPLASH_KEY, '1')

    // Start fade-out 400ms before hiding
    const fadeTimer   = setTimeout(() => setSplashFading(true),  SPLASH_MS - 400)
    const hideTimer   = setTimeout(() => setSplashVisible(false), SPLASH_MS)
    return () => { clearTimeout(fadeTimer); clearTimeout(hideTimer) }
  }, [])

  // Typewriter
  useEffect(() => {
    if (!splashVisible) return
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
        if (ci === phrase.length) { deleting = true; timer = setTimeout(tick, 1800); return }
        timer = setTimeout(tick, 62)
      } else {
        ci--
        el.textContent = phrase.slice(0, ci)
        if (ci === 0) { deleting = false; pi = (pi + 1) % phrases.length; timer = setTimeout(tick, 320); return }
        timer = setTimeout(tick, 30)
      }
    }
    const start = setTimeout(tick, 1300)
    return () => { clearTimeout(start); clearTimeout(timer) }
  }, [splashVisible])

  // Counters
  useEffect(() => {
    if (!splashVisible || statsAnimated.current) return
    statsAnimated.current = true

    const countUp = (id: string, target: number, suffix: string, delay: number) => {
      setTimeout(() => {
        const el = document.getElementById(id)
        if (!el) return
        let start: number | null = null
        const step = (ts: number) => {
          if (!start) start = ts
          const p    = Math.min((ts - start) / 1100, 1)
          const ease = 1 - Math.pow(1 - p, 3)
          el.textContent = Math.round(ease * target) + suffix
          if (p < 1) requestAnimationFrame(step)
        }
        requestAnimationFrame(step)
      }, delay)
    }
    countUp('sp-schools',  24,    '',  1900)
    countUp('sp-students', 12400, '+', 1900)
    countUp('sp-features', 40,    '',  1900)
  }, [splashVisible])

  // Loader labels
  useEffect(() => {
    if (!splashVisible) return
    const steps = [
      { t: 600,  label: 'Loading modules...' },
      { t: 1400, label: 'Connecting database...' },
      { t: 2400, label: 'Syncing school data...' },
      { t: 3300, label: 'Applying permissions...' },
      { t: 4300, label: 'Ready ✓' },
    ]
    const timers = steps.map(({ t, label }) =>
      setTimeout(() => {
        const el = document.getElementById('sp-loader-label')
        if (el) el.textContent = label
      }, t)
    )
    return () => timers.forEach(clearTimeout)
  }, [splashVisible])

  // Particles canvas
  useEffect(() => {
    if (!splashVisible) return
    const canvas = document.getElementById('sp-canvas') as HTMLCanvasElement
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

    const colors = ['rgba(124,58,237,', 'rgba(0,180,216,', 'rgba(245,158,11,']
    const pts = Array.from({ length: 70 }, () => ({
      x: Math.random() * (w || 400), y: Math.random() * (h || 800),
      vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4,
      r: Math.random() * 1.6 + 0.4,
      c: colors[Math.floor(Math.random() * colors.length)],
    }))

    const draw = () => {
      ctx.clearRect(0, 0, w, h)
      for (const p of pts) {
        p.x += p.vx; p.y += p.vy
        if (p.x < 0) p.x = w; if (p.x > w) p.x = 0
        if (p.y < 0) p.y = h; if (p.y > h) p.y = 0
      }
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y
          const d  = Math.sqrt(dx * dx + dy * dy)
          if (d < 90) {
            ctx.beginPath()
            ctx.strokeStyle = `rgba(124,58,237,${(1 - d / 90) * 0.07})`
            ctx.lineWidth   = 0.5
            ctx.moveTo(pts[i].x, pts[i].y)
            ctx.lineTo(pts[j].x, pts[j].y)
            ctx.stroke()
          }
        }
      }
      for (const p of pts) {
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = p.c + '0.5)'
        ctx.fill()
      }
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
  }, [splashVisible])

  // ── Login form state ──────────────────────────────────────────────────────
  const [tab,       setTab]       = useState<Tab>('login')
  const [mounted,   setMounted]   = useState(false)
  const [school,    setSchool]    = useState<SelectedSchool | null>(null)
  const [loginMode, setLoginMode] = useState<LoginMode>('existing')
  const [isTimeout, setIsTimeout] = useState(false)

  const [identifier,   setIdentifier]   = useState('')
  const [password,     setPassword]     = useState('')
  const [showPass,     setShowPass]     = useState(false)
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError,   setLoginError]   = useState('')

  const [newCode,        setNewCode]        = useState('')
  const [newPassword,    setNewPassword]    = useState('')
  const [confirmPass,    setConfirmPass]    = useState('')
  const [showNewPass,    setShowNewPass]    = useState(false)
  const [newUserLoading, setNewUserLoading] = useState(false)
  const [newUserError,   setNewUserError]   = useState('')

  const [regStep,        setRegStep]        = useState(1)
  const [regLoading,     setRegLoading]     = useState(false)
  const [regError,       setRegError]       = useState('')
  const [regSuccess,     setRegSuccess]     = useState(false)
  const [paymentMode,    setPaymentMode]    = useState<'full' | 'installment'>('full')
  const [termsAccepted,  setTermsAccepted]  = useState(false)
  const [reg, setReg] = useState({
    schoolName: '', schoolType: 'Secondary', address: '', city: '', state: '',
    phone: '', email: '', tagline: '',
    principalName: '', principalEmail: '', principalPhone: '', principalPassword: '',
  })

  useEffect(() => {
    setMounted(true)
    const params = new URLSearchParams(window.location.search)
    if (params.get('reason') === 'timeout') setIsTimeout(true)
    const stored = localStorage.getItem(SCHOOL_KEY)
    if (stored) { try { setSchool(JSON.parse(stored)) } catch {} }
  }, [])

  async function handleExistingLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoginError('')
    setLoginLoading(true)
    const value = identifier.trim()
    try {
      const isCode = !value.includes('@') && value.includes('-')
      if (isCode) {
        const res  = await fetch('/api/auth/code-signin', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: value.toUpperCase(), password }),
        })
        const data = await res.json()
        if (!res.ok) { setLoginError(data.error || 'Invalid code or password.'); return }
        const { error: signInErr } = await supabase.auth.signInWithPassword({ email: data.email, password })
        if (signInErr) { setLoginError('Wrong password. Please try again.'); return }
        router.replace('/dashboard')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: value, password })
        if (error) { setLoginError(error.message); return }
        router.replace('/dashboard')
      }
    } catch { setLoginError('Something went wrong. Please try again.')
    } finally { setLoginLoading(false) }
  }

  async function handleNewUserActivation(e: React.FormEvent) {
    e.preventDefault()
    setNewUserError('')
    if (newPassword !== confirmPass) { setNewUserError('Passwords do not match.'); return }
    if (newPassword.length < 8)      { setNewUserError('Password must be at least 8 characters.'); return }
    setNewUserLoading(true)
    try {
      const res  = await fetch('/api/auth/first-login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code:     newCode.toUpperCase(),
          newPassword,
          schoolId: school?.id ?? null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setNewUserError(data.already_activated
          ? 'This account is already activated. Use the Sign In tab with your access code and password.'
          : data.error || 'Something went wrong.')
        return
      }
      if (data.success) {
        const { error: signInErr } = await supabase.auth.signInWithPassword({ email: data.email, password: newPassword })
        if (signInErr) { setNewUserError('Activation done but sign-in failed. Try signing in now.'); return }
        // Sync localStorage school to the actual school this user belongs to
        if (data.school) {
          localStorage.setItem(SCHOOL_KEY, JSON.stringify(data.school))
        }
        const stage = data.onboarding_stage
        router.replace(
          stage === 'stage_1_pending' ? '/onboarding/stage-1' :
          stage === 'stage_2_pending' ? '/onboarding/stage-2' : '/dashboard'
        )
      }
    } catch { setNewUserError('Something went wrong. Please try again.')
    } finally { setNewUserLoading(false) }
  }

  function updateReg(field: string, value: string) {
    setReg(prev => ({ ...prev, [field]: value }))
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setRegError('')
    if (!termsAccepted) { setRegError('Please accept the Terms & Conditions and Privacy Policy to continue.'); return }
    setRegLoading(true)
    try {
      const res = await fetch('/api/schools/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school: {
            name: reg.schoolName, school_type: reg.schoolType,
            address: reg.address, city: reg.city, state: reg.state,
            phone: reg.phone, email: reg.email, tagline: reg.tagline,
          },
          paymentMode,
          principal: {
            name: reg.principalName, full_name: reg.principalName,
            email: reg.principalEmail, phone: reg.principalPhone, password: reg.principalPassword,
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) { setRegError(data.error || 'Registration failed.'); return }
      if (data.paymentUrl) { window.location.href = data.paymentUrl } else { setRegSuccess(true) }
    } catch { setRegError('Registration failed. Please try again.')
    } finally { setRegLoading(false) }
  }

  const SETUP_FEE         = 150000
  const SETUP_INSTALLMENT = 50000
  const amountDueNow      = paymentMode === 'installment' ? SETUP_INSTALLMENT : SETUP_FEE

  const STATES = [
    'Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno',
    'Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','FCT','Gombe','Imo',
    'Jigawa','Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos','Nasarawa',
    'Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto','Taraba',
    'Yobe','Zamfara',
  ]

  return (
    <>
      {/* ── SPLASH OVERLAY ─────────────────────────────────────────────────── */}
      {splashVisible && (
        <div className={`${styles.splashOverlay} ${splashFading ? styles.splashFading : ''}`}>

          <canvas id="sp-canvas" className={styles.spCanvas} />
          <div className={styles.spGlowViolet} />
          <div className={styles.spGlowCyan} />
          <div className={styles.spGrid} />
          <div className={styles.spScanLine} />

          {/* HUD corners */}
          <div className={`${styles.spCorner} ${styles.spTL}`} />
          <div className={`${styles.spCorner} ${styles.spTR}`} />
          <div className={`${styles.spCorner} ${styles.spBL}`} />
          <div className={`${styles.spCorner} ${styles.spBR}`} />

          <div className={styles.spContent}>

            {/* Logo */}
            <div className={styles.spLogoArea}>
              <div className={styles.spOrbitRing} />
              <div className={styles.spRingOuter} />
              <div className={styles.spRingMid} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/logo.png" alt="SchoolOS" className={styles.spLogo} />
            </div>

            {/* Brand */}
            <div className={styles.spBrandWrap}>
              <h1 className={styles.spBrandName}>
                School<span className={styles.spBrandAccent}>OS</span>
              </h1>
              <p className={styles.spTagline}>
                <span ref={taglineRef} />
                <span className={styles.spCursor} />
              </p>
            </div>

            {/* Stats */}
            <div className={styles.spStats}>
              <div className={styles.spStat}>
                <span id="sp-schools"  className={styles.spStatVal}>0</span>
                <span className={styles.spStatLabel}>Schools</span>
              </div>
              <div className={styles.spStatDiv} />
              <div className={styles.spStat}>
                <span id="sp-students" className={styles.spStatVal}>0</span>
                <span className={styles.spStatLabel}>Students</span>
              </div>
              <div className={styles.spStatDiv} />
              <div className={styles.spStat}>
                <span id="sp-features" className={styles.spStatVal}>0</span>
                <span className={styles.spStatLabel}>Features</span>
              </div>
            </div>

            {/* Loader */}
            <div className={styles.spLoaderWrap}>
              <div className={styles.spLoaderTrack}>
                <div className={styles.spLoaderFill} />
              </div>
              <span id="sp-loader-label" className={styles.spLoaderLabel}>
                Initialising SchoolOS...
              </span>
            </div>

          </div>

          <p className={styles.spVersion}>SchoolOS · Premium School Management · v1.0</p>
        </div>
      )}

      {/* ── LOGIN PAGE ─────────────────────────────────────────────────────── */}
      <div className={styles.page}>
        <div className={styles.bgGlow} />
        <div className={styles.bgGrid} />

        <div className={styles.pageContent}>

        <div className={`${styles.card} ${mounted ? styles.visible : ''}`}>

          <div className={styles.topBar}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/logo.png" alt="SchoolOS" className={styles.logo} />
            <div className={styles.topBarText}>
              <span className={styles.appName}>SchoolOS</span>
              {school ? (
                <span className={styles.schoolBadge}>
                  {school.name}
                  <button className={styles.changeSchoolBtn} onClick={() => router.push('/select-school')}>
                    ‹ Change
                  </button>
                </span>
              ) : (
                <button className={styles.changeSchoolBtn} onClick={() => router.push('/select-school')}>
                  Select your school →
                </button>
              )}
            </div>
          </div>

          {isTimeout && (
            <div className={styles.timeoutBanner}>
              🔒 You were logged out due to inactivity. Please sign in again.
            </div>
          )}

          <div className={styles.tabs}>
            <button
              className={`${styles.tabBtn} ${tab === 'login' ? styles.tabActive : ''}`}
              onClick={() => setTab('login')}
            >Sign In</button>
            <button
              className={`${styles.tabBtn} ${tab === 'register' ? styles.tabActive : ''}`}
              onClick={() => setTab('register')}
            >Register School</button>
            <div className={`${styles.tabIndicator} ${tab === 'register' ? styles.tabRight : ''}`} />
          </div>

          {/* ── SIGN IN TAB ── */}
          {tab === 'login' && (
            <div className={styles.formWrap}>
              <div className={styles.modeToggle}>
                <button
                  className={`${styles.modeBtn} ${loginMode === 'existing' ? styles.modeBtnActive : ''}`}
                  onClick={() => { setLoginMode('existing'); setLoginError(''); setNewUserError('') }}
                >📧 Email / Access Code</button>
                <button
                  className={`${styles.modeBtn} ${loginMode === 'new-user' ? styles.modeBtnActive : ''}`}
                  onClick={() => { setLoginMode('new-user'); setLoginError(''); setNewUserError('') }}
                >🆕 New User</button>
              </div>

              {loginMode === 'existing' && (
                <form onSubmit={handleExistingLogin} className={styles.form}>
                  <div className={styles.accessCodeNote}>
                    Sign in with your <strong>email</strong> or <strong>access code</strong> and your password.
                  </div>
                  {loginError && <div className={styles.errorBanner}>{loginError}</div>}
                  <label className={styles.label}>Email or Access Code</label>
                  <input
                    type="text" value={identifier} onChange={e => setIdentifier(e.target.value)}
                    className={styles.input} placeholder="you@school.edu.ng or PRIN-528-F0A"
                    required autoComplete="off" autoCapitalize="off"
                  />
                  <label className={styles.label}>Password</label>
                  <div className={styles.passWrap}>
                    <input
                      type={showPass ? 'text' : 'password'} value={password}
                      onChange={e => setPassword(e.target.value)} className={styles.input}
                      placeholder="Enter your password" required autoComplete="current-password"
                    />
                    <button type="button" className={styles.eyeBtn} onClick={() => setShowPass(!showPass)} tabIndex={-1}>
                      {showPass ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                    </button>
                  </div>
                  <button type="button" className={styles.forgotLink} onClick={() => router.push('/forgot-password')}>
                    Forgot password?
                  </button>
                  <button type="submit" className={styles.submitBtn} disabled={loginLoading}>
                    {loginLoading ? <span className={styles.btnSpinner} /> : 'Sign In'}
                  </button>
                </form>
              )}

              {loginMode === 'new-user' && (
                <form onSubmit={handleNewUserActivation} className={styles.form}>
                  <div className={styles.accessCodeNote}>
                    First time? Enter your access code from your administrator and create your password.
                  </div>
                  {newUserError && <div className={styles.errorBanner}>{newUserError}</div>}
                  <label className={styles.label}>Access Code</label>
                  <input
                    type="text" value={newCode} onChange={e => setNewCode(e.target.value.toUpperCase())}
                    className={`${styles.input} ${styles.codeInput}`} placeholder="e.g. TCH-AB12-XY"
                    required autoComplete="off" maxLength={16}
                  />
                  <label className={styles.label}>Set New Password</label>
                  <div className={styles.passWrap}>
                    <input
                      type={showNewPass ? 'text' : 'password'} value={newPassword}
                      onChange={e => setNewPassword(e.target.value)} className={styles.input}
                      placeholder="Min. 8 characters" required minLength={8}
                    />
                    <button type="button" className={styles.eyeBtn} onClick={() => setShowNewPass(!showNewPass)} tabIndex={-1}>
                      {showNewPass ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                    </button>
                  </div>
                  <label className={styles.label}>Confirm Password</label>
                  <div className={styles.passWrap}>
                    <input
                      type={showNewPass ? 'text' : 'password'} value={confirmPass}
                      onChange={e => setConfirmPass(e.target.value)} className={styles.input}
                      placeholder="Repeat your password" required minLength={8}
                    />
                  </div>
                  <button type="submit" className={styles.submitBtn} disabled={newUserLoading}>
                    {newUserLoading ? <span className={styles.btnSpinner} /> : 'Activate Account'}
                  </button>
                </form>
              )}

              <p className={styles.loginFooterLinks}>
                By signing in you agree to our{' '}
                <Link href="/terms" target="_blank" rel="noopener noreferrer" className={styles.termsLink}>Terms &amp; Conditions</Link>
                {' '}and{' '}
                <Link href="/privacy" target="_blank" rel="noopener noreferrer" className={styles.termsLink}>Privacy Policy</Link>
              </p>
            </div>
          )}

          {/* ── REGISTER TAB ── */}
          {tab === 'register' && (
            <div className={styles.formWrap}>
              {regSuccess ? (
                <div className={styles.successState}>
                  <div className={styles.successIcon}>✅</div>
                  <h3 className={styles.successTitle}>Registration Submitted!</h3>
                  <p className={styles.successMsg}>
                    Your school registration is being processed. Check your email for next steps.
                  </p>
                  <button className={styles.submitBtn} onClick={() => { setRegSuccess(false); setTab('login') }}>
                    Back to Sign In
                  </button>
                </div>
              ) : (
                <>
                  <div className={styles.stepBar}>
                    {[1,2].map(s => (
                      <div
                        key={s}
                        className={`${styles.step} ${regStep >= s ? styles.stepActive : ''}`}
                        onClick={() => s < regStep && setRegStep(s)}
                      >
                        <div className={styles.stepDot}>{regStep > s ? '✓' : s}</div>
                        <span className={styles.stepLabel}>{s === 1 ? 'School Info' : 'Principal'}</span>
                      </div>
                    ))}
                    <div className={`${styles.stepLine} ${regStep > 1 ? styles.stepLineDone : ''}`} />
                  </div>

                  {regError && <div className={styles.errorBanner}>{regError}</div>}

                  <form
                    onSubmit={regStep === 1 ? (e) => { e.preventDefault(); setRegStep(2) } : handleRegister}
                    className={styles.form}
                  >
                    {regStep === 1 && (
                      <>
                        <label className={styles.label}>School Name *</label>
                        <input className={styles.input} required value={reg.schoolName}
                          onChange={e => updateReg('schoolName', e.target.value)} placeholder="e.g. Greenfield Academy" />

                        <label className={styles.label}>School Type</label>
                        <select className={styles.select} value={reg.schoolType} onChange={e => updateReg('schoolType', e.target.value)}>
                          <option>Primary</option><option>Secondary</option>
                          <option>Tertiary</option><option>Vocational</option><option>International</option>
                        </select>

                        <label className={styles.label}>Address *</label>
                        <input className={styles.input} required value={reg.address}
                          onChange={e => updateReg('address', e.target.value)} placeholder="Street address" />

                        <div className={styles.row}>
                          <div className={styles.col}>
                            <label className={styles.label}>City *</label>
                            <input className={styles.input} required value={reg.city}
                              onChange={e => updateReg('city', e.target.value)} placeholder="City" />
                          </div>
                          <div className={styles.col}>
                            <label className={styles.label}>State *</label>
                            <select className={styles.select} required value={reg.state}
                              onChange={e => updateReg('state', e.target.value)}>
                              <option value="">— State —</option>
                              {STATES.map(s => <option key={s}>{s}</option>)}
                            </select>
                          </div>
                        </div>

                        <label className={styles.label}>School Email *</label>
                        <input className={styles.input} type="email" required value={reg.email}
                          onChange={e => updateReg('email', e.target.value)} placeholder="school@domain.com" />

                        <label className={styles.label}>Phone *</label>
                        <input className={styles.input} type="tel" required value={reg.phone}
                          onChange={e => updateReg('phone', e.target.value)} placeholder="+234 800 0000 000" />

                        <label className={styles.label}>Platform Setup Fee</label>
                        <div className={styles.setupFeeNote}>
                          One-time fee to onboard your school: <strong>₦150,000</strong>.
                          Recurring billing is <strong>per-student per term</strong> (₦500–₦2,000 depending on plan).
                        </div>

                        <label className={styles.label}>Payment Option</label>
                        <div className={styles.planGrid}>
                          <div
                            className={`${styles.planCard} ${paymentMode === 'full' ? styles.planActive : ''}`}
                            onClick={() => setPaymentMode('full')}
                          >
                            <span className={styles.planName}>Pay in Full</span>
                            <span className={styles.planPrice}>₦150,000</span>
                            <span className={styles.planSub}>Pay once now</span>
                          </div>
                          <div
                            className={`${styles.planCard} ${paymentMode === 'installment' ? styles.planActive : ''}`}
                            onClick={() => setPaymentMode('installment')}
                          >
                            <span className={styles.planName}>Installmental</span>
                            <span className={styles.planPrice}>₦50,000 × 3</span>
                            <span className={styles.planSub}>Monthly, 3 months</span>
                          </div>
                        </div>

                        {paymentMode === 'installment' && (
                          <div className={styles.installmentTimeline}>
                            <div className={styles.installmentStep}>
                              <span className={styles.installDot} style={{ background: '#800020' }}>1</span>
                              <div>
                                <p className={styles.installLabel}>Today — ₦50,000</p>
                                <p className={styles.installDesc}>Pay now to activate your portal</p>
                              </div>
                            </div>
                            <div className={styles.installmentStep}>
                              <span className={styles.installDot}>2</span>
                              <div>
                                <p className={styles.installLabel}>Month 2 — ₦50,000</p>
                                <p className={styles.installDesc}>Auto-reminder will be sent</p>
                              </div>
                            </div>
                            <div className={styles.installmentStep}>
                              <span className={styles.installDot}>3</span>
                              <div>
                                <p className={styles.installLabel}>Month 3 — ₦50,000</p>
                                <p className={styles.installDesc}>Setup fee fully cleared</p>
                              </div>
                            </div>
                          </div>
                        )}
                        <button type="submit" className={styles.submitBtn}>Next: Principal Details →</button>
                      </>
                    )}

                    {regStep === 2 && (
                      <>
                        <label className={styles.label}>Principal Full Name *</label>
                        <input className={styles.input} required value={reg.principalName}
                          onChange={e => updateReg('principalName', e.target.value)} placeholder="Full name" />

                        <label className={styles.label}>Principal Email *</label>
                        <input className={styles.input} type="email" required value={reg.principalEmail}
                          onChange={e => updateReg('principalEmail', e.target.value)} placeholder="principal@school.edu" />

                        <label className={styles.label}>Principal Phone *</label>
                        <input className={styles.input} type="tel" required value={reg.principalPhone}
                          onChange={e => updateReg('principalPhone', e.target.value)} placeholder="+234 800 0000 000" />

                        <label className={styles.label}>Set Password *</label>
                        <div className={styles.passWrap}>
                          <input
                            type={showPass ? 'text' : 'password'} className={styles.input}
                            required minLength={8} value={reg.principalPassword}
                            onChange={e => updateReg('principalPassword', e.target.value)}
                            placeholder="Min. 8 characters"
                          />
                          <button type="button" className={styles.eyeBtn}
                            onClick={() => setShowPass(!showPass)} tabIndex={-1}>
                            {showPass ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                          </button>
                        </div>

                        <div className={styles.termsRow}>
                          <input
                            id="terms-checkbox"
                            type="checkbox"
                            checked={termsAccepted}
                            onChange={e => setTermsAccepted(e.target.checked)}
                            className={styles.termsCheckbox}
                          />
                          <label htmlFor="terms-checkbox" className={styles.termsText}>
                            I have read and agree to the{' '}
                            <Link href="/terms" target="_blank" rel="noopener noreferrer" className={styles.termsLink}
                              onClick={e => e.stopPropagation()}>
                              Terms &amp; Conditions
                            </Link>{' '}
                            and{' '}
                            <Link href="/privacy" target="_blank" rel="noopener noreferrer" className={styles.termsLink}
                              onClick={e => e.stopPropagation()}>
                              Privacy Policy
                            </Link>
                          </label>
                        </div>

                        <div className={styles.summaryBox}>
                          <p className={styles.summaryLine}><span>School:</span> {reg.schoolName}</p>
                          <p className={styles.summaryLine}><span>Payment:</span> {paymentMode === 'full' ? 'Full payment' : '3-month installment'}</p>
                          <p className={styles.summaryLine}><span>Due today:</span> ₦{amountDueNow.toLocaleString()}</p>
                          {paymentMode === 'installment' && (
                            <p className={styles.summaryLine}><span>Remaining:</span> ₦{(150000 - amountDueNow).toLocaleString()} over 2 months</p>
                          )}
                          <p className={styles.summaryLine} style={{ fontSize: '0.7rem', marginTop: 4 }}>
                            <span style={{ fontStyle: 'italic' }}>Term billing (per-student) configured after onboarding</span>
                          </p>
                        </div>

                        <div className={styles.regBtnRow}>
                          <button type="button" className={styles.backBtn} onClick={() => setRegStep(1)}>← Back</button>
                          <button type="submit" className={styles.submitBtn} disabled={regLoading}>
                            {regLoading ? <span className={styles.btnSpinner} /> : `Pay ₦${amountDueNow.toLocaleString()} →`}
                          </button>
                        </div>
                      </>
                    )}
                  </form>
                </>
              )}
            </div>
          )}
        </div>{/* end .card */}

        {/* ── SITE FOOTER ──────────────────────────────────────────────────── */}
        <footer className={styles.siteFooter}>

          {/* About */}
          <div className={styles.footerAbout}>
            <p className={styles.footerLogo}>
              School<span className={styles.footerLogoAccent}>OS</span>
            </p>
            <p className={styles.footerTagline}>
              Nigeria's most comprehensive multi-role school management platform — built for principals,
              teachers, bursars, secretaries, students, and parents. Every role. One platform.
            </p>
          </div>

          {/* Feature badges */}
          <div className={styles.footerBadges}>
            <span className={styles.footerBadge}><SchoolIcon size={11} /> Built for Nigeria</span>
            <span className={styles.footerBadge}><UsersIcon size={11} /> 6 Role Dashboards</span>
            <span className={styles.footerBadge}><SparklesIcon size={11} /> AI-Powered</span>
            <span className={styles.footerBadge}><CreditCardIcon size={11} /> Paystack Payments</span>
            <span className={styles.footerBadge}><PhoneIcon size={11} /> Mobile-First</span>
            <span className={styles.footerBadge}><ShieldIcon size={11} /> Bank-Grade Security</span>
          </div>

          <div className={styles.footerDivider} />

          {/* Contact */}
          <div className={styles.footerContact}>
            <a href="mailto:piussimon717@gmail.com" className={styles.footerContactLink}>
              <MailIcon size={13} /> piussimon717@gmail.com
            </a>
            <div className={styles.footerDotSep} />
            <a
              href="https://school-os-j4bn.vercel.app"
              className={styles.footerContactLink}
              target="_blank"
              rel="noopener noreferrer"
            >
              <GlobeIcon size={13} /> school-os-j4bn.vercel.app
            </a>
          </div>

          {/* Nav links */}
          <div className={styles.footerLinks}>
            <Link href="/about" className={styles.footerLink}>About</Link>
            <div className={styles.footerDotSep} />
            <Link href="/pricing" className={styles.footerLink}>Pricing</Link>
            <div className={styles.footerDotSep} />
            <Link href="/terms" target="_blank" rel="noopener noreferrer" className={styles.footerLink}>Terms</Link>
            <div className={styles.footerDotSep} />
            <Link href="/privacy" target="_blank" rel="noopener noreferrer" className={styles.footerLink}>Privacy</Link>
            <div className={styles.footerDotSep} />
            <a href="mailto:piussimon717@gmail.com" className={styles.footerLink}>Contact Us</a>
          </div>

          {/* Copyright */}
          <p className={styles.footerCopy}>
            © 2026 SchoolOS by Echoblaze · Built in Nigeria for Nigerian Schools
          </p>

        </footer>

        </div>{/* end .pageContent */}
      </div>{/* end .page */}
    </>
  )
}
