'use client'
// src/app/login/page.tsx
// The cinematic splash now lives solely at /splash - it plays once, then
// routes to /select-school, which routes here only after a school is chosen.
// This page enforces that a school must already be selected: if someone
// lands here directly (deep link, back button, bookmark) with no school in
// storage, they're bounced straight to /select-school before they can log in.

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import styles from './login.module.css'
import {
  MailIcon, GlobeIcon, SchoolIcon, UsersIcon, SparklesIcon,
  CreditCardIcon, PhoneIcon, ShieldIcon, EyeIcon, EyeOffIcon,
  LockIcon, ArrowRightIcon, PlusIcon,
} from '@/components/Icons'

type LoginMode = 'existing' | 'new-user'

interface SelectedSchool {
  id: string
  name: string
  primaryColor: string | null
}

const SCHOOL_KEY = 'schoolos_selected_school'

export default function LoginPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [checkingSchool, setCheckingSchool] = useState(true)

  // ── Login form state ──────────────────────────────────────────────────────
  const [mounted,   setMounted]   = useState(false)
  const [school,    setSchool]    = useState<SelectedSchool | null>(null)
  const [secondaryColor, setSecondaryColor] = useState<string | null>(null)
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('reason') === 'timeout') setIsTimeout(true)

    const stored = localStorage.getItem(SCHOOL_KEY)
    if (!stored) {
      // No school selected - this page can't be reached without one.
      // Send them to pick a school first (deep link, back button, bookmark, etc.)
      router.replace('/select-school')
      return
    }
    let parsedSchool: SelectedSchool
    try {
      parsedSchool = JSON.parse(stored)
      setSchool(parsedSchool)
    } catch {
      router.replace('/select-school')
      return
    }

    // secondary_color only lives on school_branding - best-effort fetch so
    // the login screen can use the school's full two-colour brand, not just
    // the one colour already cached in localStorage from /select-school.
    //
    // primary_color IS cached in localStorage (set when the school was
    // originally picked on /select-school), but that cache goes stale the
    // moment a principal changes their brand colour in Settings - this page
    // would otherwise keep showing whatever colour was current back when
    // the school was first selected, potentially sessions/days earlier. So
    // re-fetch it fresh here too and let it override the cached value.
    supabase
      .from('schools')
      .select('primary_color')
      .eq('id', parsedSchool.id)
      .single()
      .then(({ data }) => {
        if (data?.primary_color) {
          setSchool(s => s ? { ...s, primaryColor: data.primary_color } : s)
          // Keep the cache in step so the next visit starts from the
          // right colour even before this fetch resolves.
          localStorage.setItem(SCHOOL_KEY, JSON.stringify({ ...parsedSchool, primaryColor: data.primary_color }))
        }
      })

    supabase
      .from('school_branding')
      .select('secondary_color')
      .eq('id', parsedSchool.id)
      .single()
      .then(({ data }) => { if (data?.secondary_color) setSecondaryColor(data.secondary_color) })

    setCheckingSchool(false)
    setMounted(true)
  }, [router])

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
        // Hard navigation, not router.replace: this is a fresh sign-in, and
        // the client Router Cache doesn't reset on auth changes - a soft
        // nav here can briefly hand back a PREVIOUS session's cached
        // dashboard (e.g. another role's, on a shared device) before it
        // catches up. window.location guarantees a clean, fully fresh load.
        window.location.href = '/dashboard'
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: value, password })
        if (error) { setLoginError(error.message); return }
        window.location.href = '/dashboard'
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

        // Wait for the session cookie to be written before navigating.
        // Without this, server-side routes on the next page (e.g. set-pin)
        // call auth.getUser() before the cookie exists and return 401.
        await supabase.auth.getSession()

        const stage = data.onboarding_stage
        // Hard navigation for the same reason as handleExistingLogin above - // this is a fresh sign-in and must not reuse a cached page from
        // whoever was previously signed in on this device.
        window.location.href =
          stage === 'stage_1_pending' ? '/onboarding/stage-1' :
          stage === 'stage_2_pending' ? '/onboarding/stage-2' : '/dashboard'
      }
    } catch { setNewUserError('Something went wrong. Please try again.')
    } finally { setNewUserLoading(false) }
  }

  // Still resolving whether a school is selected - render nothing rather
  // than flash the login form before a possible redirect to /select-school.
  if (checkingSchool) {
    return <div className={styles.schoolCheckGate} />
  }

  return (
    <>
      {/* ── LOGIN PAGE ─────────────────────────────────────────────────────── */}
      <div
        className={styles.page}
        style={{
          '--login-brand': school?.primaryColor || '#800020',
          '--login-brand-2': secondaryColor || school?.primaryColor || '#800020',
        } as React.CSSProperties}
      >
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
              <LockIcon size={14} /> You were logged out due to inactivity. Please sign in again.
            </div>
          )}

          <h2 className={styles.signInHeading}>Sign in</h2>

          <div className={styles.formWrap}>
              <div className={styles.modeToggle}>
                <button
                  className={`${styles.modeBtn} ${loginMode === 'existing' ? styles.modeBtnActive : ''}`}
                  onClick={() => { setLoginMode('existing'); setLoginError(''); setNewUserError('') }}
                ><MailIcon size={14} /> Email / Access Code</button>
                <button
                  className={`${styles.modeBtn} ${loginMode === 'new-user' ? styles.modeBtnActive : ''}`}
                  onClick={() => { setLoginMode('new-user'); setLoginError(''); setNewUserError('') }}
                ><PlusIcon size={14} /> New User</button>
              </div>

              {loginMode === 'existing' && (
                <form onSubmit={handleExistingLogin} className={styles.form}>
                  <div className={styles.accessCodeNote}>
                    Sign in with your <strong>email</strong> or <strong>access code</strong> and your password.
                  </div>
                  {loginError && <div className={styles.errorBanner}>{loginError}</div>}
                  <label className={styles.label}>Email or Access Code</label>
                  <input
                    type="text" value={identifier}
                    onChange={e => {
                      const v = e.target.value
                      // Access codes always contain a hyphen (PRIN-528-F0A);
                      // emails don't, in the overwhelming majority of cases.
                      // Checking for "-" instead of "@" fixes a real bug the
                      // old check had: checking for @ ABSENCE meant every
                      // character typed before the @ got force-uppercased,
                      // and that stuck permanently once @ was typed, since
                      // the old logic only stopped transforming going
                      // forward - it never fixed what was already wrong.
                      // Checking the whole current value on every keystroke
                      // avoids that: nothing gets uppercased until a hyphen
                      // actually appears, and once it does, the full value
                      // (including what was typed before the hyphen) is
                      // transformed together, so there's no stuck partial
                      // state either way.
                      setIdentifier(v.includes('-') ? v.toUpperCase() : v)
                    }}
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

              <div className={styles.registerRow}>
                <span>Setting up a new school?</span>
                <Link href="/register-school" className={styles.registerLink}>
                  Register your school <ArrowRightIcon size={13} />
                </Link>
              </div>
          </div>
        </div>{/* end .card */}

        {/* ── SITE FOOTER ──────────────────────────────────────────────────── */}
        <footer className={styles.siteFooter}>

          {/* About */}
          <div className={styles.footerAbout}>
            <p className={styles.footerLogo}>
              School<span className={styles.footerLogoAccent}>OS</span>
            </p>
            <p className={styles.footerTagline}>
              Nigeria's most comprehensive multi-role school management platform, built for principals,
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
