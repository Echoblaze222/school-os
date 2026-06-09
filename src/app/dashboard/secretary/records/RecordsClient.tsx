'use client'
// src/app/dashboard/secretary/records/RecordsClient.tsx

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import styles from '../secretary.module.css'

interface StudentRecord { id: string; student_name: string; record_type: string; description: string; date: string; created_by?: string }
interface Props { records: StudentRecord[]; profile: any; school: any; userId: string }

const TYPES = ['Academic', 'Disciplinary', 'Medical', 'Transfer', 'Achievement', 'Other']
const TYPE_COLORS: Record<string, string> = {
  Academic: '#3B82F6', Disciplinary: '#EF4444', Medical: '#10B981',
  Transfer: '#F59E0B', Achievement: '#8B5CF6', Other: '#6B7280',
}

export default function RecordsClient({ records: init, profile, school, userId }: Props) {
  const [records,  setRecords]  = useState(init)
  const [search,   setSearch]   = useState('')
  const [typeTab,  setTypeTab]  = useState('all')
  const [modal,    setModal]    = useState(false)
  const [viewItem, setViewItem] = useState<StudentRecord | null>(null)
  const [saving,   setSaving]   = useState(false)
  const [msg,      setMsg]      = useState('')
  const [form,     setForm]     = useState({ student_name: '', record_type: 'Academic', description: '', date: new Date().toISOString().slice(0, 10) })

  const supabase = createClient()
  const sc       = school?.primary_color ?? '#7C3AED'

  const filtered = records.filter(r => {
    const matchSearch = r.student_name?.toLowerCase().includes(search.toLowerCase()) || r.description?.toLowerCase().includes(search.toLowerCase())
    const matchType   = typeTab === 'all' || r.record_type === typeTab
    return matchSearch && matchType
  })

  async function createRecord() {
    if (!form.student_name.trim() || !form.description.trim()) { setMsg('Name and description required.'); return }
    setSaving(true); setMsg('')
    const { data, error } = await supabase.from('behaviour_records').insert({
      student_name: form.student_name, record_type: form.record_type,
      description: form.description, date: form.date,
      school_id: school?.id, created_by: profile?.full_name,
      created_at: new Date().toISOString(),
    }).select().single()

    if (!error && data) { setRecords(p => [data, ...p]); setModal(false) }
    else setMsg(error?.message ?? 'Failed to create record')
    setSaving(false)
  }

  async function deleteRecord(id: string) {
    await supabase.from('behaviour_records').delete().eq('id', id)
    setRecords(p => p.filter(r => r.id !== id))
    setViewItem(null)
  }

  return (
    <RolePageWrapper userId={userId} role="secretary" profile={profile} school={school} title="Records">
      <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
        <div className={styles.searchBar} style={{ flex: 1, marginBottom: 0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input className={styles.searchInput} placeholder="Search records…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button className={styles.btnPrimary} onClick={() => { setMsg(''); setModal(true) }} style={{ height: 44, padding: '0 var(--space-4)', whiteSpace: 'nowrap' }}>+ New</button>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-5)', overflowX: 'auto', paddingBottom: 4 }}>
        {['all', ...TYPES].map(t => (
          <button key={t} onClick={() => setTypeTab(t)}
            style={{ padding: '6px 14px', borderRadius: 'var(--radius-full)', border: '1px solid', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
              background: typeTab === t ? (TYPE_COLORS[t] ?? sc) + '22' : 'var(--glass-bg)',
              borderColor: typeTab === t ? (TYPE_COLORS[t] ?? sc) : 'var(--glass-border)',
              color: typeTab === t ? (TYPE_COLORS[t] ?? sc) : 'var(--text-muted)',
            }}>{t}</button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className={styles.emptyState}><p className={styles.emptyEmoji}>📂</p><p className={styles.emptyTitle}>No records found</p><p className={styles.emptyHint}>Student records appear here</p></div>
      ) : (
        filtered.map(r => (
          <div key={r.id} className={styles.listItem} onClick={() => setViewItem(r)}>
            <div className={styles.listIconBox} style={{ background: (TYPE_COLORS[r.record_type] ?? sc) + '22' }}>
              <span style={{ fontSize: '1.1rem' }}>📄</span>
            </div>
            <div className={styles.listContent}>
              <p className={styles.listTitle}>{r.student_name}</p>
              <p className={styles.listSub}>{r.description.slice(0, 60)}{r.description.length > 60 ? '…' : ''} · {new Date(r.date).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
            </div>
            <span className={styles.listBadge} style={{ background: (TYPE_COLORS[r.record_type] ?? '#6B7280') + '22', color: TYPE_COLORS[r.record_type] ?? '#6B7280' }}>{r.record_type}</span>
          </div>
        ))
      )}

      {viewItem && (
        <div className={styles.modalOverlay} onClick={() => setViewItem(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>{viewItem.student_name}</h2>
            {[['Type', viewItem.record_type], ['Date', new Date(viewItem.date).toLocaleDateString()], ['Created by', viewItem.created_by ?? '—']].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-3) 0', borderBottom: '1px solid var(--glass-border)', fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>{l}</span><span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{v}</span>
              </div>
            ))}
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 'var(--space-4)', lineHeight: 1.6 }}>{viewItem.description}</p>
            <button onClick={() => deleteRecord(viewItem.id)} style={{ width: '100%', marginTop: 'var(--space-4)', padding: 'var(--space-3)', background: 'transparent', border: 'none', color: 'var(--danger)', fontSize: '0.78rem', cursor: 'pointer' }}>🗑️ Delete record</button>
          </div>
        </div>
      )}

      {modal && (
        <div className={styles.modalOverlay} onClick={() => setModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>New Student Record</h2>
            <div className={styles.formGroup}><label className={styles.formLabel}>Student Name *</label><input className={styles.formInput} value={form.student_name} onChange={e => setForm(p => ({ ...p, student_name: e.target.value }))} placeholder="Full name" /></div>
            <div className={styles.formGroup}><label className={styles.formLabel}>Record Type</label>
              <select className={styles.formSelect} value={form.record_type} onChange={e => setForm(p => ({ ...p, record_type: e.target.value }))}>
                {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className={styles.formGroup}><label className={styles.formLabel}>Date</label><input className={styles.formInput} type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} /></div>
            <div className={styles.formGroup}><label className={styles.formLabel}>Description *</label><textarea className={styles.formTextarea} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Details of this record…" rows={4} /></div>
            {msg && <p style={{ fontSize: '0.78rem', color: '#EF4444', margin: '0 0 var(--space-3)' }}>{msg}</p>}
            <div className={styles.modalActions}><button className={styles.btnGhost} onClick={() => setModal(false)}>Cancel</button><button className={styles.btnPrimary} onClick={createRecord} disabled={saving}>{saving ? 'Saving…' : 'Create Record'}</button></div>
          </div>
        </div>
      )}
      <div style={{ height: 110 }} />
    </RolePageWrapper>
  )
}
