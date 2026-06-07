'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  CreditCardIcon, CalendarIcon, UsersIcon, CheckCircleIcon,
  AlertCircleIcon, RefreshIcon, BarChartIcon, FileTextIcon,
  ArrowLeftIcon, SunIcon, MoonIcon,
} from '@/components/Icons'
import styles from './subscription.module.css'

// ── Per-student pricing tiers ─────────────────────────────
// School pays SchoolOS: ₦500 × number of active students per term
const PRICE_PER_STUDENT = 500 // NGN

// Plans determine what FEATURES the school unlocks
// Not the per-student cost — that stays at ₦500 per student always
const PLANS = [
  {
    id:       'Basic',
    label:    'Basic',
    price:    500,        // per student per term
    maxStudents: 200,
    features: [
      'Student & staff portal',
      'Fee management',
      'Results & assignments',
      'Timetable & attendance',
      'School notes & syllabus',
    ],
    color: '#3B82F6',
  },
  {
    id:       'Standard',
    label:    'Standard',
    price:    1000,       // per student per term
    maxStudents: 500,
    features: [
      'Everything in Basic',
      'AI Tutor for students',
      'AI Assistant for all staff',
      'Live & recorded classes',
      'WhatsApp notifications',
      'Bulk SMS reminders',
    ],
    color:   '#800020',
    popular: true,
  },
  {
    id:       'Premium',
    label:    'Premium',
    price:    2000,       // per student per term
    maxStudents: 99999,  // unlimited
    features: [
      'Everything in Standard',
      'AI face-match NIN verification',
      'Custom school domain',
      'Priority support',
      'Advanced analytics',
      'Cross-school principal chat',
      'Student permanent ID cards',
    ],
    color: '#10B981',
  },
]

const REGISTRATION_FEE = 150000 // One-time only

interface Props {
  school:         any
  subscription:   any
  studentCount:   number
  paymentHistory: any[]
  userId:         string
  principalName:  string
}

export default function SubscriptionClient({
  school, subscription, studentCount, paymentHistory, userId, principalName,
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [selectedPlan, setSelectedPlan] = useState(subscription?.plan_type ?? 'Standard')
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [theme,        setTheme]        = useState<'dark' | 'light'>('dark')
  const [tab,          setTab]          = useState<'status' | 'renew' | 'history'>('status')
  const [toast,        setToast]        = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Read ?status= from Paystack callback redirect
  useEffect(() => {
    const status  = searchParams.get('status')
    const receipt = searchParams.get('receipt')
    if (status === 'success') {
      setToast({
        type:    'success',
        message: receipt
          ? `Payment successful! Receipt #${receipt}. Your subscription is now active.`
          : 'Payment successful! Your subscription is now active.',
      })
      setTab('status')
    } else if (status === 'failed') {
      setToast({ type: 'error', message: 'Payment was not completed. Please try again.' })
      setTab('renew')
    }
    // Auto-dismiss after 6 seconds
    if (status) {
      const t = setTimeout(() => setToast(null), 6000)
      return () => clearTimeout(t)
    }
  }, [searchParams])

  useEffect(() => {
    const saved = localStorage.getItem('schoolos_theme') as any
    if (saved) {
      setTheme(saved)
      document.documentElement.setAttribute('data-theme', saved === 'light' ? 'light' : '')
    }
  }, [])

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('schoolos_theme', next)
    document.documentElement.setAttribute('data-theme', next === 'light' ? 'light' : '')
  }

  // ── Calculate days remaining ──────────────────────────
  const daysRemaining = useMemo(() => {
    if (!subscription?.expiry_date) return 0
    const expiry = new Date(subscription.expiry_date)
    const now    = new Date()
    return Math.max(0, Math.floor((expiry.getTime() - now.getTime()) / 86400000))
  }, [subscription])

  const isExpired = daysRemaining === 0
  const isUrgent  = daysRemaining > 0 && daysRemaining <= 10
  const isWarning = daysRemaining > 10 && daysRemaining <= 30

  // ── Calculate renewal amount ──────────────────────────
  // School pays: number of students × plan price per student
  const selectedPlanData = PLANS.find(p => p.id === selectedPlan)
  const pricePerStudent  = selectedPlanData?.price ?? PRICE_PER_STUDENT
  const renewalAmount    = studentCount * pricePerStudent

  // Status color
  const statusColor = isExpired ? 'var(--error)'
    : isUrgent  ? 'var(--error)'
    : isWarning ? 'var(--warning)'
    : 'var(--success)'

  const statusLabel = isExpired ? 'Expired'
    : isUrgent  ? `${daysRemaining} days left`
    : isWarning ? `${daysRemaining} days left`
    : `${daysRemaining} days remaining`

  const schoolColor = school?.primary_color ?? '#800020'

  // ── Initiate Paystack renewal ─────────────────────────
  async function handleRenew() {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/subscriptions/renew', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          schoolId:      school.id,
          planType:      selectedPlan,
          studentCount,
          amount:        renewalAmount,
          principalName,
          userId,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error ?? 'Payment initiation failed. Please try again.')
        setLoading(false)
        return
      }

      // Redirect to Paystack
      if (data.paymentUrl) {
        window.location.href = data.paymentUrl
      }

    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString('en-NG', {
      day: '2-digit', month: 'long', year: 'numeric',
    })
  }

  function fmtAmount(n: number) {
    return `₦${n.toLocaleString()}`
  }

  return (
    <div className={styles.page}>

      {/* Payment status toast */}
      {toast && (
        <div style={{
          position:     'fixed',
          top:          '16px',
          left:         '50%',
          transform:    'translateX(-50%)',
          zIndex:       9999,
          display:      'flex',
          alignItems:   'center',
          gap:          '10px',
          padding:      '12px 20px',
          borderRadius: '10px',
          background:   toast.type === 'success' ? 'var(--success-bg, #052e16)' : 'var(--error-bg, #2d0a0a)',
          border:       `1px solid ${toast.type === 'success' ? 'rgba(16,185,129,0.3)' : 'rgba(192,57,43,0.3)'}`,
          color:        toast.type === 'success' ? 'var(--success, #10B981)' : 'var(--error, #ef4444)',
          fontSize:     '0.85rem',
          fontWeight:   500,
          maxWidth:     '90vw',
          boxShadow:    '0 4px 24px rgba(0,0,0,0.4)',
        }}>
          {toast.type === 'success'
            ? <CheckCircleIcon size={16} color="var(--success, #10B981)" />
            : <AlertCircleIcon size={16} color="var(--error, #ef4444)" />
          }
          {toast.message}
          <button
            onClick={() => setToast(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: '4px', opacity: 0.7, color: 'inherit' }}
          >✕</button>
        </div>
      )}

      {/* Header */}
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.push('/dashboard/principal')}>
          <ArrowLeftIcon size={18} />
        </button>
        <h1 className={styles.headerTitle}>Subscription</h1>
        <button className={styles.iconBtn} onClick={toggleTheme}>
          {theme === 'dark' ? <SunIcon size={17} /> : <MoonIcon size={17} />}
        </button>
      </header>

      {/* Expiry banner — shown when urgent */}
      {(isExpired || isUrgent) && (
        <div className={styles.urgentBanner} style={{ background: isExpired ? 'var(--error-bg)' : 'rgba(245,158,11,0.1)', borderColor: isExpired ? 'rgba(192,57,43,0.3)' : 'rgba(245,158,11,0.3)' }}>
          <AlertCircleIcon size={16} color={isExpired ? 'var(--error)' : 'var(--warning)'} />
          <p style={{ color: isExpired ? 'var(--error)' : 'var(--warning)' }}>
            {isExpired
              ? 'Your subscription has expired. Renew now to restore access for all users.'
              : `Your subscription expires in ${daysRemaining} days. Renew before it expires to avoid disruption.`
            }
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className={styles.tabs}>
        {(['status', 'renew', 'history'] as const).map(t => (
          <button
            key={t}
            className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'status'  ? 'Status'  :
             t === 'renew'   ? 'Renew'   : 'History'}
          </button>
        ))}
      </div>

      <div className={styles.content}>

        {/* ── STATUS TAB ── */}
        {tab === 'status' && (
          <>
            {/* Current plan card */}
            <div className={styles.planStatusCard} style={{ borderColor: `${schoolColor}44` }}>
              <div className={styles.planStatusTop}>
                <div>
                  <p className={styles.planStatusLabel}>Current Plan</p>
                  <p className={styles.planStatusName} style={{ color: schoolColor }}>
                    {subscription?.plan_type ?? 'No Plan'}
                  </p>
                </div>
                <span
                  className={styles.statusBadge}
                  style={{ background: `${statusColor}18`, color: statusColor, borderColor: `${statusColor}33` }}
                >
                  {subscription?.status ?? 'Inactive'}
                </span>
              </div>

              {/* Expiry countdown */}
              <div className={styles.countdownRow}>
                <div className={styles.countdownBox} style={{ borderColor: `${statusColor}33` }}>
                  <p className={styles.countdownNum} style={{ color: statusColor }}>
                    {daysRemaining}
                  </p>
                  <p className={styles.countdownLabel}>days left</p>
                </div>
                <div className={styles.countdownInfo}>
                  <div className={styles.infoRow}>
                    <CalendarIcon size={14} color="var(--text-muted)" />
                    <span>
                      Expires: {subscription?.expiry_date ? fmtDate(subscription.expiry_date) : '—'}
                    </span>
                  </div>
                  <div className={styles.infoRow}>
                    <UsersIcon size={14} color="var(--text-muted)" />
                    <span>{studentCount} active students</span>
                  </div>
                  <div className={styles.infoRow}>
                    <BarChartIcon size={14} color="var(--text-muted)" />
                    <span>
                      {fmtAmount(studentCount * pricePerStudent)} per term
                    </span>
                  </div>
                </div>
              </div>

              {/* Days remaining bar */}
              {daysRemaining > 0 && (
                <div className={styles.daysBar}>
                  <div
                    className={styles.daysBarFill}
                    style={{
                      width:      `${Math.min((daysRemaining / 120) * 100, 100)}%`,
                      background: statusColor,
                    }}
                  />
                </div>
              )}

              <p className={styles.statusSub}>{statusLabel}</p>
            </div>

            {/* Pricing explanation */}
            <div className={styles.pricingNote}>
              <p className={styles.pricingNoteTitle}>How pricing works</p>
              <p className={styles.pricingNoteBody}>
                SchoolOS charges <strong>₦{selectedPlanData?.price.toLocaleString()} per student per term</strong>.
                With <strong>{studentCount} active students</strong>, your renewal costs <strong>{fmtAmount(renewalAmount)}</strong> this term.
                As your school grows, your fee adjusts automatically.
              </p>
            </div>

            {/* Current features */}
            {selectedPlanData && (
              <div className={styles.featuresCard}>
                <p className={styles.featuresTitle}>Your Plan Includes</p>
                <div className={styles.featuresList}>
                  {selectedPlanData.features.map((f, i) => (
                    <div key={i} className={styles.featureItem}>
                      <CheckCircleIcon size={14} color="var(--success)" />
                      <span>{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              className={styles.renewCta}
              style={{ background: schoolColor }}
              onClick={() => setTab('renew')}
            >
              <RefreshIcon size={16} color="white" />
              Renew Subscription
            </button>
          </>
        )}

        {/* ── RENEW TAB ── */}
        {tab === 'renew' && (
          <>
            <div className={styles.renewHeader}>
              <p className={styles.renewTitle}>Choose Your Plan</p>
              <p className={styles.renewSubtitle}>
                You have <strong>{studentCount} active students</strong>.
                Your fee = students × plan rate per term.
              </p>
            </div>

            {/* Plan cards */}
            <div className={styles.planCards}>
              {PLANS.map(plan => {
                const amount    = studentCount * plan.price
                const isSelected = selectedPlan === plan.id

                return (
                  <button
                    key={plan.id}
                    className={`${styles.planCard} ${isSelected ? styles.planCardSelected : ''}`}
                    style={isSelected ? { borderColor: plan.color, boxShadow: `0 0 0 2px ${plan.color}28` } : {}}
                    onClick={() => setSelectedPlan(plan.id)}
                  >
                    {plan.popular && (
                      <span className={styles.popularTag} style={{ background: plan.color }}>
                        Most Popular
                      </span>
                    )}

                    <div className={styles.planCardTop}>
                      <p className={styles.planCardName} style={{ color: plan.color }}>
                        {plan.label}
                      </p>
                      {isSelected && (
                        <CheckCircleIcon size={16} color={plan.color} />
                      )}
                    </div>

                    <div className={styles.planPriceRow}>
                      <p className={styles.planRate}>₦{plan.price.toLocaleString()}</p>
                      <p className={styles.planRateLabel}>per student/term</p>
                    </div>

                    <div className={styles.planTotal}>
                      <p className={styles.planTotalLabel}>Your total ({studentCount} students)</p>
                      <p className={styles.planTotalAmount} style={{ color: plan.color }}>
                        {fmtAmount(amount)}
                      </p>
                    </div>

                    <p className={styles.planMaxStudents}>
                      {plan.maxStudents >= 99999 ? 'Unlimited students' : `Up to ${plan.maxStudents.toLocaleString()} students`}
                    </p>

                    <div className={styles.planFeatures}>
                      {plan.features.slice(0, 3).map((f, i) => (
                        <div key={i} className={styles.planFeatureItem}>
                          <CheckCircleIcon size={12} color={plan.color} />
                          <span>{f}</span>
                        </div>
                      ))}
                      {plan.features.length > 3 && (
                        <p className={styles.planMoreFeatures}>+{plan.features.length - 3} more features</p>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Order summary */}
            <div className={styles.orderSummary}>
              <p className={styles.summaryTitle}>Order Summary</p>

              <div className={styles.summaryRow}>
                <span>Plan</span>
                <strong>{selectedPlan}</strong>
              </div>
              <div className={styles.summaryRow}>
                <span>Active Students</span>
                <strong>{studentCount}</strong>
              </div>
              <div className={styles.summaryRow}>
                <span>Rate per student</span>
                <strong>₦{selectedPlanData?.price.toLocaleString()}/term</strong>
              </div>
              <div className={styles.summaryRow}>
                <span>Term coverage</span>
                <strong>4 months</strong>
              </div>

              <div className={styles.summaryDivider} />

              <div className={`${styles.summaryRow} ${styles.summaryTotal}`}>
                <span>Total Due</span>
                <strong style={{ color: schoolColor }}>{fmtAmount(renewalAmount)}</strong>
              </div>

              <p className={styles.summaryNote}>
                Payment processed securely via Paystack. After payment your subscription extends by one full term (4 months).
              </p>
            </div>

            {error && (
              <div className={styles.errorMsg}>
                <AlertCircleIcon size={15} color="var(--error)" />
                {error}
              </div>
            )}

            <button
              className={styles.payBtn}
              style={{ background: schoolColor }}
              onClick={handleRenew}
              disabled={loading || studentCount === 0}
            >
              {loading ? (
                <>
                  <RefreshIcon size={16} color="white" />
                  Processing...
                </>
              ) : (
                <>
                  <CreditCardIcon size={16} color="white" />
                  Pay {fmtAmount(renewalAmount)} via Paystack
                </>
              )}
            </button>

            {studentCount === 0 && (
              <p className={styles.noStudentsNote}>
                You need at least 1 active student enrolled before you can renew.
              </p>
            )}
          </>
        )}

        {/* ── HISTORY TAB ── */}
        {tab === 'history' && (
          <>
            <p className={styles.sectionLabel}>Payment History</p>

            {paymentHistory.length === 0 ? (
              <div className={styles.emptyHistory}>
                <FileTextIcon size={32} color="var(--text-muted)" />
                <p>No payment records yet</p>
              </div>
            ) : (
              paymentHistory.map(payment => (
                <div key={payment.id} className={styles.historyCard}>
                  <div className={styles.historyLeft}>
                    <div className={styles.historyIcon}>
                      <CreditCardIcon size={16} color={schoolColor} />
                    </div>
                    <div>
                      <p className={styles.historyTerm}>
                        {payment.term?.charAt(0).toUpperCase() + payment.term?.slice(1)} Term
                        {payment.academic_year ? ` · ${payment.academic_year}` : ''}
                      </p>
                      <p className={styles.historyDate}>{fmtDate(payment.paid_at)}</p>
                      {payment.receipt_number && (
                        <p className={styles.historyReceipt}>Receipt #{payment.receipt_number}</p>
                      )}
                    </div>
                  </div>
                  <p className={styles.historyAmount} style={{ color: 'var(--success)' }}>
                    {fmtAmount(payment.amount_paid)}
                  </p>
                </div>
              ))
            )}
          </>
        )}

      </div>

      <div style={{ height: '80px' }} />
    </div>
  )
}