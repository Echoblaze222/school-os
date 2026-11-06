'use client'

import { useState, useEffect, useRef } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import AnimatedLogo from '@/components/AnimatedLogo'
import { ripple } from '@/lib/ripple'
import motion from '@/components/dashboard-motion.module.css'
import {
  CheckIcon, SchoolIcon, AlertIcon, ArrowLeftIcon, ArrowRightIcon,
} from '@/components/Icons'
import styles from './register-school.module.css'
import wiz from './wizard.module.css'

const SCHOOL_TYPES = ['secondary', 'primary', 'combined']

// Registration is free. Every school gets the same full feature set.
const ALL_FEATURES_INCLUDED = [
  'Full student, staff & parent portal', 'Fee management', 'Results & assignments',
  'AI Tutor for all roles', 'Live online classes', 'WhatsApp & SMS notifications',
  'AI face-match NIN verification', 'Priority support',
]

const GETTING_STARTED_STEPS = [
  { title: 'Log in to your portal',       body: 'Go to Select School, find your school, and sign in with your principal email and password.' },
  { title: 'Finish your verification',    body: 'Complete the short onboarding stages the first time you sign in (terms and identity verification).' },
  { title: 'Review subjects and classes', body: 'Default subjects are already added for you. Create your classes and adjust subjects to match your school.' },
  { title: 'Add staff and students',      body: 'Use the Secretary dashboard to add teachers, students and parents, then share their access codes.' },
  { title: 'Set up fees and results',     body: 'Configure fee structures with your bursar and let teachers start recording results and assignments.' },
]

// One short page per step so nobody gets lost in a long form.
const STEP_LABELS = ['School', 'Location', 'Contact', 'Look', 'Logo', 'Principal', 'Secure']
const TOTAL = STEP_LABELS.length
const LINE_MS = 550 // how long the string takes to reach the next dot

const NIGERIAN_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue',
  'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu',
  'FCT Abuja', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina',
  'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo',
  'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara',
]

export default function RegisterSchoolPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [phase, setPhase] = useState<'form' | 'welcome' | 'guide'>('form')
  const [step, setStep]   = useState(1)       // page currently shown
  const [fillTo, setFillTo] = useState(1)     // dot the string is drawn up to
  const [dir, setDir]     = useState<'fwd' | 'back'>('fwd')
  const [moving, setMoving] = useState(false) // string is travelling to the next dot
  const [mounted, setMounted] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // School
  const [schoolName, setSchoolName] = useState('')
  const [schoolType, setSchoolType] = useState('secondary')
  // Location
  const [state,   setState]   = useState('')
  const [city,    setCity]    = useState('')
  const [address, setAddress] = useState('')
  // Contact
  const [email,   setEmail]   = useState('')
  const [phone,   setPhone]   = useState('')
  const [tagline, setTagline] = useState('')
  // Look
  const [primaryColor, setPrimaryColor] = useState('#800020')
  const [fontFamily,   setFontFamily]   = useState('DM Sans')
  // Logo
  const [logoFile,    setLogoFile]    = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [bgPreview,   setBgPreview]   = useState<string | null>(null)
  // Principal
  const [principalName,  setPrincipalName]  = useState('')
  const [principalEmail, setPrincipalEmail] = useState('')
  const [principalPhone, setPrincipalPhone] = useState('')
  // Secure
  const [principalPassword, setPrincipalPassword] = useState('')
  const [agreedToTerms, setAgreedToTerms] = useState(false)

  // Result
  const [registeredName, setRegisteredName] = useState('')
  const [accessCode,     setAccessCode]     = useState('')

  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const logoInputRef = useRef<HTMLInputElement>(null)
  const bgInputRef   = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setMounted(true)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [])

  function handleImageSelect(file: File, type: 'logo' | 'bg') {
    const reader = new FileReader()
    reader.onload = e => {
      if (type === 'logo') {
        setLogoFile(file)
        setLogoPreview(e.target?.result as string)
      } else {
        setBgPreview(e.target?.result as string)
      }
    }
    reader.readAsDataURL(file)
  }

  // Returns an error message, or null when the current page is fine.
  function validate(s: number): string | null {
    if (s === 1 && !schoolName.trim()) return 'School name is required.'
    if (s === 2) {
      if (!state.trim()) return 'Please select your state.'
      if (!city.trim())  return 'City is required.'
    }
    if (s === 3) {
      if (!email.trim()) return 'School email is required.'
      if (!email.includes('@')) return 'Please enter a valid email address.'
    }
    if (s === 6) {
      if (!principalName.trim())  return 'Principal name is required.'
      if (!principalEmail.trim()) return 'Principal email is required.'
      if (!principalEmail.includes('@')) return 'Please enter a valid email.'
    }
    if (s === 7) {
      if (principalPassword.length < 8) return 'Password must be at least 8 characters.'
      if (!agreedToTerms) return 'You must agree to the Terms & Conditions and Privacy Policy to register your school.'
    }
    return null
  }

  // Forward: the string draws to the next dot FIRST, then the page changes.
  function goNext() {
    if (moving) return
    const err = validate(step)
    if (err) { setError(err); return }
    setError(null)
    const target = step + 1
    setDir('fwd')
    setMoving(true)
    setFillTo(target)
    timer.current = setTimeout(() => {
      setStep(target)
      setMoving(false)
    }, LINE_MS)
  }

  function goBack() {
    if (moving || step === 1) return
    setError(null)
    setDir('back')
    setFillTo(step - 1)
    setStep(step - 1)
  }

  async function handleSubmit() {
    const err = validate(7)
    if (err) { setError(err); return }
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/schools/register', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          school: {
            name:          schoolName.trim(),
            school_type:   schoolType,
            address:       address.trim(),
            city:          city.trim(),
            state:         state.trim(),
            phone:         phone.trim(),
            email:         email.trim(),
            tagline:       tagline.trim(),
            primary_color: primaryColor,
            font_family:   fontFamily,
          },
          principal: {
            full_name: principalName.trim(),
            email:     principalEmail.trim(),
            password:  principalPassword,
            phone:     principalPhone.trim(),
            agreedToTerms,
          },
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error ?? 'Registration failed. Please try again.')
        setLoading(false)
        return
      }

      if (logoFile && data.schoolId) {
        const logoExt = logoFile.name.split('.').pop()
        await supabase.storage
          .from('school-assets')
          .upload(`${data.schoolId}/logo.${logoExt}`, logoFile, { upsert: true })
      }

      setPrincipalPassword('')
      setRegisteredName(data.schoolName ?? schoolName.trim())
      setAccessCode(data.defaultCode ?? '')
      setLoading(false)
      setPhase('welcome')
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (step < TOTAL) goNext()
    else handleSubmit()
  }

  const allDone   = phase !== 'form'
  const progress  = allDone ? 1 : (fillTo - 1) / (TOTAL - 1)
  const pageClass = `${wiz.page} ${dir === 'fwd' ? wiz.fwd : wiz.back}`

  return (
    <div className={styles.page}>
      <div className={styles.bgGlow} />
      <div className={styles.bgGrid} />

      <div className={`${styles.content} ${mounted ? styles.visible : ''}`}>

        {phase === 'form' && (
          <button
            type="button"
            className={`${styles.topBackBtn} ${motion.focusable}`}
            onClick={() => router.push('/select-school')}
            aria-label="Back to select school"
          >
            <ArrowLeftIcon size={15} /> Select School
          </button>
        )}

        <div className={styles.brandBlock}>
          <AnimatedLogo size={52} variant="dark-bg" className={styles.brandLogo} />
          <h1 className={styles.brandName}>School<span className={styles.brandAccent}>OS</span></h1>
          <p className={styles.headerSubtitle}>
            {phase === 'form' ? 'Register Your School, Free' : 'Welcome aboard'}
          </p>
        </div>

        {/* Progress string: dots joined by a line that draws as you go */}
        <div
          className={wiz.track}
          style={{ '--p': progress } as CSSProperties}
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={TOTAL}
          aria-valuenow={allDone ? TOTAL : step}
        >
          <div className={wiz.line} />
          <div className={wiz.fill} />
          {STEP_LABELS.map((label, i) => {
            const n = i + 1
            const done   = allDone || n < step
            const active = !allDone && n === step
            return (
              <div
                key={label}
                title={label}
                className={`${wiz.node} ${done ? wiz.nodeDone : ''} ${active ? wiz.nodeActive : ''}`}
              >
                {done ? <CheckIcon size={13} color="#1C93AC" /> : n}
              </div>
            )
          })}
        </div>
        {phase === 'form' && (
          <p className={wiz.caption}>
            Step <strong>{step}</strong> of {TOTAL} &middot; {STEP_LABELS[step - 1]}
          </p>
        )}

        <div className={styles.card}>

          {phase === 'form' && (
            <form onSubmit={onSubmit} noValidate style={{ display: 'contents' }}>
              <div key={step} className={pageClass}>

                {/* 1 — School */}
                {step === 1 && (
                  <>
                    <h2 className={styles.stepTitle}>What's your school called?</h2>
                    <p className={styles.stepSubtitle}>Let's start with the basics.</p>
                    <div className={wiz.fields}>
                      <div className={styles.field}>
                        <label className={styles.label}>School Name *</label>
                        <input autoFocus type="text" className={styles.formInput} value={schoolName}
                          onChange={e => setSchoolName(e.target.value)}
                          placeholder="e.g. Kings College Lagos" />
                      </div>
                      <div className={styles.field}>
                        <label className={styles.label}>School Type *</label>
                        <select className={`${styles.formInput} ${styles.formSelect}`} value={schoolType} onChange={e => setSchoolType(e.target.value)}>
                          {SCHOOL_TYPES.map(t => (
                            <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </>
                )}

                {/* 2 — Location */}
                {step === 2 && (
                  <>
                    <h2 className={styles.stepTitle}>Where is {schoolName || 'your school'}?</h2>
                    <p className={styles.stepSubtitle}>Parents use this to find your school.</p>
                    <div className={wiz.fields}>
                      <div className={wiz.row2}>
                        <div className={styles.field}>
                          <label className={styles.label}>State *</label>
                          <select autoFocus className={`${styles.formInput} ${styles.formSelect}`} value={state} onChange={e => setState(e.target.value)}>
                            <option value="">Select state</option>
                            {NIGERIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                        <div className={styles.field}>
                          <label className={styles.label}>City *</label>
                          <input type="text" className={styles.formInput} value={city}
                            onChange={e => setCity(e.target.value)} placeholder="e.g. Lagos Island" />
                        </div>
                      </div>
                      <div className={styles.field}>
                        <label className={styles.label}>Street Address</label>
                        <input type="text" className={styles.formInput} value={address}
                          onChange={e => setAddress(e.target.value)} placeholder="Full street address (optional)" />
                      </div>
                    </div>
                  </>
                )}

                {/* 3 — Contact */}
                {step === 3 && (
                  <>
                    <h2 className={styles.stepTitle}>How can people reach you?</h2>
                    <p className={styles.stepSubtitle}>We'll use this for school notices and support.</p>
                    <div className={wiz.fields}>
                      <div className={styles.field}>
                        <label className={styles.label}>School Email *</label>
                        <input autoFocus type="email" className={styles.formInput} value={email}
                          onChange={e => setEmail(e.target.value)} placeholder="admin@yourschool.edu.ng" />
                      </div>
                      <div className={styles.field}>
                        <label className={styles.label}>Phone</label>
                        <input type="tel" className={styles.formInput} value={phone}
                          onChange={e => setPhone(e.target.value)} placeholder="08012345678" />
                      </div>
                      <div className={styles.field}>
                        <label className={styles.label}>Tagline</label>
                        <input type="text" className={styles.formInput} value={tagline}
                          onChange={e => setTagline(e.target.value)}
                          placeholder="e.g. Excellence in Education" maxLength={80} />
                      </div>
                    </div>
                  </>
                )}

                {/* 4 — Look */}
                {step === 4 && (
                  <>
                    <h2 className={styles.stepTitle}>Pick your school colour</h2>
                    <p className={styles.stepSubtitle}>It appears on buttons, headers and accents across your portal.</p>
                    <div className={wiz.fields}>
                      <div className={styles.colorPickerRow}>
                        <input type="color" className={styles.colorInput} value={primaryColor}
                          onChange={e => setPrimaryColor(e.target.value)} />
                        <div className={styles.colorPreview} style={{ background: primaryColor }} />
                        <span className={styles.colorHex}>{primaryColor.toUpperCase()}</span>
                      </div>
                      <div className={styles.colorPresets}>
                        {['#800020', '#1A3C6B', '#2D6A2D', '#8B4513', '#4A148C', '#006064', '#B71C1C', '#1B5E20'].map(color => (
                          <button key={color} type="button"
                            aria-label={`Use colour ${color}`}
                            className={`${styles.colorPreset} ${primaryColor === color ? styles.colorPresetActive : ''}`}
                            style={{ background: color }}
                            onClick={() => setPrimaryColor(color)} />
                        ))}
                      </div>
                      <div className={styles.field}>
                        <label className={styles.label}>Portal Font</label>
                        <select className={`${styles.formInput} ${styles.formSelect}`} value={fontFamily} onChange={e => setFontFamily(e.target.value)}>
                          <option value="DM Sans">DM Sans (Modern, clean)</option>
                          <option value="Poppins">Poppins (Friendly, rounded)</option>
                          <option value="Inter">Inter (Professional, minimal)</option>
                          <option value="Playfair Display">Playfair Display (Elegant, classic)</option>
                          <option value="Roboto">Roboto (Standard, reliable)</option>
                        </select>
                      </div>
                      <div className={styles.previewBox}>
                        <p className={styles.previewLabel}>Preview</p>
                        <div className={styles.previewCard}>
                          <div className={styles.previewHeader} style={{ background: primaryColor }}>
                            <span style={{ fontFamily }}>{schoolName || 'SchoolOS Portal'}</span>
                          </div>
                          <div className={styles.previewBody}>
                            <div className={styles.previewBtn} style={{ background: primaryColor }} />
                            <div className={styles.previewText} />
                            <div className={styles.previewText} style={{ width: '60%' }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* 5 — Logo */}
                {step === 5 && (
                  <>
                    <h2 className={styles.stepTitle}>Add your logo</h2>
                    <p className={styles.stepSubtitle}>Optional. You can skip this and add it later.</p>
                    <div className={wiz.fields}>
                      <div className={styles.field}>
                        <label className={styles.label}>School Logo</label>
                        <div className={styles.logoUpload} onClick={() => logoInputRef.current?.click()}>
                          {logoPreview ? (
                            <img src={logoPreview} alt="Logo" className={styles.logoPreview} />
                          ) : (
                            <div className={styles.logoPlaceholder} style={{ background: primaryColor }}>
                              <span>{schoolName[0]?.toUpperCase() || 'S'}</span>
                            </div>
                          )}
                          <div className={styles.logoUploadText}>
                            <p>{logoPreview ? 'Tap to change logo' : 'Tap to upload logo'}</p>
                            <p className={styles.hint}>PNG or SVG recommended &middot; Max 2MB</p>
                          </div>
                        </div>
                        <input ref={logoInputRef} type="file" accept="image/*" className={styles.hiddenInput}
                          onChange={e => { const f = e.target.files?.[0]; if (f) handleImageSelect(f, 'logo') }} />
                      </div>
                      <div className={styles.field}>
                        <label className={styles.label}>Login Page Background</label>
                        <div
                          className={`${styles.bgUpload} ${bgPreview ? styles.bgUploaded : ''}`}
                          onClick={() => bgInputRef.current?.click()}
                          style={bgPreview ? { backgroundImage: `url(${bgPreview})` } : {}}
                        >
                          {!bgPreview ? (
                            <div className={styles.bgPlaceholder}>
                              <SchoolIcon size={26} color="rgba(255,255,255,0.35)" />
                              <p>Upload your school building photo</p>
                              <p className={styles.hint}>This appears behind the login card</p>
                            </div>
                          ) : (
                            <div className={styles.bgOverlay}><span>Tap to change</span></div>
                          )}
                        </div>
                        <input ref={bgInputRef} type="file" accept="image/*" className={styles.hiddenInput}
                          onChange={e => { const f = e.target.files?.[0]; if (f) handleImageSelect(f, 'bg') }} />
                      </div>
                    </div>
                  </>
                )}

                {/* 6 — Principal */}
                {step === 6 && (
                  <>
                    <h2 className={styles.stepTitle}>Who's the principal?</h2>
                    <p className={styles.stepSubtitle}>This person becomes the main administrator of {schoolName || 'your school'}.</p>
                    <div className={wiz.fields}>
                      <div className={styles.field}>
                        <label className={styles.label}>Full Name *</label>
                        <input autoFocus type="text" className={styles.formInput} value={principalName}
                          onChange={e => setPrincipalName(e.target.value)} placeholder="e.g. Dr. Chukwuemeka Obi" />
                      </div>
                      <div className={styles.field}>
                        <label className={styles.label}>Email *</label>
                        <input type="email" className={styles.formInput} value={principalEmail}
                          onChange={e => setPrincipalEmail(e.target.value)} placeholder="principal@yourschool.edu.ng" />
                      </div>
                      <div className={styles.field}>
                        <label className={styles.label}>Phone</label>
                        <input type="tel" className={styles.formInput} value={principalPhone}
                          onChange={e => setPrincipalPhone(e.target.value)} placeholder="08012345678" />
                      </div>
                    </div>
                  </>
                )}

                {/* 7 — Secure */}
                {step === 7 && (
                  <>
                    <h2 className={styles.stepTitle}>Secure your account</h2>
                    <p className={styles.stepSubtitle}>Last step. Choose a password and you're in. It's free.</p>
                    <div className={wiz.fields}>
                      <div className={styles.field}>
                        <label className={styles.label}>Password *</label>
                        <input autoFocus type="password" className={styles.formInput} value={principalPassword}
                          onChange={e => setPrincipalPassword(e.target.value)} placeholder="Min. 8 characters" />
                      </div>
                      <div className={wiz.recap}>
                        <div><span>School</span><strong>{schoolName}</strong></div>
                        <div><span>Location</span><strong>{city}, {state}</strong></div>
                        <div><span>Principal</span><strong>{principalName}</strong></div>
                        <div><span>Registration fee</span><strong>Free</strong></div>
                      </div>
                      <label className={styles.termsCheck} style={{ marginTop: 0 }}>
                        <input type="checkbox" checked={agreedToTerms} onChange={e => setAgreedToTerms(e.target.checked)} />
                        <span>
                          I have read and agree to the{' '}
                          <Link href="/terms" target="_blank" rel="noopener noreferrer">Terms &amp; Conditions</Link>
                          {' '}and{' '}
                          <Link href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</Link>
                          , on behalf of {schoolName || 'my school'}.
                        </span>
                      </label>
                    </div>
                  </>
                )}
              </div>

              {error && (
                <div className={styles.error}>
                  <AlertIcon size={15} color="#FCA5A5" />
                  <span>{error}</span>
                </div>
              )}

              <div className={styles.btnRow}>
                {step > 1 && (
                  <button type="button" className={`${styles.backBtn} ${motion.focusable}`}
                    onClick={goBack} disabled={moving}>
                    <ArrowLeftIcon size={15} /> Back
                  </button>
                )}
                <button
                  type="submit"
                  className={`${styles.nextBtn} ${motion.rippleHost} ${motion.focusable}`}
                  onMouseDown={ripple(motion)}
                  disabled={loading || moving}
                >
                  {step < TOTAL
                    ? <>{step === 5 && !logoPreview ? 'Skip for now' : 'Continue'} <ArrowRightIcon size={15} /></>
                    : loading ? 'Registering...' : <>Register for free <ArrowRightIcon size={15} /></>}
                </button>
              </div>
            </form>
          )}

          {/* Welcome card */}
          {phase === 'welcome' && (
            <div className={`${wiz.page} ${wiz.fwd}`}>
              <h2 className={styles.stepTitle}>Welcome to SchoolOS, {registeredName}! 🎉</h2>
              <p className={styles.stepSubtitle}>
                Your school is registered and already live. Registration is free, and everything below is included from day one.
              </p>
              <ul className={styles.planFeatures}>
                {ALL_FEATURES_INCLUDED.map((f, i) => (
                  <li key={i}><CheckIcon size={13} color={primaryColor} /> {f}</li>
                ))}
              </ul>
              <div className={styles.btnRow}>
                <button type="button"
                  className={`${styles.nextBtn} ${motion.rippleHost} ${motion.focusable}`}
                  onClick={() => setPhase('guide')} onMouseDown={ripple(motion)}>
                  Show me how to get started <ArrowRightIcon size={15} />
                </button>
              </div>
            </div>
          )}

          {/* Getting-started card */}
          {phase === 'guide' && (
            <div className={`${wiz.page} ${wiz.fwd}`}>
              <h2 className={styles.stepTitle}>Getting started with SchoolOS</h2>
              <p className={styles.stepSubtitle}>Five quick steps to get {registeredName} up and running.</p>
              <div className={wiz.fields}>
                {GETTING_STARTED_STEPS.map((s, i) => (
                  <div key={i} className={wiz.guideStep}>
                    <div className={wiz.guideNum}>{i + 1}</div>
                    <div className={wiz.guideText}>{s.title}<span>{s.body}</span></div>
                  </div>
                ))}
              </div>
              {accessCode && (
                <div className={wiz.codeBox}>
                  <p className={styles.label}>Your principal access code</p>
                  <p className={wiz.code}>{accessCode}</p>
                  <p className={styles.hint}>Keep this safe. You may be asked for it the first time you sign in.</p>
                </div>
              )}
              <div className={styles.btnRow}>
                <button type="button" className={`${styles.backBtn} ${motion.focusable}`} onClick={() => setPhase('welcome')}>
                  <ArrowLeftIcon size={15} /> Back
                </button>
                <button type="button"
                  className={`${styles.nextBtn} ${motion.rippleHost} ${motion.focusable}`}
                  onClick={() => router.push('/select-school')} onMouseDown={ripple(motion)}>
                  Go to my portal <ArrowRightIcon size={15} />
                </button>
              </div>
            </div>
          )}

        </div>
      </div>

      <div className={styles.poweredBy}>
        Powered by <strong>SchoolOS</strong>
      </div>
    </div>
  )
}
