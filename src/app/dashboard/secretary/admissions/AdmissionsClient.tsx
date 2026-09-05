'use client'
// src/app/dashboard/secretary/admissions/AdmissionsClient.tsx
// Phase 4, Lane D. Repointed from the legacy public.admissions table to
// the canonical admission_applications table (see
// sql/admission-system-schema.sql). This is now the single admission
// review surface for this school - the former /secretary/applications
// module was a disconnected duplicate and has been removed.
//
// Status writes go through /api/admission/applications (PATCH, staff
// branch) rather than a direct Supabase client call, so the required
// admission_status_events row gets written atomically with the status
// change and the applicant's timeline never falls out of sync with
// what staff actually did.

import { useState } from 'react'
import RolePageWrapper from '@/components/RolePageWrapper'
import { ClipboardIcon, CheckCircleIcon, ClockIcon, XIcon, AlertCircleIcon } from '@/components/Icons'
import GaugeStat from '@/components/GaugeStat'
import motion from '@/components/dashboard-motion.module.css'
import styles from '../secretary.module.css'
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh'

const STATUS_LABEL: Record<string, string> = {
  submitted: 'Submitted',
  under_review: 'Under Review',
  more_info_required: 'More Info Required',
  shortlisted: 'Shortlisted',
  interview_scheduled: 'Interview Scheduled',
  assessment_scheduled: 'Assessment Scheduled',
  accepted: 'Accepted',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
  expired: 'Expired',
}

const STATUS_COLORS: Record<string, string> = {
  submitted: 'badgeBlue', under_review: 'badgeBlue', more_info_required: 'badgeYellow',
  shortlisted: 'badgeBlue', interview_scheduled: 'badgeBlue', assessment_scheduled: 'badgeBlue',
  accepted: 'badgeGreen', rejected: 'badgeRed', withdrawn: 'badgeGray', expired: 'badgeGray',
}

const TABS = ['all', 'submitted', 'under_review', 'shortlisted', 'accepted', 'rejected']

interface Application {
  id: string; applicant_name: string; applicant_email: string | null; applicant_phone: string | null
  class_applying_for: string | null; status: string; submitted_at: string | null
  interview_at: string | null; assessment_at: string | null; decision_notes: string | null
  created_at: string
}
interface Props { admissions: Application[]; profile: any; school: any; userId: string; classes: any[] }

export default function AdmissionsClient({ admissions: init, profile, school, userId, classes }: Props) {
  const [admissions, setAdmissions] = useState(init)
  const [tab,        setTab]        = useState('all')
  const [modal,      setModal]      = useState(false)
  const [viewItem,   setViewItem]   = useState<Application | null>(null)
  const [saving,     setSaving]     = useState(false)
  const [msg,        setMsg]        = useState('')
  const [msgIsError, setMsgIsError] = useState(false)
  const [form, setForm] = useState({ applicant_name: '', applicant_email: '', class_applying_for: '', notes: '' })

  const sc = school?.primary_color ?? '#800020'
  const filtered = admissions.filter(a => tab === 'all' || a.status === tab)

  async function load() {
    try {
      const res = await fetch('/api/admission/applications')
      if (!res.ok) return
      const json = await res.json()
      setAdmissions(json.applications ?? [])
    } catch {
      // Background live-sync refresh - stay on the current view.
    }
  }

  // Principal and secretary both review the same admissions queue at
  // this school - a status change by either should show up for both
  // without a manual reload.
  useRealtimeRefresh({ tables: ['admission_applications', 'admission_status_events'], onChange: load })

  async function createApplication() {
    if (!form.applicant_name.trim()) { setMsg('Applicant name is required.'); setMsgIsError(true); return }
    setSaving(true); setMsg('')
    try {
      const res = await fetch('/api/admission/staff/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicantName: form.applicant_name,
          applicantEmail: form.applicant_email,
          classApplyingFor: form.class_applying_for,
          notes: form.notes,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Could not record this application.')
      setAdmissions(p => [data.application, ...p])
      setMsg('Application recorded.'); setMsgIsError(false)
      setModal(false)
      setForm({ applicant_name: '', applicant_email: '', class_applying_for: '', notes: '' })
    } catch (e: any) {
      setMsg(e.message); setMsgIsError(true)
    } finally {
      setSaving(false)
    }
  }

  async function updateStatus(id: string, status: string) {
    setSaving(true); setMsg('')
    try {
      const res = await fetch('/api/admission/applications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Could not update status.')
      setAdmissions(p => p.map(a => a.id === id ? { ...a, status } : a))
      setViewItem(v => v?.id === id ? { ...v, status } : v)
    } catch (e: any) {
      setMsg(e.message); setMsgIsError(true)
    } finally {
      setSaving(false)
    }
  }

  function formatDate(d: string | null) {
    if (!d) return 'N/A'
    return new Date(d).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  return (
    <RolePageWrapper userId={userId} role="secretary" profile={profile} school={school} title="Admissions">
      <div className={motion.riseIn} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 'var(--space-5)' }}>
        <div className={`glass-card ${motion.pressable}`} style={{ padding: 14 }}>
          <GaugeStat label="Awaiting Review" value={admissions.filter(a => ['submitted', 'under_review'].includes(a.status)).length} color="var(--status-warn, #F59E0B)" size={56} />
        </div>
        <div className={`glass-card ${motion.pressable}`} style={{ padding: 14 }}>
          <GaugeStat label="Accepted" value={admissions.filter(a => a.status === 'accepted').length} color="var(--status-ok, #10B981)" size={56} delayMs={80} />
        </div>
        <div className={`glass-card ${motion.pressable}`} style={{ padding: 14 }}>
          <GaugeStat label="Total" value={admissions.length} color={sc} size={56} delayMs={160} />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flex: 1, overflowX: 'auto' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding: '6px 14px', borderRadius: 'var(--radius-full)', border: '1px solid', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                background: tab === t ? sc + '22' : 'var(--glass-bg)',
                borderColor: tab === t ? sc : 'var(--glass-border)',
                color: tab === t ? sc : 'var(--text-muted)',
              }}>{t === 'all' ? 'All' : STATUS_LABEL[t] ?? t} <span style={{ opacity: 0.7 }}>({admissions.filter(a => t === 'all' || a.status === t).length})</span></button>
          ))}
        </div>
        <button className={styles.btnPrimary} onClick={() => { setMsg(''); setModal(true) }} style={{ height: 40, padding: '0 var(--space-4)', whiteSpace: 'nowrap', flexShrink: 0 }}>+ Record Applicant</button>
      </div>

      {msg && !modal && (
        <p style={{ fontSize: '0.8rem', color: msgIsError ? '#EF4444' : '#10B981', margin: '0 0 var(--space-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
          {msgIsError && <AlertCircleIcon size={13} color="#EF4444" />} {msg}
        </p>
      )}

      {filtered.length === 0 ? (
        <div className={styles.emptyState}>
          <ClipboardIcon size={32} color="var(--text-muted)" />
          <p className={styles.emptyTitle}>No applications{tab !== 'all' ? ` in ${STATUS_LABEL[tab] ?? tab}` : ''}</p>
          <p className={styles.emptyHint}>Applications submitted through SchoolOS, or recorded by staff, appear here.</p>
        </div>
      ) : (
        filtered.map((a, i) => (
          <div key={a.id} className={`${styles.listItem} ${motion.staggerItem}`} style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }} onClick={() => setViewItem(a)}>
            <div className={styles.listIconBox} style={{ background: sc + '22' }}>
              <ClipboardIcon size={17} color={sc} />
            </div>
            <div className={styles.listContent}>
              <p className={styles.listTitle}>{a.applicant_name}</p>
              <p className={styles.listSub}>{a.class_applying_for || 'General'} · {formatDate(a.submitted_at ?? a.created_at)}</p>
            </div>
            <span className={`${styles.listBadge} ${(styles as any)[STATUS_COLORS[a.status]] ?? styles.badgeBlue}`}>{STATUS_LABEL[a.status] ?? a.status}</span>
          </div>
        ))
      )}

      {viewItem && (
        <div className={styles.modalOverlay} onClick={() => setViewItem(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>{viewItem.applicant_name}</h2>
            {[
              ['Email', viewItem.applicant_email || 'N/A'],
              ['Phone', viewItem.applicant_phone || 'N/A'],
              ['Class Applying For', viewItem.class_applying_for || 'N/A'],
              ['Submitted', formatDate(viewItem.submitted_at)],
              ['Status', STATUS_LABEL[viewItem.status] ?? viewItem.status],
              ['Notes', viewItem.decision_notes || 'N/A'],
            ].map(([label, val]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-3) 0', borderBottom: '1px solid var(--glass-border)', fontSize: '0.85rem', gap: 12 }}>
                <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{label}</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)', textAlign: 'right' }}>{val}</span>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-5)', flexWrap: 'wrap' }}>
              {viewItem.status !== 'accepted' && <button className={styles.btnPrimary} onClick={() => updateStatus(viewItem.id, 'accepted')} disabled={saving} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><CheckCircleIcon size={14} color="#fff" /> Accept</button>}
              {viewItem.status !== 'shortlisted' && <button className={styles.btnGhost} onClick={() => updateStatus(viewItem.id, 'shortlisted')} disabled={saving} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><ClockIcon size={14} /> Shortlist</button>}
              {viewItem.status !== 'rejected' && <button className={styles.btnDanger} onClick={() => updateStatus(viewItem.id, 'rejected')} disabled={saving} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><XIcon size={14} color="var(--danger)" /> Reject</button>}
            </div>
            {viewItem.status !== 'more_info_required' && (
              <button className={styles.btnGhost} onClick={() => updateStatus(viewItem.id, 'more_info_required')} disabled={saving} style={{ width: '100%', marginTop: 'var(--space-2)' }}>
                Request more information
              </button>
            )}
          </div>
        </div>
      )}

      {modal && (
        <div className={styles.modalOverlay} onClick={() => setModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Record Walk-in Applicant</h2>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0 0 var(--space-4)' }}>
              For applicants who applied in person or by phone rather than through SchoolOS directly.
            </p>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Applicant Name *</label>
              <input className={styles.formInput} value={form.applicant_name} onChange={e => setForm(p => ({ ...p, applicant_name: e.target.value }))} placeholder="Full name" />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Email</label>
              <input className={styles.formInput} type="email" value={form.applicant_email} onChange={e => setForm(p => ({ ...p, applicant_email: e.target.value }))} placeholder="applicant@email.com" />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Class</label>
              <select className={styles.formSelect} value={form.class_applying_for} onChange={e => setForm(p => ({ ...p, class_applying_for: e.target.value }))}>
                <option value="">Select class</option>
                {classes.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Notes</label>
              <textarea className={styles.formTextarea} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Any additional notes" rows={3} />
            </div>
            {msg && modal && <p style={{ fontSize: '0.78rem', color: msgIsError ? '#EF4444' : '#10B981', margin: '0 0 var(--space-3)' }}>{msg}</p>}
            <div className={styles.modalActions}>
              <button className={styles.btnGhost} onClick={() => setModal(false)}>Cancel</button>
              <button className={styles.btnPrimary} onClick={createApplication} disabled={saving}>{saving ? 'Saving…' : 'Record Applicant'}</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ height: 110 }} />
    </RolePageWrapper>
  )
}
