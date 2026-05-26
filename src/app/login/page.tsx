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

export default function LoginPage() {
  const [code,       setCode]       = useState('')
  const [password,   setPassword]   = useState('')
  const [showPass,   setShowPass]   = useState(false)
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState('')
  const [step,       setStep]       = useState<'code' | 'password'>('code')
  const [profileInfo, setProfileInfo] = useState<{ full_name: string; role: string; school_name?: string } | null>(null)
  const router = useRouter()
  const supabase = createClient()

  // FIX: apply theme on mount — never set empty string
  useEffect(() => {
    const saved = localStorage.getItem('schoolos_theme') ?? 'dark'
    document.documentElement.setAttribute('data-theme', saved)
  }, [])

  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim()) return
    setLoading(true)
    setError('')

    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('id, full_name, role, email, schools(name)')
      .eq('default_code', code.trim().toUpperCase())
      .single()

    if (profileErr || !profile) {
      setError('Invalid access code. Please check and try again.')
      setLoading(false)
      return
    }

    setProfileInfo({
      full_name:   profile.full_name,
      role:        profile.role,
      school_name: (profile.schools as any)?.name,
    })
    setStep('password')
    setLoading(false)
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!password) return
    setLoading(true)
    setError('')

    // Get email from code
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

    // Check onboarding
    if (profile.onboarding_stage === 2) {
      router.push('/onboarding/stage-2')
      return
    }
    if (profile.onboarding_stage === 3) {
      router.push('/onboarding/stage-3')
      return
    }

    const dest = ROLE_ROUTES[profile.role] ?? '/dashboard/student'
    router.push(dest)
    router.refresh()
  }

  return (
    <div className={styles.page}>
      {/* Background decoration */}
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

        {/* Step indicator */}
        <div className={styles.steps}>
          <div className={`${styles.step} ${styles.stepDone}`}>
            <span>1</span>
            <p>Access Code</p>
          </div>
          <div className={styles.stepLine} />
          <div className={`${styles.step} ${step === 'password' ? styles.stepDone : ''}`}>
            <span>2</span>
            <p>Password</p>
          </div>
        </div>

        {/* Step 1: Code */}
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
                  placeholder="e.g. STU-2024-001"
                  autoComplete="off"
                  autoFocus
                  spellCheck={false}
                />
              </div>
            </div>

            {error && <p className={styles.error}>{error}</p>}

            <button
              type="submit"
              className={styles.submitBtn}
              disabled={loading || !code.trim()}
            >
              {loading ? <span className={styles.spinner} /> : 'Continue'}
            </button>

            <p className={styles.hint}>
              Forgot your code? Contact your school administrator.
            </p>
          </form>
        )}

        {/* Step 2: Password */}
        {step === 'password' && profileInfo && (
          <form onSubmit={handlePasswordSubmit} className={styles.form}>
            {/* Profile preview */}
            <div className={styles.profilePreview}>
              <div className={styles.profileAvatar}>
                {profileInfo.full_name[0]}
              </div>
              <div>
                <p className={styles.profileName}>{profileInfo.full_name}</p>
                <p className={styles.profileMeta}>
                  {profileInfo.role.charAt(0).toUpperCase() + profileInfo.role.slice(1)}
                  {profileInfo.school_name ? ` · ${profileInfo.school_name}` : ''}
                </p>
              </div>
            </div>

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
                <button
                  type="button"
                  className={styles.eyeBtn}
                  onClick={() => setShowPass(!showPass)}
                  tabIndex={-1}
                >
                  {showPass
                    ? <EyeOffIcon size={16} color="var(--text-muted)" />
                    : <EyeIcon    size={16} color="var(--text-muted)" />
                  }
                </button>
              </div>
            </div>

            {error && <p className={styles.error}>{error}</p>}

            <button
              type="submit"
              className={styles.submitBtn}
              disabled={loading || !password}
            >
              {loading ? <span className={styles.spinner} /> : 'Sign In'}
            </button>

            <div className={styles.formFooter}>
              <button type="button" className={styles.backLink} onClick={() => { setStep('code'); setError(''); setPassword('') }}>
                ← Use different code
              </button>
              <a href="/forgot-password" className={styles.forgotLink}>
                Forgot password?
              </a>
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
