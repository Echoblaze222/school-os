'use client'
// src/app/login/page.tsx
// The cinematic splash now lives solely at /splash — it plays once, then
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
  XIcon, ChevronRightIcon, ChevronDownIcon, KeyIcon, LockIcon,
} from '@/components/Icons'

type Tab       = 'login' | 'register'
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
  const [tab,       setTab]       = useState<Tab>('login')
  const [mounted,   setMounted]   = useState(false)
  const [school,    setSchool]    = useState<SelectedSchool | null>(null)
  const [loginMode, setLoginMode] = useState<LoginMode>('existing')
  const [isTimeout, setIsTimeout] = useState(false)
  const [helpOpen,  setHelpOpen]  = useState(false)

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
    const params = new URLSearchParams(window.location.search)
    if (params.get('reason') === 'timeout') setIsTimeout(true)

    const stored = localStorage.getItem(SCHOOL_KEY)
    if (!stored) {
      // No school selected — this page can't be reached without one.
      // Send them to pick a school first (deep link, back button, bookmark, etc.)
      router.replace('/select-school')
      return
    }
    try { setSchool(JSON.parse(stored)) } catch {
      router.replace('/select-school')
      return
    }

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

        // Wait for the session cookie to be written before navigating.
        // Without this, server-side routes on the next page (e.g. set-pin)
        // call auth.getUser() before the cookie exists and return 401.
        await supabase.auth.getSession()

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

  // Still resolving whether a school is selected — render nothing rather
  // than flash the login form before a possible redirect to /select-school.
  if (checkingSchool) {
    return <div className={styles.schoolCheckGate} />
  }

  return (
    <>
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
            <button
              type="button"
              className={styles.needHelpBtn}
              onClick={() => setHelpOpen(true)}
              aria-label="Need help?"
            >
              <SparklesIcon size={14} />
              <span>Need help?</span>
            </button>
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

        {/* ── APP FOOTER (compact by default — full marketing info collapses) ── */}
        <footer className={styles.siteFooter}>

          <details className={styles.footerDetails}>
            <summary className={styles.footerSummary}>
              About SchoolOS <ChevronDownIcon size={12} />
            </summary>

            <div className={styles.footerAbout}>
              <p className={styles.footerTagline}>
                Nigeria's most comprehensive multi-role school management platform — built for principals,
                teachers, bursars, secretaries, students, and parents. Every role. One platform.
              </p>
            </div>

            <div className={styles.footerBadges}>
              <span className={styles.footerBadge}><SchoolIcon size={11} /> Built for Nigeria</span>
              <span className={styles.footerBadge}><UsersIcon size={11} /> 6 Role Dashboards</span>
              <span className={styles.footerBadge}><SparklesIcon size={11} /> AI-Powered</span>
              <span className={styles.footerBadge}><CreditCardIcon size={11} /> Paystack Payments</span>
              <span className={styles.footerBadge}><PhoneIcon size={11} /> Mobile-First</span>
              <span className={styles.footerBadge}><ShieldIcon size={11} /> Bank-Grade Security</span>
            </div>

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

            <div className={styles.footerLinks}>
              <Link href="/about" className={styles.footerLink}>About</Link>
              <div className={styles.footerDotSep} />
              <Link href="/pricing" className={styles.footerLink}>Pricing</Link>
              <div className={styles.footerDotSep} />
              <a href="mailto:piussimon717@gmail.com" className={styles.footerLink}>Contact Us</a>
            </div>
          </details>

          {/* Always-visible essentials */}
          <div className={styles.footerEssentials}>
            <Link href="/terms" target="_blank" rel="noopener noreferrer" className={styles.footerLink}>Terms</Link>
            <div className={styles.footerDotSep} />
            <Link href="/privacy" target="_blank" rel="noopener noreferrer" className={styles.footerLink}>Privacy</Link>
          </div>
          <p className={styles.footerCopy}>
            © 2026 SchoolOS by Echoblaze · Built in Nigeria for Nigerian Schools
          </p>

        </footer>

        </div>{/* end .pageContent */}

        {/* ── NEED HELP PANEL ── */}
        {helpOpen && (
          <div className={styles.helpOverlay} onClick={() => setHelpOpen(false)}>
            <div className={styles.helpPanel} onClick={e => e.stopPropagation()}>
              <div className={styles.helpHeader}>
                <div className={styles.helpHeaderText}>
                  <SparklesIcon size={16} />
                  <span>Need a hand?</span>
                </div>
                <button className={styles.helpCloseBtn} onClick={() => setHelpOpen(false)} aria-label="Close">
                  <XIcon size={16} />
                </button>
              </div>

              <div className={styles.helpBody}>
                <button
                  type="button"
                  className={styles.helpItem}
                  onClick={() => { setHelpOpen(false); setTab('login'); setLoginMode('new-user') }}
                >
                  <span className={styles.helpItemIcon}><KeyIcon size={15} /></span>
                  <span className={styles.helpItemText}>
                    <strong>I have an access code but haven't signed in before</strong>
                    <em>Use the "New User" tab to set your password.</em>
                  </span>
                  <ChevronRightIcon size={14} />
                </button>

                <button
                  type="button"
                  className={styles.helpItem}
                  onClick={() => { setHelpOpen(false); router.push('/forgot-password') }}
                >
                  <span className={styles.helpItemIcon}><LockIcon size={15} /></span>
                  <span className={styles.helpItemText}>
                    <strong>I forgot my password</strong>
                    <em>Reset it with your email in a couple of taps.</em>
                  </span>
                  <ChevronRightIcon size={14} />
                </button>

                <button
                  type="button"
                  className={styles.helpItem}
                  onClick={() => { setHelpOpen(false); router.push('/select-school') }}
                >
                  <span className={styles.helpItemIcon}><SchoolIcon size={15} /></span>
                  <span className={styles.helpItemText}>
                    <strong>My school isn't in the list</strong>
                    <em>Search again, or register a new school.</em>
                  </span>
                  <ChevronRightIcon size={14} />
                </button>

                <a href="mailto:piussimon717@gmail.com" className={styles.helpItem}>
                  <span className={styles.helpItemIcon}><MailIcon size={15} /></span>
                  <span className={styles.helpItemText}>
                    <strong>Still stuck? Contact support</strong>
                    <em>piussimon717@gmail.com</em>
                  </span>
                  <ChevronRightIcon size={14} />
                </a>
              </div>

              <p className={styles.helpFootnote}>
                Once you're signed in, the full AI Assistant can walk you through anything in SchoolOS step by step.
              </p>
            </div>
          </div>
        )}

      </div>{/* end .page */}
    </>
  )
}
