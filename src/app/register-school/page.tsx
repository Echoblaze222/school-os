'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import styles from './register-school.module.css'

const SCHOOL_TYPES = ['secondary', 'primary', 'combined']

const PLANS = [
  {
    id:       'Basic',
    label:    'Basic',
    price:    50000,
    students: 'Up to 200 students',
    features: ['Core portal', 'Fee management', 'Results system', 'Assignments', 'Timetable'],
    color:    '#2471A3',
  },
  {
    id:       'Premium',
    label:    'Premium',
    price:    120000,
    students: 'Up to 500 students',
    features: ['Everything in Basic', 'AI Tutor for all roles', 'Bulk SMS reminders', 'Live online classes', 'WhatsApp notifications'],
    color:    '#800020',
    popular:  true,
  },
  {
    id:       'Elite',
    label:    'Elite',
    price:    250000,
    students: 'Unlimited students',
    features: ['Everything in Premium', 'AI face-match NIN verification', 'Custom domain', 'Priority support', 'Advanced analytics'],
    color:    '#2D8B55',
  },
]

const REGISTRATION_FEE = 25000 // One-time setup fee

export default function RegisterSchoolPage() {
  const router   = useRouter()
  const supabase = createClient()

  // Step management
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)

  // Step 1: School details
  const [schoolName,    setSchoolName]    = useState('')
  const [schoolType,    setSchoolType]    = useState('secondary')
  const [address,       setAddress]       = useState('')
  const [city,          setCity]          = useState('')
  const [state,         setState]         = useState('')
  const [phone,         setPhone]         = useState('')
  const [email,         setEmail]         = useState('')
  const [tagline,       setTagline]       = useState('')

  // Step 2: Branding
  const [primaryColor,  setPrimaryColor]  = useState('#800020')
  const [logoFile,      setLogoFile]      = useState<File | null>(null)
  const [logoPreview,   setLogoPreview]   = useState<string | null>(null)
  const [bgFile,        setBgFile]        = useState<File | null>(null)
  const [bgPreview,     setBgPreview]     = useState<string | null>(null)
  const [fontFamily,    setFontFamily]    = useState('DM Sans')

  // Step 3: Plan selection
  const [selectedPlan,  setSelectedPlan]  = useState('Premium')

  // Step 4: Principal account
  const [principalName,     setPrincipalName]     = useState('')
  const [principalEmail,    setPrincipalEmail]    = useState('')
  const [principalPassword, setPrincipalPassword] = useState('')
  const [principalPhone,    setPrincipalPhone]    = useState('')

  // UI
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [theme,   setTheme]   = useState<'dark' | 'light'>('dark')

  const logoInputRef = useRef<HTMLInputElement>(null)
  const bgInputRef   = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const saved = localStorage.getItem('schoolos_theme') as 'dark' | 'light' | null
    if (saved) {
      setTheme(saved)
      document.documentElement.setAttribute('data-theme', saved === 'light' ? 'light' : '')
    }
  }, [])

  function handleImageSelect(file: File, type: 'logo' | 'bg') {
    const reader = new FileReader()
    reader.onload = e => {
      if (type === 'logo') {
        setLogoFile(file)
        setLogoPreview(e.target?.result as string)
      } else {
        setBgFile(file)
        setBgPreview(e.target?.result as string)
      }
    }
    reader.readAsDataURL(file)
  }

  // Validate each step before proceeding
  function validateStep1() {
    if (!schoolName.trim()) { setError('School name is required.'); return false }
    if (!city.trim())       { setError('City is required.'); return false }
    if (!state.trim())      { setError('State is required.'); return false }
    if (!email.trim())      { setError('School email is required.'); return false }
    if (!email.includes('@')) { setError('Please enter a valid email address.'); return false }
    return true
  }

  function validateStep4() {
    if (!principalName.trim())  { setError('Principal name is required.'); return false }
    if (!principalEmail.trim()) { setError('Principal email is required.'); return false }
    if (!principalEmail.includes('@')) { setError('Please enter a valid email.'); return false }
    if (principalPassword.length < 8) { setError('Password must be at least 8 characters.'); return false }
    return true
  }

  function nextStep() {
    setError(null)
    if (step === 1 && !validateStep1()) return
    if (step === 4 && !validateStep4()) return
    setStep(s => Math.min(s + 1, 4) as 1 | 2 | 3 | 4)
  }

  // Final submission — create school + initiate Paystack payment
  async function handleSubmit() {
    if (!validateStep4()) return
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/schools/register', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          school: {
            name:         schoolName.trim(),
            school_type:  schoolType,
            address:      address.trim(),
            city:         city.trim(),
            state:        state.trim(),
            phone:        phone.trim(),
            email:        email.trim(),
            tagline:      tagline.trim(),
            primary_color: primaryColor,
            font_family:  fontFamily,
          },
          plan:      selectedPlan,
          principal: {
            full_name: principalName.trim(),
            email:     principalEmail.trim(),
            password:  principalPassword,
            phone:     principalPhone.trim(),
          },
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error ?? 'Registration failed. Please try again.')
        setLoading(false)
        return
      }

      // Upload logo if provided
      if (logoFile && data.schoolId) {
        const logoExt  = logoFile.name.split('.').pop()
        await supabase.storage
          .from('school-assets')
          .upload(`${data.schoolId}/logo.${logoExt}`, logoFile, { upsert: true })
      }

      // Redirect to Paystack payment page
      if (data.paymentUrl) {
        window.location.href = data.paymentUrl
      } else {
        router.push('/register-school/pending')
      }

    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  const selectedPlanData = PLANS.find(p => p.id === selectedPlan)
  const totalAmount = REGISTRATION_FEE + (selectedPlanData?.price ?? 0)

  const NIGERIAN_STATES = [
    'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue',
    'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu',
    'FCT Abuja', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina',
    'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo',
    'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara',
  ]

  return (
    <div className={styles.page}>
      <div className={`${styles.glowOrb} ${styles.orb1}`} />
      <div className={`${styles.glowOrb} ${styles.orb2}`} />

      <button
        className={styles.themeToggle}
        onClick={() => {
          const next = theme === 'dark' ? 'light' : 'dark'
          setTheme(next)
          localStorage.setItem('schoolos_theme', next)
          document.documentElement.setAttribute('data-theme', next === 'light' ? 'light' : '')
        }}
      >
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>

      {/* Header */}
      <div className={styles.header}>
        <div className={styles.wordmark}>
          <span className={styles.wordmarkSchool}>School</span>
          <span className={styles.wordmarkOS}>OS</span>
        </div>
        <p className={styles.headerSubtitle}>Register Your School</p>
      </div>

      {/* Step indicator */}
      <div className={styles.stepIndicator}>
        {['School Details', 'Branding', 'Choose Plan', 'Admin Account'].map((label, i) => (
          <div key={i} className={`${styles.stepItem} ${step > i + 1 ? styles.stepDone : ''} ${step === i + 1 ? styles.stepActive : ''}`}>
            <div className={styles.stepDot}>
              {step > i + 1 ? '✓' : i + 1}
            </div>
            <span className={styles.stepLabel}>{label}</span>
          </div>
        ))}
      </div>

      <div className={`glass-card ${styles.card}`}>

        {/* ── STEP 1: School Details ── */}
        {step === 1 && (
          <div className={styles.stepContent}>
            <h2 className={styles.stepTitle}>School Information</h2>

            <div className={styles.formGrid}>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label className={styles.label}>School Name *</label>
                <input type="text" className="input" value={schoolName}
                  onChange={e => setSchoolName(e.target.value)}
                  placeholder="e.g. Kings College Lagos" />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>School Type *</label>
                <select className="input" value={schoolType} onChange={e => setSchoolType(e.target.value)}>
                  {SCHOOL_TYPES.map(t => (
                    <option key={t} value={t} style={{ textTransform: 'capitalize' }}>{t}</option>
                  ))}
                </select>
              </div>

              <div className={styles.field}>
                <label className={styles.label}>State *</label>
                <select className="input" value={state} onChange={e => setState(e.target.value)}>
                  <option value="">Select state</option>
                  {NIGERIAN_STATES.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div className={styles.field}>
                <label className={styles.label}>City *</label>
                <input type="text" className="input" value={city}
                  onChange={e => setCity(e.target.value)} placeholder="e.g. Lagos Island" />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Phone</label>
                <input type="tel" className="input" value={phone}
                  onChange={e => setPhone(e.target.value)} placeholder="08012345678" />
              </div>

              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label className={styles.label}>School Email *</label>
                <input type="email" className="input" value={email}
                  onChange={e => setEmail(e.target.value)} placeholder="admin@yourschool.edu.ng" />
              </div>

              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label className={styles.label}>School Address</label>
                <input type="text" className="input" value={address}
                  onChange={e => setAddress(e.target.value)} placeholder="Full street address" />
              </div>

              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label className={styles.label}>School Tagline</label>
                <input type="text" className="input" value={tagline}
                  onChange={e => setTagline(e.target.value)}
                  placeholder="e.g. Excellence in Education" maxLength={80} />
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 2: Branding ── */}
        {step === 2 && (
          <div className={styles.stepContent}>
            <h2 className={styles.stepTitle}>School Branding</h2>
            <p className={styles.stepSubtitle}>
              Customize how your portal looks. Your school's uniform color will be used throughout the entire platform.
            </p>

            {/* Color picker */}
            <div className={styles.field}>
              <label className={styles.label}>School Color (Primary)</label>
              <div className={styles.colorPickerRow}>
                <input
                  type="color"
                  className={styles.colorInput}
                  value={primaryColor}
                  onChange={e => setPrimaryColor(e.target.value)}
                />
                <div
                  className={styles.colorPreview}
                  style={{ background: primaryColor }}
                />
                <span className={styles.colorHex}>{primaryColor.toUpperCase()}</span>
              </div>
              <p className={styles.hint}>This color will appear on buttons, headers, and accents across the portal</p>
            </div>

            {/* Quick color presets */}
            <div className={styles.colorPresets}>
              {['#800020', '#1A3C6B', '#2D6A2D', '#8B4513', '#4A148C', '#006064', '#B71C1C', '#1B5E20'].map(color => (
                <button
                  key={color}
                  className={`${styles.colorPreset} ${primaryColor === color ? styles.colorPresetActive : ''}`}
                  style={{ background: color }}
                  onClick={() => setPrimaryColor(color)}
                />
              ))}
            </div>

            {/* Font selector */}
            <div className={styles.field}>
              <label className={styles.label}>Portal Font</label>
              <select className="input" value={fontFamily} onChange={e => setFontFamily(e.target.value)}>
                <option value="DM Sans">DM Sans (Modern, clean)</option>
                <option value="Poppins">Poppins (Friendly, rounded)</option>
                <option value="Inter">Inter (Professional, minimal)</option>
                <option value="Playfair Display">Playfair Display (Elegant, classic)</option>
                <option value="Roboto">Roboto (Standard, reliable)</option>
              </select>
            </div>

            {/* Logo upload */}
            <div className={styles.field}>
              <label className={styles.label}>School Logo (Optional)</label>
              <div
                className={styles.logoUpload}
                onClick={() => logoInputRef.current?.click()}
              >
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo" className={styles.logoPreview} />
                ) : (
                  <div className={styles.logoPlaceholder} style={{ background: primaryColor }}>
                    <span>{schoolName[0]?.toUpperCase() || 'S'}</span>
                  </div>
                )}
                <div className={styles.logoUploadText}>
                  <p>{logoPreview ? 'Tap to change logo' : 'Tap to upload logo'}</p>
                  <p className={styles.hint}>PNG or SVG recommended · Max 2MB</p>
                </div>
              </div>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                className={styles.hiddenInput}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleImageSelect(f, 'logo') }}
              />
            </div>

            {/* Building photo */}
            <div className={styles.field}>
              <label className={styles.label}>Login Page Background (Optional)</label>
              <div
                className={`${styles.bgUpload} ${bgPreview ? styles.bgUploaded : ''}`}
                onClick={() => bgInputRef.current?.click()}
                style={bgPreview ? { backgroundImage: `url(${bgPreview})` } : {}}
              >
                {!bgPreview && (
                  <div className={styles.bgPlaceholder}>
                    <span>🏫</span>
                    <p>Upload your school building photo</p>
                    <p className={styles.hint}>This appears behind the login card</p>
                  </div>
                )}
                {bgPreview && (
                  <div className={styles.bgOverlay}>
                    <span>Tap to change</span>
                  </div>
                )}
              </div>
              <input
                ref={bgInputRef}
                type="file"
                accept="image/*"
                className={styles.hiddenInput}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleImageSelect(f, 'bg') }}
              />
            </div>

            {/* Live preview */}
            <div className={styles.previewBox} style={{ '--preview-color': primaryColor } as any}>
              <p className={styles.previewLabel}>Preview</p>
              <div className={styles.previewCard}>
                <div className={styles.previewHeader} style={{ background: primaryColor }}>
                  <span style={{ fontFamily }}>SchoolOS Portal</span>
                </div>
                <div className={styles.previewBody}>
                  <div className={styles.previewBtn} style={{ background: primaryColor }} />
                  <div className={styles.previewText} />
                  <div className={styles.previewText} style={{ width: '60%' }} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 3: Plan Selection ── */}
        {step === 3 && (
          <div className={styles.stepContent}>
            <h2 className={styles.stepTitle}>Choose Your Plan</h2>
            <p className={styles.stepSubtitle}>
              Billed per term. Registration fee of ₦{REGISTRATION_FEE.toLocaleString()} applies once.
            </p>

            <div className={styles.planGrid}>
              {PLANS.map(plan => (
                <div
                  key={plan.id}
                  className={`${styles.planCard} ${selectedPlan === plan.id ? styles.planSelected : ''} ${plan.popular ? styles.planPopular : ''}`}
                  onClick={() => setSelectedPlan(plan.id)}
                  style={selectedPlan === plan.id ? { borderColor: plan.color, boxShadow: `0 0 0 2px ${plan.color}40` } : {}}
                >
                  {plan.popular && <span className={styles.popularBadge}>Most Popular</span>}
                  <h3 className={styles.planName} style={{ color: plan.color }}>{plan.label}</h3>
                  <div className={styles.planPrice}>
                    <span className={styles.planAmount}>₦{plan.price.toLocaleString()}</span>
                    <span className={styles.planPeriod}>/term</span>
                  </div>
                  <p className={styles.planStudents}>{plan.students}</p>
                  <ul className={styles.planFeatures}>
                    {plan.features.map((f, i) => (
                      <li key={i}>
                        <span style={{ color: plan.color }}>✓</span> {f}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {/* Total */}
            <div className={styles.totalBox}>
              <div className={styles.totalRow}>
                <span>Registration fee (one-time)</span>
                <span>₦{REGISTRATION_FEE.toLocaleString()}</span>
              </div>
              <div className={styles.totalRow}>
                <span>{selectedPlan} plan (first term)</span>
                <span>₦{selectedPlanData?.price.toLocaleString()}</span>
              </div>
              <div className={`${styles.totalRow} ${styles.totalFinal}`}>
                <span>Total due today</span>
                <span>₦{totalAmount.toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 4: Principal Account ── */}
        {step === 4 && (
          <div className={styles.stepContent}>
            <h2 className={styles.stepTitle}>Principal Account</h2>
            <p className={styles.stepSubtitle}>
              Create the main administrator account for <strong>{schoolName}</strong>.
            </p>

            <div className={styles.formGrid}>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label className={styles.label}>Principal Full Name *</label>
                <input type="text" className="input" value={principalName}
                  onChange={e => setPrincipalName(e.target.value)} placeholder="e.g. Dr. Chukwuemeka Obi" />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Principal Email *</label>
                <input type="email" className="input" value={principalEmail}
                  onChange={e => setPrincipalEmail(e.target.value)} placeholder="principal@yourschool.edu.ng" />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Phone Number</label>
                <input type="tel" className="input" value={principalPhone}
                  onChange={e => setPrincipalPhone(e.target.value)} placeholder="08012345678" />
              </div>

              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label className={styles.label}>Password *</label>
                <input type="password" className="input" value={principalPassword}
                  onChange={e => setPrincipalPassword(e.target.value)}
                  placeholder="Min. 8 characters" />
              </div>
            </div>

            {/* Summary */}
            <div className={styles.summaryBox}>
              <h3 className={styles.summaryTitle}>Registration Summary</h3>
              <div className={styles.summaryRow}>
                <span>School</span><strong>{schoolName}</strong>
              </div>
              <div className={styles.summaryRow}>
                <span>Plan</span><strong>{selectedPlan}</strong>
              </div>
              <div className={styles.summaryRow}>
                <span>Total</span><strong>₦{totalAmount.toLocaleString()}</strong>
              </div>
              <p className={styles.summaryNote}>
                You will be redirected to Paystack to complete payment after submitting.
              </p>
            </div>
          </div>
        )}

        {error && <div className={styles.error}>⚠️ {error}</div>}

        {/* Navigation buttons */}
        <div className={styles.btnRow}>
          {step > 1 && (
            <button
              className={`btn btn-ghost ${styles.backBtn}`}
              onClick={() => { setStep(s => Math.max(s - 1, 1) as 1|2|3|4); setError(null) }}
            >
              ← Back
            </button>
          )}

          {step < 4 ? (
            <button className={`btn btn-primary ${styles.nextBtn}`} onClick={nextStep}>
              Continue →
            </button>
          ) : (
            <button
              className={`btn btn-primary ${styles.nextBtn}`}
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? 'Processing...' : `Pay ₦${totalAmount.toLocaleString()} & Register →`}
            </button>
          )}
        </div>

      </div>

      <div className={styles.poweredBy}>
        Powered by <strong>SchoolOS</strong>
      </div>
    </div>
  )
}
