'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { EyeIcon, EyeOffIcon, SchoolIcon, LockIcon, KeyIcon } from '@/components/Icons'
import styles from './login.module.css'

const ROLE_ROUTES: Record<string, string> = {
  student:   '/dashboard/student',
  teacher:   '/dashboard/teacher',
  principal: '/dashboard/principal',
  bursar:    '/dashboard/bursar',
  secretary: '/dashboard/secretary',
  parent:    '/dashboard/parent',
  admin:     '/admin',
}

type Step = 'code' | 'password' | 'set-password'

export default function LoginPage() {
  const [code,        setCode]        = useState('')
  const [password,    setPassword]    = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPass, setConfirmPass] = useState('')
  const [showPass,    setShowPass]    = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')
  const [step,        setStep]        = useState<Step>('code')
  const [profileInfo, setProfileInfo] = useState<{
    full_name: string; role: string; school_name?: string
    is_first_login: boolean; email: string
  } | null>(null)

  const router   = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const saved = localStorage.getItem('schoolos_theme') ?? 'dark'
    document.documentElement.setAttribute('data-theme', saved)
  }, [])

  // ── Auto-redirect if a valid session already exists ───────────────────────
  // Handles "came back to the tab" case: if the Supabase access token is still
  // valid (or can be silently refreshed), skip the login form entirely.
  useEffect(() => {
    let cancelled = false

    async function checkExistingSession() {
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled || !session) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('role, onboarding_stage')
        .eq('id', session.user.id)
        .single()

      if (cancelled || !profile) return

      const stage = profile.onboarding_stage
      if (stage === 'stage_1_pending' || stage === 1) { router.replace('/onboarding/stage-1'); return }
      if (stage === 2 || stage === 'start')            { router.replace('/onboarding/stage-2'); return }
      if (stage === 3)                                  { router.replace('/onboarding/stage-3'); return }

      // Respect ?redirectTo=... so the user lands back where they were
      const params     = new URLSearchParams(window.location.search)
      const redirectTo = params.get('redirectTo')
      router.replace(redirectTo ?? ROLE_ROUTES[profile.role] ?? '/dashboard/student')
    }

    checkExistingSession()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Step 1: Validate access code ──────────────────────────────────────────
  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim()) return
    setLoading(true); setError('')

    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('id, full_name, role, email, onboarding_stage, schools(name)')
      .eq('default_code', code.trim().toUpperCase())
      .single()

    if (profileErr || !profile) {
      setError('Invalid access code. Please check and try again.')
      setLoading(false)
      return
    }

    const stage = (profile as any).onboarding_stage
    // 'start' = first time login (staff/student created by admin)
    // 'stage_1_pending' = principal first login
    const isFirstLogin = stage === 'start' || stage === 'stage_1_pending'

    setProfileInfo({
      full_name:      profile.full_name,
      role:           profile.role,
      school_name:    (profile.schools as any)?.name,
      is_first_login: isFirstLogin,
      email:          profile.email,
    })

    setStep(isFirstLogin ? 'set-password' : 'password')
    setLoading(false)
  }

  // ── Step 2a: First-time login — set new password then sign in ─────────────
  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault()
    if (!profileInfo) return
    if (newPassword.length < 8)          { setError('Password must be at least 8 characters'); return }
    if (newPassword !== confirmPass)     { setError('Passwords do not match'); return }
    setLoading(true); setError('')

    // Call server route that signs in via temp password and updates to new one
    const res = await fetch('/api/auth/first-login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        code:        code.trim().toUpperCase(),
        newPassword: newPassword,
      }),
    })
    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? 'Failed to set password. Please try again.')
      setLoading(false)
      return
    }

    // Now sign in with the new password
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email:    profileInfo.email,
      password: newPassword,
    })

    if (signInErr) {
      setError('Sign in failed after password set. Please try logging in normally.')
      setLoading(false)
      return
    }

    // Advance onboarding stage
    const stage = data.onboarding_stage
    if (stage === 'stage_1_pending') { router.push('/onboarding/stage-1'); return }
    if (stage === 2 || stage === 'stage_2_pending') { router.push('/onboarding/stage-2'); return }
    if (stage === 3) { router.push('/onboarding/stage-3'); return }
    // For staff/students at 'start' → go to stage-2 (PIN setup)
    router.push('/onboarding/stage-2')
  }

  // ── Step 2b: Returning user — normal password sign in ────────────────────
  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!password || !profileInfo) return
    setLoading(true); setError('')

    const { data: profile } = await supabase
      .from('profiles')
      .select('email, role, onboarding_stage')
      .eq('default_code', code.trim().toUpperCase())
      .single()

    if (!profile?.email) {
      setError('Account not found. Please contact your school admin.')
      setLoading(false)
      return
    }

    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email:    profile.email,
      password,
    })

    if (signInErr) {
      setError('Incorrect password. Please try again.')
      setLoading(false)
      return
    }

    const stage = profile.onboarding_stage
    if (stage === 'stage_1_pending' || stage === 1) { router.replace('/onboarding/stage-1'); return }
    if (stage === 2) { router.replace('/onboarding/stage-2'); return }
    if (stage === 3) { router.replace('/onboarding/stage-3'); return }

    // Honour ?redirectTo= so user lands back where they were before the session expired
    const params     = new URLSearchParams(window.location.search)
    const redirectTo = params.get('redirectTo')
    router.replace(redirectTo ?? ROLE_ROUTES[profile.role] ?? '/dashboard/student')
  }

  // ── Shared profile card ───────────────────────────────────────────────────
  const ProfileCard = () => profileInfo ? (
    <div className={styles.profilePreview}>
      <div className={styles.profileAvatar}>{profileInfo.full_name[0]}</div>
      <div>
        <p className={styles.profileName}>{profileInfo.full_name}</p>
        <p className={styles.profileMeta}>
          {profileInfo.role.charAt(0).toUpperCase() + profileInfo.role.slice(1)}
          {profileInfo.school_name ? ` · ${profileInfo.school_name}` : ''}
        </p>
      </div>
    </div>
  ) : null

  return (
    <div className={styles.page}>
      <div className={styles.bgOrb1} />
      <div className={styles.bgOrb2} />

      <div className={styles.card}>
        {/* Logo */}
        <div className={styles.logoWrap}>
          <div className={styles.logoIcon}>
            <SchoolIcon size={28} color="white" strokeWidth={1.5} />
          </div>
          <div>
            <h1 className={styles.appName}>SchoolOS</h1>
            <p className={styles.appTagline}>Nigeria's smartest school portal</p>
          </div>
        </div>

        {/* Step indicators */}
        <div className={styles.steps}>
          <div className={`${styles.step} ${styles.stepDone}`}>
            <span>1</span><p>Access Code</p>
          </div>
          <div className={styles.stepLine} />
          <div className={`${styles.step} ${step !== 'code' ? styles.stepDone : ''}`}>
            <span>2</span>
            <p>{step === 'set-password' ? 'Set Password' : 'Password'}</p>
          </div>
        </div>

        {/* ── Step 1: Enter access code ───────────────────────────────── */}
        {step === 'code' && (
          <form onSubmit={handleCodeSubmit} className={styles.form}>
            <div className={styles.formHeader}>
              <h2>Enter your access code</h2>
              <p>Your school will provide this code</p>
            </div>

            <div className={styles.inputGroup}>
              <label className={styles.label}>Access Code</label>
              <div className={styles.inputWrap}>
                <KeyIcon size={16} color="var(--text-muted)" className={styles.inputIcon} />
                <input
                  className={styles.input}
                  type="text"
                  value={code}
                  onChange={e => setCode(e.target.value.toUpperCase())}
                  placeholder="e.g. SCH-2026-4821"
                  autoComplete="off"
                  autoFocus
                  spellCheck={false}
                />
              </div>
            </div>

            {error && <p className={styles.error}>{error}</p>}

            <button type="submit" className={styles.submitBtn} disabled={loading || !code.trim()}>
              {loading ? <span className={styles.spinner} /> : 'Continue'}
            </button>

            <p className={styles.hint}>Forgot your code? Contact your school administrator.</p>
          </form>
        )}

        {/* ── Step 2a: First login — set a new password ───────────────── */}
        {step === 'set-password' && profileInfo && (
          <form onSubmit={handleSetPassword} className={styles.form}>
            <ProfileCard />

            <div className={styles.formHeader}>
              <h2>Create your password</h2>
              <p>First time here? Set a password you'll remember.</p>
            </div>

            <div className={styles.inputGroup}>
              <label className={styles.label}>New Password</label>
              <div className={styles.inputWrap}>
                <LockIcon size={16} color="var(--text-muted)" className={styles.inputIcon} />
                <input
                  className={styles.input}
                  type={showPass ? 'text' : 'password'}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  autoFocus
                />
                <button type="button" className={styles.eyeBtn} onClick={() => setShowPass(!showPass)} tabIndex={-1}>
                  {showPass ? <EyeOffIcon size={16} color="var(--text-muted)" /> : <EyeIcon size={16} color="var(--text-muted)" />}
                </button>
              </div>
            </div>

            <div className={styles.inputGroup}>
              <label className={styles.label}>Confirm Password</label>
              <div className={styles.inputWrap}>
                <LockIcon size={16} color="var(--text-muted)" className={styles.inputIcon} />
                <input
                  className={styles.input}
                  type={showPass ? 'text' : 'password'}
                  value={confirmPass}
                  onChange={e => setConfirmPass(e.target.value)}
                  placeholder="Re-enter your password"
                />
              </div>
            </div>

            {error && <p className={styles.error}>{error}</p>}

            <button type="submit" className={styles.submitBtn} disabled={loading || !newPassword || !confirmPass}>
              {loading ? <span className={styles.spinner} /> : 'Set Password & Continue'}
            </button>

            <div className={styles.formFooter}>
              <button type="button" className={styles.backLink}
                onClick={() => { setStep('code'); setError(''); setNewPassword(''); setConfirmPass('') }}>
                ← Use different code
              </button>
            </div>
          </form>
        )}

        {/* ── Step 2b: Returning user — normal password ───────────────── */}
        {step === 'password' && profileInfo && (
          <form onSubmit={handlePasswordSubmit} className={styles.form}>
            <ProfileCard />

            <div className={styles.formHeader}>
              <h2>Enter your password</h2>
              <p>Welcome back! Please verify your identity.</p>
            </div>

            <div className={styles.inputGroup}>
              <label className={styles.label}>Password</label>
              <div className={styles.inputWrap}>
                <LockIcon size={16} color="var(--text-muted)" className={styles.inputIcon} />
                <input
                  className={styles.input}
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoFocus
                />
                <button type="button" className={styles.eyeBtn} onClick={() => setShowPass(!showPass)} tabIndex={-1}>
                  {showPass ? <EyeOffIcon size={16} color="var(--text-muted)" /> : <EyeIcon size={16} color="var(--text-muted)" />}
                </button>
              </div>
            </div>

            {error && <p className={styles.error}>{error}</p>}

            <button type="submit" className={styles.submitBtn} disabled={loading || !password}>
              {loading ? <span className={styles.spinner} /> : 'Sign In'}
            </button>

            <div className={styles.formFooter}>
              <button type="button" className={styles.backLink}
                onClick={() => { setStep('code'); setError(''); setPassword('') }}>
                ← Use different code
              </button>
              <a href="/forgot-password" className={styles.forgotLink}>Forgot password?</a>
            </div>
          </form>
        )}

        <p className={styles.footer}>
          Powered by <strong>SchoolOS</strong> · Built for Nigerian Schools
        </p>
      </div>
    </div>
  )
}
