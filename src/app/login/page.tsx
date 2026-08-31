'use client'
// src/app/login/page.tsx
// The cinematic splash now lives solely at /splash - it plays once, then
// routes to /select-school, which routes here only after a school is chosen.
// This page enforces that a school must already be selected: if someone
// lands here directly (deep link, back button, bookmark) with no school in
// storage, they're bounced straight to /select-school before they can log in.

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import styles from './login.module.css'
import {
  MailIcon, EyeIcon, EyeOffIcon,
  LockIcon, PlusIcon, ArrowLeftIcon,
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
    //
    // Both fetches are awaited (via a capped race, not a bare await - see
    // below) BEFORE the skeleton drops. Previously they were fire-and-
    // forget: checkingSchool flipped to false, and the form rendered with
    // whatever was in localStorage, right as these were still in flight -
    // so anyone whose cached colour was stale (or missing entirely, e.g.
    // a school being logged into for the first time on this device) saw
    // the wrong/default colour flash before it visibly swapped once the
    // fetch resolved. The skeleton was built for exactly this kind of
    // gap; it just wasn't actually covering this particular fetch.
    const colorFetch = Promise.allSettled([
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
        }),
      supabase
        .from('school_branding')
        .select('secondary_color')
        .eq('id', parsedSchool.id)
        .single()
        .then(({ data }) => { if (data?.secondary_color) setSecondaryColor(data.secondary_color) }),
    ])

    // Race against a timeout so a slow or failed request can't leave
    // someone stuck on the skeleton forever - past 2.5s it just proceeds
    // with whatever's cached, same as before this fix, rather than
    // blocking indefinitely.
    Promise.race([colorFetch, new Promise(resolve => setTimeout(resolve, 2500))]).then(() => {
      setCheckingSchool(false)
      setMounted(true)
    })
  }, [router])

  // After a successful signInWithPassword, this account is now genuinely
  // authenticated - the ONLY thing left to check is whether it belongs to
  // the school currently selected on this page. Previously nothing did:
  // signing in just navigated straight to /dashboard, which would then
  // resolve based on the account's REAL school_id regardless of what was
  // picked on /select-school - so picking the wrong school silently
  // still worked, just landing on a different school's dashboard than
  // the one shown on screen. Signs back out and blocks navigation on a
  // mismatch, rather than letting the wrong-school selection quietly
  // succeed anyway.
  async function checkSchoolMatches(userId: string): Promise<boolean> {
    const { data: profile } = await supabase.from('profiles').select('school_id').eq('id', userId).single()
    if (profile && school && profile.school_id !== school.id) {
      await supabase.auth.signOut()
      setLoginError(`This account isn't part of ${school.name}. Go back and select the correct school before signing in.`)
      return true // mismatch
    }
    return false
  }

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
        const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({ email: data.email, password })
        if (signInErr) { setLoginError('Wrong password. Please try again.'); return }

        const mismatch = await checkSchoolMatches(signInData.user.id)
        if (mismatch) return

        // Hard navigation, not router.replace: this is a fresh sign-in, and
        // the client Router Cache doesn't reset on auth changes - a soft
        // nav here can briefly hand back a PREVIOUS session's cached
        // dashboard (e.g. another role's, on a shared device) before it
        // catches up. window.location guarantees a clean, fully fresh load.
        window.location.href = '/dashboard'
      } else {
        const { data: signInData, error } = await supabase.auth.signInWithPassword({ email: value, password })
        if (error) { setLoginError(error.message); return }

        const mismatch = await checkSchoolMatches(signInData.user.id)
        if (mismatch) return

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
                    className={`${styles.input} ${styles.codeInput}`} placeholder="e.g. TEA-2026-XXXX"
                    required autoComplete="off"
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

              <button className={styles.backHomeLink} onClick={() => router.push('/')} type="button">
                <ArrowLeftIcon size={13} /> Back to home
              </button>
          </div>
        </div>{/* end .card */}

        </div>{/* end .pageContent */}
      </div>{/* end .page */}
    </>
  )
}
