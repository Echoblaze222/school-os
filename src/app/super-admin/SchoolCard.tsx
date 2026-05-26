'use client'

import { useState } from 'react'
import { FlameIcon, CheckCircleIcon, ClockIcon, WalletIcon, PeopleIcon } from '@/components/Icons'
import styles from './school-card.module.css'

interface School {
  id: string; name: string; slug: string
  setup_status: string; trial_days_left: number
  free_days_left: number; sub_days_left: number
  subscription_plan: string; installment_count: number
  total_students: number; total_paid_ngn: number
  trial_active_score: number; notes: string
  trial_ends_at: string; next_payment_due: string
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  trial:     { label: 'Trial',     color: '#F59E0B', icon: FlameIcon        },
  active:    { label: 'Active',    color: '#10B981', icon: CheckCircleIcon  },
  expired:   { label: 'Expired',   color: '#EF4444', icon: ClockIcon        },
  suspended: { label: 'Suspended', color: '#6B7280', icon: ClockIcon        },
  locked:    { label: 'Locked',    color: '#EF4444', icon: ClockIcon        },
}

const PLANS: Record<string, string> = {
  free_month:        '1 Month Free',
  basic_500:         '₦500/mo Basic',
  standard_1000:     '₦1,000/mo Standard',
  premium_2000:      '₦2,000/mo Premium',
  installment_3month:'Installment Plan',
}

// ─── Single helper — all mutations go server-side ────────────────────────────
async function manageSchool(payload: Record<string, unknown>) {
  const res = await fetch('/api/super-admin/manage-school', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  })
  return res.json() as Promise<{ ok: boolean; error?: string; [k: string]: unknown }>
}

export default function SchoolCard({ school, onRefresh }: { school: School; onRefresh: () => void }) {
  const [expanded,   setExpanded]   = useState(false)
  const [loading,    setLoading]    = useState(false)
  const [showPay,    setShowPay]    = useState(false)
  const [payAmount,  setPayAmount]  = useState('')
  const [payRef,     setPayRef]     = useState('')
  const [payPlan,    setPayPlan]    = useState('basic_500')
  const [extendDays, setExtendDays] = useState(5)
  const [errMsg,     setErrMsg]     = useState('')

  const status = STATUS_CONFIG[school.setup_status] ?? STATUS_CONFIG.expired

  function showError(msg: string) {
    setErrMsg(msg)
    setTimeout(() => setErrMsg(''), 4000)
  }

  // ── Convert trial to permanent ──────────────────────────
  async function confirmPayment(type: 'setup' | 'subscription') {
    setLoading(true)
    const action = type === 'setup' ? 'confirm_setup' : 'confirm_subscription'
    const data = await manageSchool({
      action,
      school_id:   school.id,
      amount_ngn:  +payAmount,
      payment_ref: payRef,
      ...(type === 'subscription' ? { plan: payPlan } : {}),
    })
    if (data.ok) {
      setShowPay(false)
      onRefresh()
    } else {
      showError(data.error ?? 'Payment confirmation failed')
    }
    setLoading(false)
  }

  // ── Extend trial ────────────────────────────────────────
  async function extendTrial() {
    setLoading(true)
    const data = await manageSchool({
      action:    'extend_trial',
      school_id: school.id,
      days:      extendDays,
    })
    if (data.ok) onRefresh()
    else showError(data.error ?? 'Failed to extend trial')
    setLoading(false)
  }

  // ── Lock/unlock ─────────────────────────────────────────
  async function toggleLock() {
    setLoading(true)
    const data = await manageSchool({ action: 'toggle_lock', school_id: school.id })
    if (data.ok) onRefresh()
    else showError(data.error ?? 'Failed to toggle lock')
    setLoading(false)
  }

  const daysLeft = school.setup_status === 'trial'
    ? Math.max(0, Math.ceil(school.trial_days_left))
    : school.setup_status === 'active' && school.subscription_plan === 'free_month'
      ? Math.max(0, Math.ceil(school.free_days_left))
      : Math.max(0, Math.ceil(school.sub_days_left))

  return (
    <div className={`${styles.card} ${styles[`status_${school.setup_status}`]}`}>
      {/* Error message */}
      {errMsg && (
        <div style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:8, padding:'8px 12px', marginBottom:8, fontSize:'0.78rem', color:'#EF4444', fontWeight:600 }}>
          ⚠️ {errMsg}
        </div>
      )}

      {/* Card header */}
      <div className={styles.cardHeader}>
        <div className={styles.schoolInfo}>
          <div className={styles.schoolAvatar}>
            {school.name[0]}
          </div>
          <div>
            <p className={styles.schoolName}>{school.name}</p>
            <p className={styles.schoolSlug}>schoolos.ng/{school.slug}</p>
          </div>
        </div>
        <div className={styles.statusBadge} style={{ color: status.color, borderColor: status.color + '30', background: status.color + '12' }}>
          <status.icon size={11} color={status.color} />
          {status.label}
        </div>
      </div>

      {/* Key metrics */}
      <div className={styles.metrics}>
        <div className={styles.metric}>
          <span className={styles.metricVal}>{daysLeft}</span>
          <span className={styles.metricLbl}>
            {school.setup_status === 'trial' ? 'trial days' : 'days left'}
          </span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricVal}>{school.total_students}</span>
          <span className={styles.metricLbl}>students</span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricVal}>₦{((school.total_paid_ngn ?? 0)/1000).toFixed(0)}k</span>
          <span className={styles.metricLbl}>paid</span>
        </div>
        {school.setup_status === 'trial' && (
          <div className={styles.metric}>
            <span className={styles.metricVal} style={{ color: school.trial_active_score > 60 ? '#10B981' : '#F59E0B' }}>
              {school.trial_active_score}%
            </span>
            <span className={styles.metricLbl}>activity</span>
          </div>
        )}
      </div>

      {/* Plan info */}
      {school.subscription_plan && (
        <p className={styles.planLabel}>
          Plan: {PLANS[school.subscription_plan] ?? school.subscription_plan}
          {school.installment_count > 0 && ` · ${school.installment_count}/3 paid`}
        </p>
      )}

      {/* Trial progress bar */}
      {school.setup_status === 'trial' && (
        <div className={styles.progressTrack}>
          <div className={styles.progressFill}
            style={{ width: `${100 - (daysLeft / 10) * 100}%` }} />
        </div>
      )}

      {/* Actions */}
      <div className={styles.actions}>
        {/* Trial → confirm payment */}
        {(school.setup_status === 'trial' || school.setup_status === 'expired') && (
          <button className={styles.actionBtn} style={{ background: '#10B981' }}
            onClick={() => { setShowPay(true); setPayAmount('') }}>
            ✅ Confirm Payment
          </button>
        )}
        {/* Active free month → confirm subscription */}
        {school.setup_status === 'active' && school.subscription_plan === 'free_month' && (
          <button className={styles.actionBtn} style={{ background: '#7C3AED' }}
            onClick={() => { setShowPay(true); setPayAmount('') }}>
            💳 Activate Subscription
          </button>
        )}
        {/* Extend trial */}
        {school.setup_status === 'trial' && (
          <button className={styles.extendBtn}
            onClick={extendTrial} disabled={loading}>
            +{extendDays}d extend
          </button>
        )}
        {/* Toggle expand */}
        <button className={styles.expandBtn} onClick={() => setExpanded(!expanded)}>
          {expanded ? '▲' : '▼'}
        </button>
      </div>

      {/* Expanded: notes + lock */}
      {expanded && (
        <div className={styles.expanded}>
          {school.notes && <p className={styles.notes}>📝 {school.notes}</p>}
          <div className={styles.expandActions}>
            <button className={styles.lockBtn}
              style={{ color: school.setup_status === 'locked' ? '#10B981' : '#EF4444' }}
              onClick={toggleLock} disabled={loading}>
              {school.setup_status === 'locked' ? '🔓 Unlock School' : '🔒 Lock School'}
            </button>
            <a href={`/dashboard/principal?school=${school.id}`}
              className={styles.viewBtn} target="_blank" rel="noreferrer">
              👁 View Portal
            </a>
          </div>
        </div>
      )}

      {/* Payment modal */}
      {showPay && (
        <div className={styles.payOverlay} onClick={() => setShowPay(false)}>
          <div className={styles.payModal} onClick={e => e.stopPropagation()}>
            <h4>Confirm Payment — {school.name}</h4>

            {school.setup_status !== 'active' && (
              <>
                <label className={styles.label}>Amount Paid (₦)</label>
                <input className={styles.input} type="number" value={payAmount}
                  onChange={e => setPayAmount(e.target.value)} placeholder="e.g. 50000" autoFocus />
                <label className={styles.label}>Payment Reference</label>
                <input className={styles.input} value={payRef}
                  onChange={e => setPayRef(e.target.value)} placeholder="Paystack / bank ref" />
                <button className={styles.confirmBtn}
                  disabled={!payAmount || loading}
                  onClick={() => confirmPayment('setup')}>
                  {loading ? '...' : '✅ Mark Setup as Paid → 1 Month Free'}
                </button>
              </>
            )}

            {school.setup_status === 'active' && (
              <>
                <label className={styles.label}>Subscription Plan</label>
                <select className={styles.input} value={payPlan} onChange={e => setPayPlan(e.target.value)}>
                  <option value="basic_500">₦500/month — Basic</option>
                  <option value="standard_1000">₦1,000/month — Standard</option>
                  <option value="premium_2000">₦2,000/month — Premium</option>
                  <option value="installment_3month">Installment (3 months)</option>
                </select>
                <label className={styles.label}>Amount Paid (₦)</label>
                <input className={styles.input} type="number" value={payAmount}
                  onChange={e => setPayAmount(e.target.value)} placeholder="e.g. 500" />
                <label className={styles.label}>Payment Reference</label>
                <input className={styles.input} value={payRef}
                  onChange={e => setPayRef(e.target.value)} placeholder="Paystack / bank ref" />
                <button className={styles.confirmBtn}
                  disabled={!payAmount || loading}
                  onClick={() => confirmPayment('subscription')}>
                  {loading ? '...' : '💳 Activate Subscription'}
                </button>
              </>
            )}

            <button className={styles.cancelPayBtn} onClick={() => setShowPay(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
