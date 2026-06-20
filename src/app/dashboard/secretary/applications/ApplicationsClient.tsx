'use client'
// src/app/dashboard/secretary/applications/ApplicationsClient.tsx

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import styles from '../secretary.module.css'

// `applications.status` is constrained in the DB to exactly these 3 values —
// keep the UI in lock-step or updates silently fail the CHECK constraint.
const STATUS_MAP = { pending: styles.badgeYellow, admitted: styles.badgeGreen, rejected: styles.badgeRed }
const APP_TYPES   = ['Enrollment', 'Transfer In', 'Transfer Out', 'Re-enrollment', 'Special Needs', 'Other']

interface Application { id: string; applicant_name: string; class_applying_for: string; status: 'pending' | 'admitted' | 'rejected'; created_at: string; notes: string | null }
interface Props { applications: Application[]; profile: any; school: any; userId: string }

export default function ApplicationsClient({ applications: init, profile, school, userId }: Props) {
  const [apps,     setApps]     = useState(init)
  const [tab,      setTab]      = useState('all')
  const [modal,    setModal]    = useState(false)
  const [viewItem, setViewItem] = useState<Application | null>(null)
  const [saving,   setSaving]   = useState(false)
  const [msg,      setMsg]      = useState('')
  const [form,     setForm]     = useState({ applicant_name: '', class_applying_for: 'Enrollment', notes: '' })

  const supabase = createClient()
  const sc       = school?.primary_color ?? '#7C3AED'

  const filtered = apps.filter(a => tab === 'all' || a.status === tab)

  async function create() {
    if (!form.applicant_name.trim()) { setMsg('Name required.'); return }
    setSaving(true); setMsg('')
    const { data, error } = await supabase.from('applications').insert({
      applicant_name: form.applicant_name,
      class_applying_for: form.class_applying_for,
      notes: form.notes || null,
      school_id: school?.id,
      status: 'pending',
    }).select().single()
    if (!error && data) { setApps(p => [data, ...p]); setModal(false) }
    else setMsg(error?.message ?? 'Failed')
    setSaving(false)
  }

  async function updateStatus(id: string, status: Application['status']) {
    setSaving(true)
    const { error } = await supabase.from('applications').update({ status, reviewed_by: userId, reviewed_at: new Date().toISOString() }).eq('id', id)
    if (!error) {
      setApps(p => p.map(a => a.id === id ? { ...a, status } : a))
      setViewItem(v => v?.id === id ? { ...v, status } : v)
    } else {
      setMsg(error.message)
    }
    setSaving(false)
  }

  async function deleteApp(id: string) {
    await supabase.from('applications').delete().eq('id', id)
    setApps(p => p.filter(a => a.id !== id))
    setViewItem(null)
  }

  return (
    <RolePageWrapper userId={userId} role="secretary" profile={profile} school={school} title="Applications">
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flex: 1, overflowX: 'auto' }}>
          {['all', 'pending', 'admitted', 'rejected'].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: '6px 14px', borderRadius: 'var(--radius-full)', border: '1px solid', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', background: tab === t ? sc + '22' : 'var(--glass-bg)', borderColor: tab === t ? sc : 'var(--glass-border)', color: tab === t ? sc : 'var(--text-muted)' }}>
              {t.charAt(0).toUpperCase() + t.slice(1)} ({apps.filter(a => t === 'all' || a.status === t).length})
            </button>
          ))}
        </div>
        <button className={styles.btnPrimary} onClick={() => { setMsg(''); setModal(true) }} style={{ height: 40, padding: '0 var(--space-4)', whiteSpace: 'nowrap', flexShrink: 0 }}>+ New</button>
      </div>

      {filtered.length === 0 ? (
        <div className={styles.emptyState}><p className={styles.emptyEmoji}>📝</p><p className={styles.emptyTitle}>No applications</p><p className={styles.emptyHint}>Track enrollment and transfer applications here</p></div>
      ) : (
        filtered.map(a => (
          <div key={a.id} className={styles.listItem} onClick={() => setViewItem(a)}>
            <div className={styles.listIconBox} style={{ background: sc + '22' }}><span style={{ fontSize: '1.1rem' }}>📝</span></div>
            <div className={styles.listContent}>
              <p className={styles.listTitle}>{a.applicant_name}</p>
              <p className={styles.listSub}>{a.class_applying_for} · {new Date(a.created_at).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
            </div>
            <span className={`${styles.listBadge} ${(STATUS_MAP as any)[a.status] ?? styles.badgeBlue}`} style={{ textTransform: 'capitalize' }}>{a.status}</span>
          </div>
        ))
      )}

      {viewItem && (
        <div className={styles.modalOverlay} onClick={() => setViewItem(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>{viewItem.applicant_name}</h2>
            {[['Type', viewItem.class_applying_for], ['Status', viewItem.status], ['Submitted', new Date(viewItem.created_at).toLocaleDateString()], ['Notes', viewItem.notes ?? '—']].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-3) 0', borderBottom: '1px solid var(--glass-border)', fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>{l}</span><span style={{ fontWeight: 600, color: 'var(--text-primary)', textTransform: l === 'Status' ? 'capitalize' : 'none' }}>{v}</span>
              </div>
            ))}
            {msg && <p style={{ fontSize: '0.78rem', color: '#EF4444', margin: 'var(--space-3) 0 0' }}>{msg}</p>}
            <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-5)', flexWrap: 'wrap' }}>
              {viewItem.status !== 'admitted' && <button className={styles.btnPrimary} onClick={() => updateStatus(viewItem.id, 'admitted')} disabled={saving} style={{ flex: 1 }}>✅ Admit</button>}
              {viewItem.status !== 'rejected' && <button className={styles.btnDanger}  onClick={() => updateStatus(viewItem.id, 'rejected')} disabled={saving} style={{ flex: 1 }}>✕ Reject</button>}
              {viewItem.status !== 'pending'  && <button className={styles.btnGhost}   onClick={() => updateStatus(viewItem.id, 'pending')}  disabled={saving} style={{ flex: 1 }}>↺ Back to Pending</button>}
            </div>
            <button onClick={() => deleteApp(viewItem.id)} style={{ width: '100%', marginTop: 'var(--space-3)', padding: 'var(--space-3)', background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '0.78rem', cursor: 'pointer' }}>🗑️ Delete application</button>
          </div>
        </div>
      )}

      {modal && (
        <div className={styles.modalOverlay} onClick={() => setModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>New Application</h2>
            <div className={styles.formGroup}><label className={styles.formLabel}>Applicant Name *</label><input className={styles.formInput} value={form.applicant_name} onChange={e => setForm(p => ({ ...p, applicant_name: e.target.value }))} placeholder="Full name" /></div>
            <div className={styles.formGroup}><label className={styles.formLabel}>Application Type</label>
              <select className={styles.formSelect} value={form.class_applying_for} onChange={e => setForm(p => ({ ...p, class_applying_for: e.target.value }))}>
                {APP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className={styles.formGroup}><label className={styles.formLabel}>Notes</label><textarea className={styles.formTextarea} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={3} placeholder="Additional information…" /></div>
            {msg && <p style={{ fontSize: '0.78rem', color: '#EF4444', margin: '0 0 var(--space-3)' }}>{msg}</p>}
            <div className={styles.modalActions}><button className={styles.btnGhost} onClick={() => setModal(false)}>Cancel</button><button className={styles.btnPrimary} onClick={create} disabled={saving}>{saving ? 'Saving…' : 'Submit'}</button></div>
          </div>
        </div>
      )}
      <div style={{ height: 110 }} />
    </RolePageWrapper>
  )
}
