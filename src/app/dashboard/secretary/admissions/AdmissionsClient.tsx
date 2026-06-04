'use client'
// src/app/dashboard/secretary/admissions/AdmissionsClient.tsx

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import styles from '../secretary.module.css'

const STATUS_COLORS = { pending: styles.badgeYellow, approved: styles.badgeGreen, rejected: styles.badgeRed, waitlisted: styles.badgeBlue }

interface Admission {
  id: string; applicant_name: string; applicant_email: string; class_applied: string
  status: string; applied_at: string; notes: string | null
}
interface Props { admissions: Admission[]; profile: any; school: any; userId: string; classes: any[] }

export default function AdmissionsClient({ admissions: init, profile, school, userId, classes }: Props) {
  const [admissions, setAdmissions] = useState(init)
  const [tab,        setTab]        = useState('pending')
  const [modal,      setModal]      = useState(false)
  const [viewItem,   setViewItem]   = useState<Admission | null>(null)
  const [saving,     setSaving]     = useState(false)
  const [msg,        setMsg]        = useState('')
  const [form,       setForm]       = useState({ applicant_name: '', applicant_email: '', class_applied: '', notes: '' })

  const supabase = createClient()
  const sc       = school?.primary_color ?? '#7C3AED'

  const filtered = admissions.filter(a => tab === 'all' || a.status === tab)

  async function createAdmission() {
    if (!form.applicant_name.trim()) { setMsg('Name is required.'); return }
    setSaving(true); setMsg('')
    const { data, error } = await supabase.from('admissions').insert({
      applicant_name: form.applicant_name, applicant_email: form.applicant_email,
      class_applied: form.class_applied, notes: form.notes || null,
      school_id: school?.id, status: 'pending', applied_at: new Date().toISOString(),
    }).select().single()

    if (!error && data) {
      setAdmissions(p => [data, ...p]); setMsg('Application created!'); setModal(false)
    } else setMsg(error?.message ?? 'Failed')
    setSaving(false)
  }

  async function updateStatus(id: string, status: string) {
    setSaving(true)
    await supabase.from('admissions').update({ status }).eq('id', id)
    setAdmissions(p => p.map(a => a.id === id ? { ...a, status } : a))
    setViewItem(v => v?.id === id ? { ...v, status } : v)
    setSaving(false)
  }

  async function deleteAdmission(id: string) {
    await supabase.from('admissions').delete().eq('id', id)
    setAdmissions(p => p.filter(a => a.id !== id))
    setViewItem(null)
  }

  function formatDate(d: string) { return new Date(d).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' }) }

  return (
    <RolePageWrapper userId={userId} role="secretary" profile={profile} school={school} title="Admissions">
      {/* Tabs + Add */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flex: 1, overflowX: 'auto' }}>
          {['all', 'pending', 'approved', 'rejected', 'waitlisted'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding: '6px 14px', borderRadius: 'var(--radius-full)', border: '1px solid', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                background: tab === t ? sc + '22' : 'var(--glass-bg)',
                borderColor: tab === t ? sc : 'var(--glass-border)',
                color: tab === t ? sc : 'var(--text-muted)',
              }}>{t.charAt(0).toUpperCase() + t.slice(1)} <span style={{ opacity: 0.7 }}>({admissions.filter(a => t === 'all' || a.status === t).length})</span></button>
          ))}
        </div>
        <button className={styles.btnPrimary} onClick={() => { setMsg(''); setModal(true) }} style={{ height: 40, padding: '0 var(--space-4)', whiteSpace: 'nowrap', flexShrink: 0 }}>+ New</button>
      </div>

      {filtered.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyEmoji}>📋</p>
          <p className={styles.emptyTitle}>No {tab} applications</p>
          <p className={styles.emptyHint}>Applications submitted to this school appear here</p>
        </div>
      ) : (
        filtered.map(a => (
          <div key={a.id} className={styles.listItem} onClick={() => setViewItem(a)}>
            <div className={styles.listIconBox} style={{ background: sc + '22' }}>
              <span style={{ fontSize: '1.2rem' }}>📋</span>
            </div>
            <div className={styles.listContent}>
              <p className={styles.listTitle}>{a.applicant_name}</p>
              <p className={styles.listSub}>{a.class_applied} · {formatDate(a.applied_at)}</p>
            </div>
            <span className={`${styles.listBadge} ${(STATUS_COLORS as any)[a.status] ?? styles.badgeBlue}`} style={{ textTransform: 'capitalize' }}>{a.status}</span>
          </div>
        ))
      )}

      {/* View/Action Modal */}
      {viewItem && (
        <div className={styles.modalOverlay} onClick={() => setViewItem(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>{viewItem.applicant_name}</h2>
            {[
              ['Email', viewItem.applicant_email || '—'],
              ['Class Applied', viewItem.class_applied || '—'],
              ['Applied', formatDate(viewItem.applied_at)],
              ['Status', viewItem.status],
              ['Notes', viewItem.notes || '—'],
            ].map(([label, val]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-3) 0', borderBottom: '1px solid var(--glass-border)', fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)', textTransform: label === 'Status' ? 'capitalize' : 'none' }}>{val}</span>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-5)', flexWrap: 'wrap' }}>
              {viewItem.status !== 'approved'   && <button className={styles.btnPrimary} onClick={() => updateStatus(viewItem.id, 'approved')}   disabled={saving} style={{ flex: 1 }}>✅ Approve</button>}
              {viewItem.status !== 'waitlisted' && <button className={styles.btnGhost}   onClick={() => updateStatus(viewItem.id, 'waitlisted')} disabled={saving} style={{ flex: 1 }}>⏳ Waitlist</button>}
              {viewItem.status !== 'rejected'   && <button className={styles.btnDanger}  onClick={() => updateStatus(viewItem.id, 'rejected')}   disabled={saving} style={{ flex: 1 }}>✕ Reject</button>}
            </div>
            <button onClick={() => deleteAdmission(viewItem.id)} style={{ width: '100%', marginTop: 'var(--space-3)', padding: 'var(--space-3)', background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '0.78rem', cursor: 'pointer' }}>
              🗑️ Delete application
            </button>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {modal && (
        <div className={styles.modalOverlay} onClick={() => setModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>New Application</h2>
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
              <select className={styles.formSelect} value={form.class_applied} onChange={e => setForm(p => ({ ...p, class_applied: e.target.value }))}>
                <option value="">— Select class —</option>
                {classes.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Notes</label>
              <textarea className={styles.formTextarea} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Any additional notes…" rows={3} />
            </div>
            {msg && <p style={{ fontSize: '0.78rem', color: msg.includes('!') ? '#10B981' : '#EF4444', margin: '0 0 var(--space-3)' }}>{msg}</p>}
            <div className={styles.modalActions}>
              <button className={styles.btnGhost} onClick={() => setModal(false)}>Cancel</button>
              <button className={styles.btnPrimary} onClick={createAdmission} disabled={saving}>{saving ? 'Saving…' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ height: 110 }} />
    </RolePageWrapper>
  )
}
