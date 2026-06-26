'use client'
// src/app/dashboard/secretary/records/RecordsClient.tsx

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import styles from '../secretary.module.css'

// Matches the real `behaviour_records` table:
//   id, school_id, student_id, recorded_by, type ('positive'|'negative'|'neutral'), description, created_at
interface BehaviourRecord {
  id: string
  school_id: string
  student_id: string | null
  recorded_by: string | null
  type: 'positive' | 'negative' | 'neutral'
  description: string
  created_at: string
}

interface PersonLite {
  id: string
  full_name: string
  role: string
  admission_number?: string | null
  class_id?: string | null
}

interface Props {
  records: BehaviourRecord[]
  profile: any
  school: any
  userId: string
  students: PersonLite[]
  allProfiles: PersonLite[]
}

const TYPES: Array<{ value: BehaviourRecord['type']; label: string }> = [
  { value: 'positive', label: 'Positive' },
  { value: 'negative', label: 'Negative' },
  { value: 'neutral',  label: 'Neutral'  },
]

const TYPE_COLORS: Record<string, string> = {
  positive: '#10B981',
  negative: '#EF4444',
  neutral:  '#6B7280',
}

const TYPE_ICONS: Record<string, string> = {
  positive: '✅',
  negative: '⚠️',
  neutral:  '📄',
}

export default function RecordsClient({ records: init, profile, school, userId, students, allProfiles }: Props) {
  const [records,  setRecords]  = useState(init)
  const [search,   setSearch]   = useState('')
  const [typeTab,  setTypeTab]  = useState<'all' | BehaviourRecord['type']>('all')
  const [modal,    setModal]    = useState(false)
  const [viewItem, setViewItem] = useState<BehaviourRecord | null>(null)
  const [saving,   setSaving]   = useState(false)
  const [msg,      setMsg]      = useState('')
  const [form,     setForm]     = useState<{ student_id: string; type: BehaviourRecord['type']; description: string }>({
    student_id: '', type: 'neutral', description: '',
  })

  const supabase = createClient()
  const sc       = school?.primary_color ?? '#7C3AED'

  // Quick lookup so we can resolve student_id / recorded_by -> a display name
  const personMap = useMemo(() => {
    const m = new Map<string, PersonLite>()
    for (const p of allProfiles) m.set(p.id, p)
    return m
  }, [allProfiles])

  function studentLabel(p: PersonLite) {
    return p.admission_number ? `${p.full_name} (${p.admission_number})` : p.full_name
  }

  function nameFor(id: string | null) {
    if (!id) return 'Unknown'
    return personMap.get(id)?.full_name ?? 'Unknown'
  }

  const filtered = records.filter(r => {
    const studentName = nameFor(r.student_id).toLowerCase()
    const matchSearch  = !search || studentName.includes(search.toLowerCase()) || r.description.toLowerCase().includes(search.toLowerCase())
    const matchType    = typeTab === 'all' || r.type === typeTab
    return matchSearch && matchType
  })

  async function createRecord() {
    if (!form.student_id) { setMsg('Please select a student.'); return }
    if (!form.description.trim()) { setMsg('Description is required.'); return }
    setSaving(true); setMsg('')

    const { data, error } = await supabase.from('behaviour_records').insert({
      student_id:  form.student_id,
      type:        form.type,
      description: form.description,
      school_id:   school?.id,
      recorded_by: userId,
    }).select().single()

    if (!error && data) {
      setRecords(p => [data, ...p])
      setModal(false)
      setForm({ student_id: '', type: 'neutral', description: '' })
    } else {
      setMsg(error?.message ?? 'Failed to create record')
    }
    setSaving(false)
  }

  async function deleteRecord(id: string) {
    await supabase.from('behaviour_records').delete().eq('id', id)
    setRecords(p => p.filter(r => r.id !== id))
    setViewItem(null)
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  return (
    <RolePageWrapper userId={userId} role="secretary" profile={profile} school={school} title="Records">
      <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
        <div className={styles.searchBar} style={{ flex: 1, marginBottom: 0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input className={styles.searchInput} placeholder="Search by student or description…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button onClick={() => { setMsg(''); setForm({ student_id: '', type: 'neutral', description: '' }); setModal(true) }} style={{ height: 44, padding: '0 18px', whiteSpace: 'nowrap', background: sc, color: '#fff', border: 'none', borderRadius: 'var(--radius-lg)', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>+ New</button>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-5)', overflowX: 'auto', paddingBottom: 4 }}>
        {(['all', ...TYPES.map(t => t.value)] as const).map(t => {
          const label = t === 'all' ? 'All' : TYPES.find(x => x.value === t)!.label
          const count = t === 'all' ? records.length : records.filter(r => r.type === t).length
          const color = t === 'all' ? sc : TYPE_COLORS[t]
          return (
            <button key={t} onClick={() => setTypeTab(t)}
              style={{ padding: '6px 14px', borderRadius: 'var(--radius-full)', border: '1px solid', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                background: typeTab === t ? color + '22' : 'var(--glass-bg)',
                borderColor: typeTab === t ? color : 'var(--glass-border)',
                color: typeTab === t ? color : 'var(--text-muted)',
              }}>{label} ({count})</button>
          )
        })}
      </div>

      {filtered.length === 0 ? (
        <div className={styles.emptyState}><p className={styles.emptyEmoji}>📂</p><p className={styles.emptyTitle}>No records found</p><p className={styles.emptyHint}>Student behaviour records appear here</p></div>
      ) : (
        filtered.map(r => (
          <div key={r.id} className={styles.listItem} onClick={() => setViewItem(r)}>
            <div className={styles.listIconBox} style={{ background: TYPE_COLORS[r.type] + '22' }}>
              <span style={{ fontSize: '1.1rem' }}>{TYPE_ICONS[r.type]}</span>
            </div>
            <div className={styles.listContent}>
              <p className={styles.listTitle}>{nameFor(r.student_id)}</p>
              <p className={styles.listSub}>{r.description.slice(0, 60)}{r.description.length > 60 ? '…' : ''} · {formatDate(r.created_at)}</p>
            </div>
            <span className={styles.listBadge} style={{ background: TYPE_COLORS[r.type] + '22', color: TYPE_COLORS[r.type], textTransform: 'capitalize' }}>{r.type}</span>
          </div>
        ))
      )}

      {viewItem && (
        <div className={styles.modalOverlay} onClick={() => setViewItem(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>{nameFor(viewItem.student_id)}</h2>
            {[
              ['Type', viewItem.type],
              ['Date', formatDate(viewItem.created_at)],
              ['Recorded by', nameFor(viewItem.recorded_by)],
            ].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-3) 0', borderBottom: '1px solid var(--glass-border)', fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>{l}</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)', textTransform: l === 'Type' ? 'capitalize' : 'none' }}>{v}</span>
              </div>
            ))}
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 'var(--space-4)', lineHeight: 1.6 }}>{viewItem.description}</p>
            <button onClick={() => deleteRecord(viewItem.id)} style={{ width: '100%', marginTop: 'var(--space-4)', padding: 'var(--space-3)', background: 'transparent', border: 'none', color: 'var(--danger)', fontSize: '0.78rem', cursor: 'pointer' }}>🗑️ Delete record</button>
          </div>
        </div>
      )}

      {modal && (
        <div className={styles.modalOverlay} onClick={() => setModal(false)} style={{ alignItems: 'flex-end', paddingBottom: 80 }}>
          <div className={styles.modal} onClick={e => e.stopPropagation()} style={{ paddingBottom: 32, marginBottom: 80 }}>
            <h2 className={styles.modalTitle}>New Behaviour Record</h2>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Student *</label>
              <select className={styles.formSelect} value={form.student_id} onChange={e => setForm(p => ({ ...p, student_id: e.target.value }))}>
                <option value="">— Select student —</option>
                {students.map(s => <option key={s.id} value={s.id}>{studentLabel(s)}</option>)}
              </select>
              {students.length === 0 && <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>No students found for this school yet.</p>}
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Type</label>
              <select className={styles.formSelect} value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value as BehaviourRecord['type'] }))}>
                {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Description *</label>
              <textarea className={styles.formTextarea} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Details of this record…" rows={4} />
            </div>
            {msg && <p style={{ fontSize: '0.78rem', color: '#EF4444', margin: '0 0 var(--space-3)' }}>{msg}</p>}
            <div className={styles.modalActions}><button className={styles.btnGhost} onClick={() => setModal(false)}>Cancel</button><button onClick={createRecord} disabled={saving} style={{ height: 42, padding: '0 20px', background: sc, color: '#fff', border: 'none', borderRadius: 'var(--radius-lg)', fontWeight: 700, fontSize: '0.85rem', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>{saving ? 'Saving…' : 'Create Record'}</button></div>
          </div>
        </div>
      )}
      <div style={{ height: 110 }} />
    </RolePageWrapper>
  )
}
