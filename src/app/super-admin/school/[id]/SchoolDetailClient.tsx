'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeftIcon, SchoolIcon, PeopleIcon, WalletIcon,
  BellIcon, EditIcon, CheckCircleIcon, FlameIcon,
  ClockIcon, RefreshIcon, TrashIcon,
} from '@/components/Icons'
import styles from './school-detail.module.css'

interface Props {
  school:     any
  payments:   any[]
  staff:      any[]
  reminders:  any[]
  adminId:    string
  compliance: {
    contact_name?: string | null
    contact_role?: string | null
    contact_phone?: string | null
    contact_email?: string | null
    verified_bank_name?: string | null
    verified_account_number?: string | null
    verified_account_name?: string | null
    verification_notes?: string | null
    is_verified?: boolean
    verified_at?: string | null
  } | null
}

const STATUS_COLOR: Record<string, string> = {
  trial:'#F59E0B', active:'#10B981', expired:'#EF4444', suspended:'#6B7280', locked:'#EF4444',
}
const PLAN_LABEL: Record<string, string> = {
  free_month:'1 Month Free', basic_500:'₦500/mo Basic',
  standard_1000:'₦1,000/mo Standard', premium_2000:'₦2,000/mo Premium',
  installment_3month:'Installment Plan',
}
const ROLE_COLOR: Record<string, string> = {
  principal:'#8B5CF6', teacher:'#3B82F6', student:'#10B981',
  bursar:'#F59E0B', secretary:'#EC4899', parent:'#F97316',
}

// ─── Thin wrapper so every call goes through the server-side route ────────────
async function manageSchool(payload: Record<string, unknown>): Promise<{ ok: boolean; error?: string; [k: string]: unknown }> {
  const res  = await fetch('/api/super-admin/manage-school', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  })
  return res.json()
}

export default function SchoolDetailClient({ school, payments, staff, reminders, adminId, compliance }: Props) {
  const [tab,        setTab]        = useState<'overview'|'staff'|'payments'|'compliance'|'settings'>('overview')
  const [saving,     setSaving]     = useState(false)
  const [editNotes,  setEditNotes]  = useState(false)
  const [notes,      setNotes]      = useState(school.notes ?? '')
  const [extendDays, setExtendDays] = useState(5)
  const [msg,        setMsg]        = useState('')
  const [isError,    setIsError]    = useState(false)
  // Track mutable school state locally so UI reflects changes without a reload
  const [schoolStatus, setSchoolStatus] = useState(school.setup_status)
  const router = useRouter()

  // Compliance form state, seeded from the record passed in (or the
  // school's existing principal/bank fields, as a sensible starting point
  // if no compliance record exists yet).
  const [complianceContactName,  setComplianceContactName]  = useState(compliance?.contact_name ?? '')
  const [complianceContactRole,  setComplianceContactRole]  = useState(compliance?.contact_role ?? 'Principal')
  const [complianceContactPhone, setComplianceContactPhone] = useState(compliance?.contact_phone ?? '')
  const [complianceContactEmail, setComplianceContactEmail] = useState(compliance?.contact_email ?? '')
  const [complianceBankName,     setComplianceBankName]     = useState(compliance?.verified_bank_name ?? school.bank_name ?? '')
  const [complianceAccountNumber, setComplianceAccountNumber] = useState(compliance?.verified_account_number ?? school.account_number ?? '')
  const [complianceAccountName,  setComplianceAccountName]  = useState(compliance?.verified_account_name ?? school.account_name ?? '')
  const [complianceNotes,        setComplianceNotes]        = useState(compliance?.verification_notes ?? '')
  const [isVerified,             setIsVerified]             = useState(compliance?.is_verified ?? false)
  const [verifiedAt,             setVerifiedAt]             = useState(compliance?.verified_at ?? null)

  const daysLeft = schoolStatus === 'trial'
    ? Math.max(0, Math.ceil(school.trial_days_left ?? 0))
    : schoolStatus === 'active' && school.subscription_plan === 'free_month'
      ? Math.max(0, Math.ceil(school.free_days_left ?? 0))
      : Math.max(0, Math.ceil(school.sub_days_left ?? 0))

  const statusColor = STATUS_COLOR[schoolStatus] ?? '#6B7280'

  function flash(text: string, error = false) {
    setIsError(error)
    setMsg(text)
    setTimeout(() => setMsg(''), 3500)
  }

  async function extendTrial() {
    setSaving(true)
    const data = await manageSchool({ action: 'extend_trial', school_id: school.id, days: extendDays })
    if (data.ok) flash(`Trial extended by ${extendDays} days ✓`)
    else flash(data.error ?? 'Failed to extend trial', true)
    setSaving(false)
  }

  async function toggleLock() {
    setSaving(true)
    const data = await manageSchool({ action: 'toggle_lock', school_id: school.id })
    if (data.ok) {
      const next = data.setup_status as string
      setSchoolStatus(next)
      flash(next === 'locked' ? 'School locked ✓' : 'School unlocked ✓')
    } else {
      flash(data.error ?? 'Failed to toggle lock', true)
    }
    setSaving(false)
  }

  async function saveNotes() {
    setSaving(true)
    const data = await manageSchool({ action: 'save_notes', school_id: school.id, notes })
    if (data.ok) { setEditNotes(false); flash('Notes saved ✓') }
    else flash(data.error ?? 'Failed to save notes', true)
    setSaving(false)
  }

  async function confirmPaymentAndActivate() {
    setSaving(true)
    const data = await manageSchool({ action: 'confirm_setup', school_id: school.id })
    if (data.ok) { setSchoolStatus('active'); flash('School activated with 1 month free ✓') }
    else flash(data.error ?? 'Failed to activate school', true)
    setSaving(false)
  }

  async function saveCompliance() {
    setSaving(true)
    const data = await manageSchool({
      action: 'save_compliance',
      school_id: school.id,
      contact_name:  complianceContactName,
      contact_role:  complianceContactRole,
      contact_phone: complianceContactPhone,
      contact_email: complianceContactEmail,
      verified_bank_name:      complianceBankName,
      verified_account_number: complianceAccountNumber,
      verified_account_name:   complianceAccountName,
      verification_notes:      complianceNotes,
    })
    if (data.ok) flash('Compliance details saved ✓')
    else flash(data.error ?? 'Failed to save compliance details', true)
    setSaving(false)
  }

  async function toggleVerified() {
    setSaving(true)
    if (isVerified) {
      const data = await manageSchool({ action: 'unverify_compliance', school_id: school.id })
      if (data.ok) { setIsVerified(false); setVerifiedAt(null); flash('Verification removed') }
      else flash(data.error ?? 'Failed to update', true)
    } else {
      // Save current form values first so verification reflects what's on screen
      await manageSchool({
        action: 'save_compliance',
        school_id: school.id,
        contact_name:  complianceContactName,
        contact_role:  complianceContactRole,
        contact_phone: complianceContactPhone,
        contact_email: complianceContactEmail,
        verified_bank_name:      complianceBankName,
        verified_account_number: complianceAccountNumber,
        verified_account_name:   complianceAccountName,
        verification_notes:      complianceNotes,
      })
      const data = await manageSchool({ action: 'verify_compliance', school_id: school.id })
      if (data.ok) {
        setIsVerified(true)
        setVerifiedAt(new Date().toISOString())
        flash('School verified — Paystack can now be connected ✓')
      } else {
        flash(data.error ?? 'Failed to verify', true)
      }
    }
    setSaving(false)
  }

  const TABS = [
    { id:'overview',   label:'Overview'  },
    { id:'staff',      label:`Staff (${staff.length})`       },
    { id:'payments',   label:`Payments (${payments.length})` },
    { id:'compliance', label: isVerified ? 'Compliance ✓' : 'Compliance' },
    { id:'settings',   label:'Settings'  },
  ] as const

  return (
    <div className={styles.page}>
      {/* Back button */}
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={() => router.back()}>
          <ArrowLeftIcon size={16}/> Back to Schools
        </button>
        {msg && (
          <span className={styles.msgBadge} style={{ background: isError ? 'rgba(239,68,68,0.12)' : undefined, color: isError ? '#EF4444' : undefined, borderColor: isError ? 'rgba(239,68,68,0.25)' : undefined }}>
            {msg}
          </span>
        )}
      </div>

      {/* School header */}
      <div className={styles.schoolHeader}>
        <div className={styles.schoolAvatar}>
          {school.name?.[0] ?? 'S'}
        </div>
        <div className={styles.schoolMeta}>
          <h1 className={styles.schoolName}>{school.name}</h1>
          <p className={styles.schoolSlug}>schoolos.ng/{school.slug}</p>
          <div style={{ display:'flex', gap:'var(--space-2)', flexWrap:'wrap', marginTop:'var(--space-2)' }}>
            <span className={styles.statusBadge} style={{ color:statusColor, borderColor:statusColor+'30', background:statusColor+'12' }}>
              {schoolStatus}
            </span>
            {school.subscription_plan && (
              <span className={styles.planBadge}>{PLAN_LABEL[school.subscription_plan] ?? school.subscription_plan}</span>
            )}
            {school.trial_extended && (
              <span className={styles.extendedBadge}>⏰ Trial Extended</span>
            )}
          </div>
        </div>
        <div className={styles.headerStats}>
          <div className={styles.headerStat}>
            <p className={styles.headerStatVal} style={{ color:statusColor }}>{daysLeft}</p>
            <p className={styles.headerStatLbl}>Days left</p>
          </div>
          <div className={styles.headerStat}>
            <p className={styles.headerStatVal}>{school.total_students ?? 0}</p>
            <p className={styles.headerStatLbl}>Students</p>
          </div>
          <div className={styles.headerStat}>
            <p className={styles.headerStatVal} style={{ color:'#10B981' }}>
              ₦{((school.total_paid_ngn ?? 0) / 1000).toFixed(0)}k
            </p>
            <p className={styles.headerStatLbl}>Paid</p>
          </div>
          <div className={styles.headerStat}>
            <p className={styles.headerStatVal} style={{ color: school.trial_active_score > 60 ? '#10B981' : '#F59E0B' }}>
              {school.trial_active_score ?? 0}%
            </p>
            <p className={styles.headerStatLbl}>Activity</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)}
            className={`${styles.tabBtn} ${tab===t.id ? styles.tabActive : ''}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ──────────────────────────────────────── */}
      {tab === 'overview' && (
        <div className={styles.grid2}>
          {/* Quick actions */}
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Quick Actions</h3>
            <div className={styles.actionList}>
              {schoolStatus === 'trial' && (
                <>
                  <div className={styles.actionRow}>
                    <span style={{ fontSize:'0.82rem', color:'var(--text-secondary)' }}>Extend trial by</span>
                    <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                      <input type="number" min={1} max={90} value={extendDays}
                        onChange={e => setExtendDays(+e.target.value)}
                        style={{ width:52, height:32, padding:'0 8px', background:'var(--input-bg)', border:'1px solid var(--input-border)', borderRadius:8, color:'var(--text-primary)', fontSize:'0.85rem', outline:'none' }}/>
                      <span style={{ fontSize:'0.8rem', color:'var(--text-muted)' }}>days</span>
                      <button onClick={extendTrial} disabled={saving}
                        style={{ padding:'6px 12px', background:'var(--gold-subtle)', border:'1px solid var(--gold-border)', borderRadius:999, color:'var(--gold)', fontSize:'0.75rem', fontWeight:700, cursor:'pointer' }}>
                        Extend
                      </button>
                    </div>
                  </div>
                  <button onClick={confirmPaymentAndActivate} disabled={saving}
                    style={{ width:'100%', height:40, background:'linear-gradient(135deg,#10B981,#059669)', color:'#fff', border:'none', borderRadius:10, fontWeight:700, fontSize:'0.85rem', cursor:'pointer' }}>
                    ✅ Mark Setup Paid → Activate
                  </button>
                </>
              )}

              {schoolStatus === 'expired' && (
                <button onClick={confirmPaymentAndActivate} disabled={saving}
                  style={{ width:'100%', height:40, background:'linear-gradient(135deg,#10B981,#059669)', color:'#fff', border:'none', borderRadius:10, fontWeight:700, fontSize:'0.85rem', cursor:'pointer' }}>
                  ✅ Confirm Payment & Reactivate
                </button>
              )}

              <button onClick={toggleLock} disabled={saving}
                style={{ width:'100%', height:40, background: schoolStatus==='locked' ? 'var(--success-subtle)' : 'var(--danger-subtle)', border: `1px solid ${schoolStatus==='locked' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`, borderRadius:10, fontWeight:700, fontSize:'0.85rem', cursor:'pointer', color: schoolStatus==='locked' ? '#10B981' : 'var(--danger)' }}>
                {schoolStatus === 'locked' ? '🔓 Unlock School' : '🔒 Lock School'}
              </button>
            </div>
          </div>

          {/* Notes */}
          <div className={styles.card}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'var(--space-3)' }}>
              <h3 className={styles.cardTitle}>Private Notes</h3>
              <button onClick={() => setEditNotes(!editNotes)}
                style={{ display:'flex', alignItems:'center', gap:4, padding:'4px 10px', background:'var(--glass-bg)', border:'1px solid var(--glass-border)', borderRadius:999, color:'var(--text-muted)', fontSize:'0.72rem', fontWeight:700, cursor:'pointer' }}>
                <EditIcon size={11}/> {editNotes ? 'Cancel' : 'Edit'}
              </button>
            </div>
            {editNotes ? (
              <>
                <textarea value={notes} onChange={e => setNotes(e.target.value)}
                  style={{ width:'100%', height:100, padding:'var(--space-3)', background:'var(--input-bg)', border:'1px solid var(--input-border)', borderRadius:10, color:'var(--text-primary)', fontSize:'0.85rem', outline:'none', resize:'vertical', lineHeight:1.5 }}
                  placeholder="Add private notes about this school..."/>
                <button onClick={saveNotes} disabled={saving}
                  style={{ width:'100%', height:36, background:'var(--brand)', color:'#fff', border:'none', borderRadius:8, fontWeight:700, fontSize:'0.82rem', cursor:'pointer', marginTop:8 }}>
                  Save
                </button>
              </>
            ) : (
              <p style={{ fontSize:'0.85rem', color: notes ? 'var(--text-secondary)' : 'var(--text-faint)', lineHeight:1.6, margin:0, fontStyle: notes ? 'normal' : 'italic' }}>
                {notes || 'No notes yet. Click Edit to add.'}
              </p>
            )}
          </div>

          {/* Trial reminders sent */}
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Trial Reminders Sent</h3>
            {reminders.length === 0
              ? <p style={{ fontSize:'0.82rem', color:'var(--text-muted)', margin:0 }}>No reminders sent yet</p>
              : reminders.map((r, i) => (
                  <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'var(--space-2) 0', borderBottom:'1px solid var(--glass-border)', fontSize:'0.82rem' }}>
                    <span style={{ color:'var(--text-secondary)', fontWeight:600 }}>Day {r.day_trigger} reminder</span>
                    <span style={{ color:'var(--text-muted)' }}>
                      {new Date(r.sent_at).toLocaleDateString('en-NG', { day:'numeric', month:'short', year:'numeric' })}
                    </span>
                  </div>
                ))
            }
          </div>

          {/* Subscription timeline */}
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Timeline</h3>
            {[
              ['Trial started',     school.trial_started_at],
              ['Trial ends',        school.trial_ends_at],
              ['Setup paid',        school.setup_paid_at],
              ['Free month starts', school.free_month_starts],
              ['Free month ends',   school.free_month_ends],
              ['Subscription ends', school.subscription_ends],
              ['Next payment due',  school.next_payment_due],
            ].map(([label, date]) => date && (
              <div key={label as string} style={{ display:'flex', justifyContent:'space-between', padding:'var(--space-2) 0', borderBottom:'1px solid var(--glass-border)', fontSize:'0.82rem' }}>
                <span style={{ color:'var(--text-muted)' }}>{label}</span>
                <span style={{ fontWeight:600, color:'var(--text-primary)' }}>
                  {new Date(date as string).toLocaleDateString('en-NG', { day:'numeric', month:'short', year:'numeric' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── STAFF ─────────────────────────────────────────── */}
      {tab === 'staff' && (
        <div>
          {staff.length === 0
            ? <div className={styles.empty}><PeopleIcon size={40} color="var(--text-faint)" strokeWidth={1}/><p>No staff yet</p></div>
            : <table className={styles.table}>
                <thead><tr>
                  <th className={styles.th}>Name</th>
                  <th className={styles.th}>Role</th>
                  <th className={styles.th}>Code</th>
                  <th className={styles.th}>Email</th>
                  <th className={styles.th}>Last Login</th>
                </tr></thead>
                <tbody>
                  {staff.map(s => (
                    <tr key={s.id}>
                      <td className={styles.td} style={{ fontWeight:600, color:'var(--text-primary)' }}>{s.full_name}</td>
                      <td className={styles.td}>
                        <span style={{ fontSize:'0.7rem', fontWeight:700, padding:'2px 8px', borderRadius:999, background:(ROLE_COLOR[s.role]??'#6B7280')+'18', color:ROLE_COLOR[s.role]??'#6B7280', textTransform:'capitalize' }}>
                          {s.role}
                        </span>
                      </td>
                      <td className={styles.td} style={{ fontFamily:'monospace', fontSize:'0.78rem' }}>{s.default_code}</td>
                      <td className={styles.td} style={{ color:'var(--text-muted)', fontSize:'0.8rem' }}>{s.email}</td>
                      <td className={styles.td} style={{ color:'var(--text-muted)', fontSize:'0.78rem' }}>
                        {s.last_sign_in_at ? new Date(s.last_sign_in_at).toLocaleDateString('en-NG', { day:'numeric', month:'short' }) : 'Never'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
          }
        </div>
      )}

      {/* ── PAYMENTS ──────────────────────────────────────── */}
      {tab === 'payments' && (
        <div>
          {payments.length === 0
            ? <div className={styles.empty}><WalletIcon size={40} color="var(--text-faint)" strokeWidth={1}/><p>No payments recorded</p></div>
            : <>
                <div style={{ background:'var(--glass-bg)', border:'1px solid var(--glass-border)', borderRadius:'var(--radius-xl)', padding:'var(--space-4) var(--space-5)', marginBottom:'var(--space-5)', display:'flex', gap:'var(--space-6)' }}>
                  <div>
                    <p style={{ fontSize:'0.65rem', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', margin:'0 0 2px' }}>Total Paid</p>
                    <p style={{ fontSize:'1.3rem', fontWeight:800, color:'#10B981', margin:0 }}>
                      ₦{payments.reduce((s,p) => s + Number(p.amount_ngn), 0).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p style={{ fontSize:'0.65rem', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', margin:'0 0 2px' }}>Transactions</p>
                    <p style={{ fontSize:'1.3rem', fontWeight:800, color:'var(--text-primary)', margin:0 }}>{payments.length}</p>
                  </div>
                </div>
                <table className={styles.table}>
                  <thead><tr>
                    <th className={styles.th}>Type</th>
                    <th className={styles.th}>Amount</th>
                    <th className={styles.th}>Plan</th>
                    <th className={styles.th}>Reference</th>
                    <th className={styles.th}>Date</th>
                  </tr></thead>
                  <tbody>
                    {payments.map(p => (
                      <tr key={p.id}>
                        <td className={styles.td} style={{ textTransform:'capitalize', fontWeight:600 }}>{p.payment_type}</td>
                        <td className={styles.td} style={{ fontWeight:700, color:'#10B981' }}>₦{Number(p.amount_ngn).toLocaleString()}</td>
                        <td className={styles.td}>{p.plan ? PLAN_LABEL[p.plan] ?? p.plan : '—'}</td>
                        <td className={styles.td} style={{ fontFamily:'monospace', fontSize:'0.75rem', color:'var(--text-muted)' }}>{p.payment_ref || '—'}</td>
                        <td className={styles.td} style={{ color:'var(--text-muted)', fontSize:'0.78rem' }}>
                          {new Date(p.confirmed_at).toLocaleDateString('en-NG', { day:'numeric', month:'short', year:'numeric' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
          }
        </div>
      )}

      {/* ── SETTINGS ──────────────────────────────────────── */}
      {tab === 'compliance' && (
        <div className={styles.grid2}>
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Compliance Contact</h3>
            <p style={{ fontSize:'0.8rem', color:'var(--text-muted)', marginBottom:'var(--space-4)', lineHeight:1.5 }}>
              Required before this school can connect Paystack split payments —
              Paystack asks platforms like SchoolOS to keep due-diligence records
              on file for each onboarded business.
            </p>

            <label style={{ display:'block', fontSize:'0.78rem', color:'var(--text-muted)', marginBottom:4 }}>Contact Name</label>
            <input
              value={complianceContactName}
              onChange={e => setComplianceContactName(e.target.value)}
              placeholder="e.g. Simon Pius Segun"
              style={{ width:'100%', height:40, borderRadius:8, border:'1px solid var(--glass-border)', background:'var(--surface-2)', color:'var(--text-primary)', padding:'0 12px', marginBottom:12, fontSize:'0.85rem' }}
            />

            <label style={{ display:'block', fontSize:'0.78rem', color:'var(--text-muted)', marginBottom:4 }}>Role</label>
            <select
              value={complianceContactRole}
              onChange={e => setComplianceContactRole(e.target.value)}
              style={{ width:'100%', height:40, borderRadius:8, border:'1px solid var(--glass-border)', background:'var(--surface-2)', color:'var(--text-primary)', padding:'0 12px', marginBottom:12, fontSize:'0.85rem' }}
            >
              <option value="Principal">Principal</option>
              <option value="Proprietor">Proprietor</option>
              <option value="Bursar">Bursar</option>
              <option value="Other">Other</option>
            </select>

            <label style={{ display:'block', fontSize:'0.78rem', color:'var(--text-muted)', marginBottom:4 }}>Phone</label>
            <input
              value={complianceContactPhone}
              onChange={e => setComplianceContactPhone(e.target.value)}
              placeholder="e.g. 08012345678"
              style={{ width:'100%', height:40, borderRadius:8, border:'1px solid var(--glass-border)', background:'var(--surface-2)', color:'var(--text-primary)', padding:'0 12px', marginBottom:12, fontSize:'0.85rem' }}
            />

            <label style={{ display:'block', fontSize:'0.78rem', color:'var(--text-muted)', marginBottom:4 }}>Email</label>
            <input
              value={complianceContactEmail}
              onChange={e => setComplianceContactEmail(e.target.value)}
              placeholder="e.g. principal@school.com"
              style={{ width:'100%', height:40, borderRadius:8, border:'1px solid var(--glass-border)', background:'var(--surface-2)', color:'var(--text-primary)', padding:'0 12px', marginBottom:4, fontSize:'0.85rem' }}
            />
          </div>

          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Bank Verification</h3>
            <p style={{ fontSize:'0.8rem', color:'var(--text-muted)', marginBottom:'var(--space-4)', lineHeight:1.5 }}>
              Snapshot of the account verified at sign-off time — kept separate
              from the school's live banking details so changes later don't
              silently alter this audit record.
            </p>

            <label style={{ display:'block', fontSize:'0.78rem', color:'var(--text-muted)', marginBottom:4 }}>Bank Name</label>
            <input
              value={complianceBankName}
              onChange={e => setComplianceBankName(e.target.value)}
              placeholder="e.g. GTBank"
              style={{ width:'100%', height:40, borderRadius:8, border:'1px solid var(--glass-border)', background:'var(--surface-2)', color:'var(--text-primary)', padding:'0 12px', marginBottom:12, fontSize:'0.85rem' }}
            />

            <label style={{ display:'block', fontSize:'0.78rem', color:'var(--text-muted)', marginBottom:4 }}>Account Number</label>
            <input
              value={complianceAccountNumber}
              onChange={e => setComplianceAccountNumber(e.target.value)}
              placeholder="10-digit NUBAN"
              style={{ width:'100%', height:40, borderRadius:8, border:'1px solid var(--glass-border)', background:'var(--surface-2)', color:'var(--text-primary)', padding:'0 12px', marginBottom:12, fontSize:'0.85rem' }}
            />

            <label style={{ display:'block', fontSize:'0.78rem', color:'var(--text-muted)', marginBottom:4 }}>Account Name</label>
            <input
              value={complianceAccountName}
              onChange={e => setComplianceAccountName(e.target.value)}
              placeholder="Must match bank records"
              style={{ width:'100%', height:40, borderRadius:8, border:'1px solid var(--glass-border)', background:'var(--surface-2)', color:'var(--text-primary)', padding:'0 12px', marginBottom:12, fontSize:'0.85rem' }}
            />

            <label style={{ display:'block', fontSize:'0.78rem', color:'var(--text-muted)', marginBottom:4 }}>Verification Notes</label>
            <textarea
              value={complianceNotes}
              onChange={e => setComplianceNotes(e.target.value)}
              placeholder="e.g. Confirmed via phone call with principal, CAC docs reviewed..."
              rows={3}
              style={{ width:'100%', borderRadius:8, border:'1px solid var(--glass-border)', background:'var(--surface-2)', color:'var(--text-primary)', padding:'10px 12px', marginBottom:12, fontSize:'0.85rem', resize:'vertical' }}
            />

            <button
              disabled={saving}
              onClick={saveCompliance}
              style={{ width:'100%', height:40, background:'var(--surface-2)', border:'1px solid var(--glass-border)', borderRadius:8, color:'var(--text-primary)', fontWeight:700, fontSize:'0.82rem', cursor:'pointer', marginBottom:10, opacity: saving ? 0.6 : 1 }}
            >
              Save Details
            </button>

            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 0', borderTop:'1px solid var(--glass-border)' }}>
              <div>
                <p style={{ fontSize:'0.85rem', fontWeight:700, color: isVerified ? '#10B981' : 'var(--text-muted)' }}>
                  {isVerified ? '✓ Verified' : 'Not Verified'}
                </p>
                {isVerified && verifiedAt && (
                  <p style={{ fontSize:'0.72rem', color:'var(--text-muted)' }}>
                    {new Date(verifiedAt).toLocaleDateString('en-NG', { day:'numeric', month:'short', year:'numeric' })}
                  </p>
                )}
              </div>
              <button
                disabled={saving}
                onClick={toggleVerified}
                style={{
                  height:38, padding:'0 18px',
                  background: isVerified ? 'var(--danger-subtle)' : '#10B981',
                  border: isVerified ? '1px solid rgba(239,68,68,0.2)' : 'none',
                  borderRadius:8,
                  color: isVerified ? 'var(--danger)' : '#fff',
                  fontWeight:700, fontSize:'0.8rem', cursor:'pointer', opacity: saving ? 0.6 : 1,
                }}
              >
                {isVerified ? 'Unverify' : 'Mark Verified'}
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'settings' && (
        <div className={styles.grid2}>
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>School Information</h3>
            {[
              ['Name',          school.name],
              ['Slug / URL',    `schoolos.ng/${school.slug}`],
              ['Status',        schoolStatus],
              ['Plan',          school.subscription_plan ? PLAN_LABEL[school.subscription_plan] : 'None'],
              ['Total Students',school.total_students ?? 0],
              ['Activity Score',`${school.trial_active_score ?? 0}%`],
            ].map(([label, value]) => (
              <div key={label as string} style={{ display:'flex', justifyContent:'space-between', padding:'var(--space-3) 0', borderBottom:'1px solid var(--glass-border)', fontSize:'0.85rem' }}>
                <span style={{ color:'var(--text-muted)' }}>{label}</span>
                <span style={{ fontWeight:600, color:'var(--text-primary)' }}>{value}</span>
              </div>
            ))}
          </div>

          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Danger Zone</h3>
            <p style={{ fontSize:'0.8rem', color:'var(--text-muted)', marginBottom:'var(--space-4)', lineHeight:1.5 }}>
              Permanently deletes the school, all staff accounts, and all data. Cannot be undone.
            </p>
            <button
              disabled={saving}
              style={{ width:'100%', height:42, background:'var(--danger-subtle)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:10, color:'var(--danger)', fontWeight:700, fontSize:'0.85rem', cursor:'pointer', opacity: saving ? 0.6 : 1 }}
              onClick={async () => {
                if (!confirm(`DELETE ${school.name}?\n\nThis will permanently delete the school and ALL staff auth accounts. This CANNOT be undone.`)) return
                setSaving(true)
                const data = await manageSchool({ action: 'delete_school', school_id: school.id })
                if (data.ok) {
                  router.push('/super-admin/schools')
                } else {
                  flash(data.error ?? 'Delete failed', true)
                  setSaving(false)
                }
              }}>
              {saving ? '⏳ Deleting...' : '🗑️ Delete School Permanently'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
