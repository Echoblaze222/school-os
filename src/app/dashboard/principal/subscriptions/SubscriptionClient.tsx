'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  CreditCardIcon, CalendarIcon, UsersIcon, CheckCircleIcon,
  AlertCircleIcon, RefreshIcon, BarChartIcon, FileTextIcon,
  ArrowLeftIcon, SunIcon, MoonIcon, XIcon, ChevronDownIcon,
} from '@/components/Icons'
import styles from './subscription.module.css'
import { getSubscriptionTier, computeSubscriptionAmount, type BillingCycle } from '@/lib/billing'

// ── School-size-based pricing ──────────────────────────────
// Replaces the old per-plan price selector. Every school gets the same
// full feature set; the per-student rate is determined automatically by
// how many active students the school has — matching what the server
// (subscription/renew) computes independently and authoritatively.
// Sourced from lib/billing.ts, not reimplemented here - this file and
// renew/route.ts each had their own copy of this before, and the two had
// already drifted apart (both on the wrong thresholds too).

const ALL_FEATURES = [
  'Student & staff portal',
  'Fee management',
  'Results & assignments',
  'Timetable & attendance',
  'School notes & syllabus',
  'AI Tutor for students',
  'AI Assistant for all staff',
  'Live & recorded classes',
  'WhatsApp notifications',
  'Bulk SMS reminders',
  'AI face-match NIN verification',
  'Custom school domain',
  'Priority support',
  'Advanced analytics',
  'Cross-school principal chat',
  'Student permanent ID cards',
]

const REGISTRATION_FEE = 150000 // One-time only

interface BillingSnapshot {
  id: string
  billing_cycle: string
  billable_student_count: number
  rate_per_student: number
  tier_label: string
  amount_ngn: number
  discount_applied_ngn: number
  period_start: string
  period_end: string
  created_at: string
}

interface Props {
  school:           any
  subscription:     any
  studentCount:     number
  paymentHistory:   any[]
  billingSnapshots: BillingSnapshot[]
  userId:           string
  principalName:    string
}

export default function SubscriptionClient({
  school, subscription, studentCount, paymentHistory, billingSnapshots, userId, principalName,
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [theme,        setTheme]        = useState<'dark' | 'light'>('dark')
  const [tab,          setTab]          = useState<'status' | 'renew' | 'history'>('status')
  const [toast,        setToast]        = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('termly')
  const [cancelBusy,   setCancelBusy]   = useState(false)
  const [pricingOpen,  setPricingOpen]  = useState(false)
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState<boolean>(!!subscription?.cancel_at_period_end)

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
  // This is a countdown display only - it does NOT determine whether
  // access is actually restricted. That's decided server-side by
  // middleware.ts, purely from schools.setup_status / is_platform_active
  // (flipped by evaluateSchoolSubscription via the check-subscriptions
  // cron). Those two things can legitimately disagree for a while - the
  // grace period is real, deliberate access even past expiry_date - so
  // isExpired below reflects what's actually locked, not just the date.
  const daysRemaining = useMemo(() => {
    if (!subscription?.expiry_date) return 0
    const expiry = new Date(subscription.expiry_date)
    const now    = new Date()
    return Math.max(0, Math.floor((expiry.getTime() - now.getTime()) / 86400000))
  }, [subscription])

  const isBillingLocked = school?.setup_status === 'expired' || school?.setup_status === 'suspended'
  const isHardLocked     = school?.is_platform_active === false || school?.setup_status === 'locked'
  const isGracePeriod    = school?.setup_status === 'grace_period'

  const isExpired = isBillingLocked || isHardLocked
  const isUrgent  = !isExpired && (isGracePeriod || (daysRemaining > 0 && daysRemaining <= 10))
  const isWarning = !isExpired && !isUrgent && daysRemaining > 10 && daysRemaining <= 30

  // ── Calculate renewal amount ──────────────────────────
  // School pays: number of active students × the size-based rate. This
  // display figure is informational only — the server recomputes the
  // authoritative amount itself from real active student counts.
  const { rate: pricePerStudent, tierLabel } = getSubscriptionTier(studentCount)
  const termlyBreakdown = useMemo(() => computeSubscriptionAmount(studentCount, 'termly'), [studentCount])
  const yearlyBreakdown = useMemo(() => computeSubscriptionAmount(studentCount, 'yearly'), [studentCount])
  const selectedBreakdown = billingCycle === 'yearly' ? yearlyBreakdown : termlyBreakdown
  const renewalAmount = selectedBreakdown.amount

  // Status color
  const statusColor = isExpired ? 'var(--error)'
    : isUrgent  ? 'var(--error)'
    : isWarning ? 'var(--warning)'
    : 'var(--success)'

  const statusLabel = isExpired ? 'Expired'
    : isGracePeriod ? 'Grace period'
    : isUrgent  ? `${daysRemaining} days left`
    : isWarning ? `${daysRemaining} days left`
    : `${daysRemaining} days remaining`

  const schoolColor = school?.primary_color ?? '#800020'

  // ── Initiate Paystack renewal ─────────────────────────
  async function handleRenew() {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/subscription/renew', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ billingCycle }), // amount and student count are still computed server-side
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

  // ── Toggle auto-renewal ────────────────────────────────
  async function handleCancelToggle(nextAction: 'cancel' | 'resume') {
    if (cancelBusy) return
    if (nextAction === 'cancel' && !confirm(
      "Stop auto-renewal? You'll keep full access until the current period ends on " +
      `${subscription?.expiry_date ? fmtDate(subscription.expiry_date) : 'the end of this term'}, ` +
      'then the subscription will end instead of renewing. You can resume any time before then.'
    )) return

    setCancelBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/subscription/cancel', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: nextAction }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Could not update auto-renewal. Please try again.')
        return
      }
      setCancelAtPeriodEnd(nextAction === 'cancel')
      setToast({
        type: 'success',
        message: nextAction === 'cancel'
          ? 'Auto-renewal turned off. Your access continues until the current period ends.'
          : 'Auto-renewal turned back on.',
      })
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setCancelBusy(false)
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
          <button className="pressable"
            onClick={() => setToast(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: '4px', opacity: 0.7, color: 'inherit' }}
          ><XIcon size={13} /></button>
        </div>
      )}

      {/* Header */}
      <header className={styles.header}>
        <button className={`${styles.backBtn} pressable`} onClick={() => router.push('/dashboard/principal')}>
          <ArrowLeftIcon size={18} />
        </button>
        <h1 className={styles.headerTitle}>Subscription</h1>
        <button className={`${styles.iconBtn} pressable`} onClick={toggleTheme}>
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
              : isGracePeriod
              ? 'Your subscription period has ended. Staff and students still have access for a short grace period. Renew now to avoid any interruption.'
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
            className={`${styles.tab} ${tab === t ? styles.tabActive : ''} pressable`}
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
                      Expires: {subscription?.expiry_date ? fmtDate(subscription.expiry_date) : 'N/A'}
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

            {/* Pricing explanation - collapsed by default; the rate itself
                is always visible, the "why" is opt-in detail, same
                expand/collapse pattern as the landing page FAQ. */}
            <div className={styles.pricingNote}>
              <button
                type="button"
                className={styles.pricingNoteToggle}
                aria-expanded={pricingOpen}
                onClick={() => setPricingOpen(o => !o)}
              >
                <span>
                  <strong>How pricing works</strong>
                  <span className={styles.pricingNoteSummary}>
                    {' '}&middot; {tierLabel} tier, ₦{pricePerStudent.toLocaleString()}/student/term
                  </span>
                </span>
                <ChevronDownIcon size={16} className={`${styles.pricingChevron} ${pricingOpen ? styles.pricingChevronOpen : ''}`} />
              </button>
              {pricingOpen && (
                <p className={`${styles.pricingNoteBody} animate-fade-up`}>
                  Your rate is based on school size. You're currently on the <strong>{tierLabel}</strong> tier
                  at <strong>₦{pricePerStudent.toLocaleString()} per student per term</strong>.
                  With <strong>{studentCount} active students</strong>, your renewal costs <strong>{fmtAmount(termlyBreakdown.amount)}</strong> per term
                  {' '}(or <strong>{fmtAmount(yearlyBreakdown.amount)}/year</strong> paid yearly, saving {Math.round((yearlyBreakdown.discountApplied / (termlyBreakdown.amount * 3)) * 100)}% versus paying termly three times).
                  As your school grows past a tier boundary, your rate adjusts automatically, and every school gets the full feature set regardless of size.
                </p>
              )}
            </div>

            {/* Auto-renewal control */}
            {subscription?.status === 'Active' && (
              <div className={styles.pricingNote}>
                <p className={styles.pricingNoteTitle}>Auto-renewal</p>
                <p className={styles.pricingNoteBody}>
                  {cancelAtPeriodEnd
                    ? `Auto-renewal is off. Your access continues until ${subscription?.expiry_date ? fmtDate(subscription.expiry_date) : 'the end of this period'}, then the subscription will end.`
                    : "Auto-renewal is on. You'll be prompted to pay again when this period ends."}
                </p>
                <button
                  className={`${styles.backBtn} pressable`}
                  style={{ width: 'auto', padding: '8px 16px', marginTop: 8 }}
                  disabled={cancelBusy}
                  onClick={() => handleCancelToggle(cancelAtPeriodEnd ? 'resume' : 'cancel')}
                >
                  {cancelBusy ? 'Updating…' : cancelAtPeriodEnd ? 'Resume auto-renewal' : 'Stop auto-renewal'}
                </button>
              </div>
            )}

            {/* Current features */}
            <div className={styles.featuresCard}>
              <p className={styles.featuresTitle}>Your Plan Includes</p>
              <div className={styles.featuresList}>
                {ALL_FEATURES.map((f, i) => (
                  <div key={i} className={styles.featureItem}>
                    <CheckCircleIcon size={14} color="var(--success)" />
                    <span>{f}</span>
                  </div>
                ))}
              </div>
            </div>

            <button
              className={`${styles.renewCta} pressable`}
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
              <p className={styles.renewTitle}>Confirm Your Renewal</p>
              <p className={styles.renewSubtitle}>
                You have <strong>{studentCount} active students</strong>, placing you on the
                {' '}<strong>{tierLabel}</strong> tier at ₦{pricePerStudent.toLocaleString()} per student per term.
              </p>
            </div>

            {/* Billing cycle choice */}
            <div className={styles.tabs} style={{ marginBottom: 16 }}>
              <button
                className={`${styles.tab} ${billingCycle === 'termly' ? styles.tabActive : ''} pressable`}
                onClick={() => setBillingCycle('termly')}
              >
                Pay termly
              </button>
              <button
                className={`${styles.tab} ${billingCycle === 'yearly' ? styles.tabActive : ''} pressable`}
                onClick={() => setBillingCycle('yearly')}
              >
                Pay yearly (save 20%)
              </button>
            </div>

            {/* Current tier summary card — replaces the old plan picker.
                Pricing is no longer a choice; it's determined automatically
                by school size, so there's nothing to select here. */}
            <div className={styles.planCards}>
              <div className={styles.planCard} style={{ borderColor: schoolColor, boxShadow: `0 0 0 2px ${schoolColor}28` }}>
                <div className={styles.planCardTop}>
                  <p className={styles.planCardName} style={{ color: schoolColor }}>{tierLabel}</p>
                  <CheckCircleIcon size={16} color={schoolColor} />
                </div>

                <div className={styles.planPriceRow}>
                  <p className={styles.planRate}>₦{pricePerStudent.toLocaleString()}</p>
                  <p className={styles.planRateLabel}>per student/term</p>
                </div>

                <div className={styles.planTotal}>
                  <p className={styles.planTotalLabel}>
                    Your total ({studentCount} students, {billingCycle === 'yearly' ? 'billed yearly' : 'billed this term'})
                  </p>
                  <p className={styles.planTotalAmount} style={{ color: schoolColor }}>
                    {fmtAmount(renewalAmount)}
                  </p>
                  {billingCycle === 'yearly' && (
                    <p className={styles.planRateLabel}>
                      You save {fmtAmount(selectedBreakdown.discountApplied)} vs. paying termly three times
                    </p>
                  )}
                </div>

                <p className={styles.planMaxStudents}>
                  Up to 250: ₦1,000/student &middot; 251-500: ₦2,000/student &middot; 501+: ₦3,000/student
                </p>
              </div>
            </div>

            {/* Order summary */}
            <div className={styles.orderSummary}>
              <p className={styles.summaryTitle}>Order Summary</p>

              <div className={styles.summaryRow}>
                <span>Tier</span>
                <strong>{tierLabel}</strong>
              </div>
              <div className={styles.summaryRow}>
                <span>Active Students</span>
                <strong>{studentCount}</strong>
              </div>
              <div className={styles.summaryRow}>
                <span>Rate per student</span>
                <strong>₦{pricePerStudent.toLocaleString()}/term</strong>
              </div>
              <div className={styles.summaryRow}>
                <span>Billing cycle</span>
                <strong>{billingCycle === 'yearly' ? '12 months (paid yearly)' : '4 months (one term)'}</strong>
              </div>
              {billingCycle === 'yearly' && (
                <div className={styles.summaryRow}>
                  <span>Yearly discount (20%)</span>
                  <strong style={{ color: 'var(--success)' }}>&minus;{fmtAmount(selectedBreakdown.discountApplied)}</strong>
                </div>
              )}

              <div className={styles.summaryDivider} />

              <div className={`${styles.summaryRow} ${styles.summaryTotal}`}>
                <span>Total Due</span>
                <strong style={{ color: schoolColor }}>{fmtAmount(renewalAmount)}</strong>
              </div>

              <p className={styles.summaryNote}>
                Payment processed securely via Paystack. After payment your subscription extends by
                {' '}{billingCycle === 'yearly' ? 'a full year (12 months)' : 'one full term (4 months)'}.
              </p>
            </div>

            {error && (
              <div className={styles.errorMsg}>
                <AlertCircleIcon size={15} color="var(--error)" />
                {error}
              </div>
            )}

            <button
              className={`${styles.payBtn} pressable`}
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
            <p className={styles.sectionLabel}>Billing Periods</p>

            {billingSnapshots.length === 0 ? (
              <div className={styles.emptyHistory}>
                <FileTextIcon size={32} color="var(--text-muted)" />
                <p>No billing periods recorded yet</p>
              </div>
            ) : (
              billingSnapshots.map(snap => (
                <div key={snap.id} className={styles.historyCard}>
                  <div className={styles.historyLeft}>
                    <div className={styles.historyIcon}>
                      <CalendarIcon size={16} color={schoolColor} />
                    </div>
                    <div>
                      <p className={styles.historyTerm}>
                        {snap.tier_label} &middot; {snap.billing_cycle === 'yearly' ? 'Yearly' : 'Termly'}
                      </p>
                      <p className={styles.historyDate}>
                        {fmtDate(snap.period_start)} – {fmtDate(snap.period_end)}
                      </p>
                      <p className={styles.historyReceipt}>
                        {snap.billable_student_count} students &middot; ₦{snap.rate_per_student.toLocaleString()}/student
                        {snap.discount_applied_ngn > 0 && ` · saved ${fmtAmount(snap.discount_applied_ngn)}`}
                      </p>
                    </div>
                  </div>
                  <p className={styles.historyAmount} style={{ color: 'var(--success)' }}>
                    {fmtAmount(snap.amount_ngn)}
                  </p>
                </div>
              ))
            )}

            <p className={styles.sectionLabel} style={{ marginTop: 24 }}>Payment History</p>

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
                        {payment.plan_type ?? 'Subscription'}
                        {payment.billing_cycle ? ` · ${payment.billing_cycle === 'yearly' ? 'Yearly' : 'Termly'}` : ''}
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