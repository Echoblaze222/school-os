'use client'
// src/app/login/page.tsx

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import styles from './login.module.css'

type Tab       = 'login' | 'register'
type LoginMode = 'existing' | 'new-user'
// existing  → Email OR Access Code + password (already activated accounts)
// new-user  → Access Code + set new password (first-time activation only)

interface SelectedSchool {
  id: string
  name: string
  primaryColor: string | null
}

const SCHOOL_KEY = 'schoolos_selected_school'

export default function LoginPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [tab,       setTab]       = useState<Tab>('login')
  const [mounted,   setMounted]   = useState(false)
  const [school,    setSchool]    = useState<SelectedSchool | null>(null)
  const [loginMode, setLoginMode] = useState<LoginMode>('existing')
  const [isTimeout, setIsTimeout] = useState(false)

  // Existing user — can type email OR access code in one field
  const [identifier,   setIdentifier]   = useState('')   // email or access code
  const [password,     setPassword]     = useState('')
  const [showPass,     setShowPass]     = useState(false)
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError,   setLoginError]   = useState('')

  // New user — access code only + set new password
  const [newCode,        setNewCode]        = useState('')
  const [newPassword,    setNewPassword]    = useState('')
  const [confirmPass,    setConfirmPass]    = useState('')
  const [showNewPass,    setShowNewPass]    = useState(false)
  const [newUserLoading, setNewUserLoading] = useState(false)
  const [newUserError,   setNewUserError]   = useState('')

  // Register tab
  const [regStep,    setRegStep]    = useState(1)
  const [regLoading, setRegLoading] = useState(false)
  const [regError,   setRegError]   = useState('')
  const [regSuccess, setRegSuccess] = useState(false)
  const [reg, setReg] = useState({
    schoolName: '', schoolType: 'Secondary', address: '', city: '', state: '',
    phone: '', email: '', tagline: '', plan: 'Premium',
    principalName: '', principalEmail: '', principalPhone: '', principalPassword: '',
  })

  useEffect(() => {
    setMounted(true)
    const params = new URLSearchParams(window.location.search)
    if (params.get('reason') === 'timeout') setIsTimeout(true)
    const stored = localStorage.getItem(SCHOOL_KEY)
    if (stored) {
      try { setSchool(JSON.parse(stored)) } catch {}
    }
  }, [])

  // ── EXISTING USER LOGIN (email OR access code + password) ──
  async function handleExistingLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoginError('')
    setLoginLoading(true)

    const value = identifier.trim()

    try {
      // Detect if identifier looks like an access code (contains dash, no @)
      const isCode = !value.includes('@') && value.includes('-')

      if (isCode) {
        // Look up their email via the API, then sign in with password
        const res  = await fetch('/api/auth/code-signin', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ code: value.toUpperCase(), password }),
        })
        const data = await res.json()
        if (!res.ok) {
          setLoginError(data.error || 'Invalid code or password.')
          return
        }
        // API signed them in server-side and returns email for client sign-in
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email:    data.email,
          password: password,
        })
        if (signInErr) { setLoginError('Wrong password. Please try again.'); return }
        router.replace('/dashboard')
      } else {
        // Normal email + password sign in
        const { error } = await supabase.auth.signInWithPassword({
          email:    value,
          password: password,
        })
        if (error) { setLoginError(error.message); return }
        router.replace('/dashboard')
      }
    } catch {
      setLoginError('Something went wrong. Please try again.')
    } finally {
      setLoginLoading(false)
    }
  }

  // ── NEW USER ACTIVATION (access code + set new password) ──
  async function handleNewUserActivation(e: React.FormEvent) {
    e.preventDefault()
    setNewUserError('')

    if (newPassword !== confirmPass) {
      setNewUserError('Passwords do not match.')
      return
    }
    if (newPassword.length < 8) {
      setNewUserError('Password must be at least 8 characters.')
      return
    }

    setNewUserLoading(true)
    try {
      const res  = await fetch('/api/auth/first-login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ code: newCode.toUpperCase(), newPassword }),
      })
      const data = await res.json()

      if (!res.ok) {
        if (data.already_activated) {
          setNewUserError('This account is already activated. Use the Sign In tab with your access code and password.')
        } else {
          setNewUserError(data.error || 'Something went wrong.')
        }
        return
      }

      if (data.success) {
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email:    data.email,
          password: newPassword,
        })
        if (signInErr) { setNewUserError('Activation done but sign-in failed. Try signing in now.'); return }

        const stage = data.onboarding_stage
        router.replace(
          stage === 'stage_1_pending' ? '/onboarding/stage-1' :
          stage === 2                 ? '/onboarding/pin-setup' : '/dashboard'
        )
      }
    } catch {
      setNewUserError('Something went wrong. Please try again.')
    } finally {
      setNewUserLoading(false)
    }
  }

  // ── REGISTER ──
  function updateReg(field: string, value: string) {
    setReg(prev => ({ ...prev, [field]: value }))
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setRegError('')
    setRegLoading(true)
    try {
      const res = await fetch('/api/schools/register', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          school: {
            name: reg.schoolName, school_type: reg.schoolType,
            address: reg.address, city: reg.city, state: reg.state,
            phone: reg.phone, email: reg.email, tagline: reg.tagline,
          },
          plan: reg.plan,
          principal: {
            name: reg.principalName, full_name: reg.principalName,
            email: reg.principalEmail,
            phone: reg.principalPhone, password: reg.principalPassword,
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) { setRegError(data.error || 'Registration failed.'); return }
      if (data.paymentUrl) {
        window.location.href = data.paymentUrl
      } else {
        setRegSuccess(true)
      }
    } catch {
      setRegError('Registration failed. Please try again.')
    } finally {
      setRegLoading(false)
    }
  }

  const PLAN_PRICES: Record<string, string> = {
    Basic: '₦50,000/term', Premium: '₦120,000/term', Elite: '₦250,000/term'
  }
  const STATES = [
    'Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno',
    'Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','FCT','Gombe','Imo',
    'Jigawa','Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos','Nasarawa',
    'Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto','Taraba',
    'Yobe','Zamfara'
  ]

  return (
    <div className={styles.page}>
      <div className={styles.bgGlow} />
      <div className={styles.bgGrid} />

      <div className={`${styles.card} ${mounted ? styles.visible : ''}`}>

        {/* Top bar */}
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

        {/* Main tabs: Sign In / Register School */}
        <div className={styles.tabs}>
          <button
            className={`${styles.tabBtn} ${tab === 'login' ? styles.tabActive : ''}`}
            onClick={() => setTab('login')}
          >
            Sign In
          </button>
          <button
            className={`${styles.tabBtn} ${tab === 'register' ? styles.tabActive : ''}`}
            onClick={() => setTab('register')}
          >
            Register School
          </button>
          <div className={`${styles.tabIndicator} ${tab === 'register' ? styles.tabRight : ''}`} />
        </div>

        {/* ── SIGN IN TAB ── */}
        {tab === 'login' && (
          <div className={styles.formWrap}>

            {/* Mode toggle */}
            <div className={styles.modeToggle}>
              <button
                className={`${styles.modeBtn} ${loginMode === 'existing' ? styles.modeBtnActive : ''}`}
                onClick={() => { setLoginMode('existing'); setLoginError(''); setNewUserError('') }}
              >
                📧 Email / Access Code
              </button>
              <button
                className={`${styles.modeBtn} ${loginMode === 'new-user' ? styles.modeBtnActive : ''}`}
                onClick={() => { setLoginMode('new-user'); setLoginError(''); setNewUserError('') }}
              >
                🆕 New User
              </button>
            </div>

            {/* ── EXISTING USER FORM ── */}
            {loginMode === 'existing' && (
              <form onSubmit={handleExistingLogin} className={styles.form}>
                <div className={styles.accessCodeNote}>
                  Sign in with your <strong>email</strong> or <strong>access code</strong> and your password.
                </div>

                {loginError && <div className={styles.errorBanner}>{loginError}</div>}

                <label className={styles.label}>Email or Access Code</label>
                <input
                  type="text"
                  value={identifier}
                  onChange={e => setIdentifier(e.target.value)}
                  className={styles.input}
                  placeholder="you@school.edu.ng or PRIN-528-F0A"
                  required
                  autoComplete="off"
                  autoCapitalize="off"
                />

                <label className={styles.label}>Password</label>
                <div className={styles.passWrap}>
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className={styles.input}
                    placeholder="Enter your password"
                    required
                    autoComplete="current-password"
                  />
                  <button type="button" className={styles.eyeBtn} onClick={() => setShowPass(!showPass)} tabIndex={-1}>
                    {showPass ? '🙈' : '👁️'}
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

            {/* ── NEW USER FORM ── */}
            {loginMode === 'new-user' && (
              <form onSubmit={handleNewUserActivation} className={styles.form}>
                <div className={styles.accessCodeNote}>
                  First time? Enter your access code from your administrator and create your password.
                </div>

                {newUserError && <div className={styles.errorBanner}>{newUserError}</div>}

                <label className={styles.label}>Access Code</label>
                <input
                  type="text"
                  value={newCode}
                  onChange={e => setNewCode(e.target.value.toUpperCase())}
                  className={`${styles.input} ${styles.codeInput}`}
                  placeholder="e.g. TCH-AB12-XY"
                  required
                  autoComplete="off"
                  maxLength={16}
                />

                <label className={styles.label}>Set New Password</label>
                <div className={styles.passWrap}>
                  <input
                    type={showNewPass ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className={styles.input}
                    placeholder="Min. 8 characters"
                    required
                    minLength={8}
                  />
                  <button type="button" className={styles.eyeBtn} onClick={() => setShowNewPass(!showNewPass)} tabIndex={-1}>
                    {showNewPass ? '🙈' : '👁️'}
                  </button>
                </div>

                <label className={styles.label}>Confirm Password</label>
                <div className={styles.passWrap}>
                  <input
                    type={showNewPass ? 'text' : 'password'}
                    value={confirmPass}
                    onChange={e => setConfirmPass(e.target.value)}
                    className={styles.input}
                    placeholder="Repeat your password"
                    required
                    minLength={8}
                  />
                </div>

                <button type="submit" className={styles.submitBtn} disabled={newUserLoading}>
                  {newUserLoading ? <span className={styles.btnSpinner} /> : 'Activate Account'}
                </button>
              </form>
            )}
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
                        <option>Primary</option>
                        <option>Secondary</option>
                        <option>Tertiary</option>
                        <option>Vocational</option>
                        <option>International</option>
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

                      <label className={styles.label}>Subscription Plan</label>
                      <div className={styles.planGrid}>
                        {(['Basic','Premium','Elite'] as const).map(p => (
                          <div
                            key={p}
                            className={`${styles.planCard} ${reg.plan === p ? styles.planActive : ''}`}
                            onClick={() => updateReg('plan', p)}
                          >
                            <span className={styles.planName}>{p}</span>
                            <span className={styles.planPrice}>{PLAN_PRICES[p]}</span>
                          </div>
                        ))}
                      </div>
                      <div className={styles.registrationFeeNote}>+ ₦25,000 one-time registration fee</div>

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
                          type={showPass ? 'text' : 'password'}
                          className={styles.input} required minLength={8}
                          value={reg.principalPassword}
                          onChange={e => updateReg('principalPassword', e.target.value)}
                          placeholder="Min. 8 characters"
                        />
                        <button type="button" className={styles.eyeBtn}
                          onClick={() => setShowPass(!showPass)} tabIndex={-1}>
                          {showPass ? '🙈' : '👁️'}
                        </button>
                      </div>

                      <div className={styles.summaryBox}>
                        <p className={styles.summaryTitle}>Registration Summary</p>
                        <p className={styles.summaryLine}><span>School:</span> {reg.schoolName}</p>
                        <p className={styles.summaryLine}><span>Plan:</span> {reg.plan}</p>
                        <p className={styles.summaryLine}><span>Plan fee:</span> {PLAN_PRICES[reg.plan]}</p>
                        <p className={styles.summaryLine}><span>Reg fee:</span> ₦25,000</p>
                      </div>

                      <div className={styles.regBtnRow}>
                        <button type="button" className={styles.backBtn} onClick={() => setRegStep(1)}>← Back</button>
                        <button type="submit" className={styles.submitBtn} disabled={regLoading}>
                          {regLoading ? <span className={styles.btnSpinner} /> : 'Register & Pay'}
                        </button>
                      </div>
                    </>
                  )}
                </form>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
