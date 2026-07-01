'use client'
// src/app/dashboard/secretary/students/StudentsClient.tsx
// Brought up to parity with the principal enrolment page:
//   - Full detail fields (phone, gender, DOB, admission no., guardian info)
//   - Fast Day/Month/Year DOB picker instead of native calendar
//   - Bulk Add tab — saves directly, no fake "preview" codes

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import DOBPicker from '@/components/DOBPicker'
import styles from '../secretary.module.css'

interface Student {
  id: string
  full_name: string
  admission_number: string | null
  class_id: string | null
  class_name?: string
  onboarding_stage: string
  created_at: string
  email?: string
  phone?: string | null
  gender?: string | null
  date_of_birth?: string | null
}

interface Props { students: Student[]; profile: any; school: any; userId: string; classes: any[] }

const GENDERS = ['Male', 'Female', 'Other']

interface BulkRow {
  full_name: string; email: string; phone: string; gender: string
  dateOfBirth: string; classId: string; admissionNumber: string
  guardianName: string; guardianPhone: string
}
const EMPTY_ROW = (): BulkRow => ({
  full_name: '', email: '', phone: '', gender: '',
  dateOfBirth: '', classId: '', admissionNumber: '', guardianName: '', guardianPhone: '',
})
const DEFAULT_ROWS = 5

interface GeneratedEntry extends BulkRow { code: string; saved: boolean; error: string | null }

const thStyle: React.CSSProperties = {
  padding: '8px 10px', textAlign: 'left', fontSize: '0.7rem', fontWeight: 700,
  color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase',
  borderBottom: '1px solid var(--glass-border)', whiteSpace: 'nowrap',
}
const tdStyle: React.CSSProperties = { padding: '4px 6px', verticalAlign: 'middle' }
const cellInputStyle: React.CSSProperties = {
  width: '100%', background: 'transparent', border: 'none', outline: 'none',
  color: 'var(--text-primary)', fontSize: '0.82rem', padding: '6px 4px',
  borderRadius: 'var(--radius-sm)', fontFamily: 'inherit',
}
const dobInputStyle: React.CSSProperties = {
  background: 'var(--input-bg)', border: '1px solid var(--input-border)',
  borderRadius: 'var(--radius-md)', color: 'var(--text-primary)',
  fontSize: '0.82rem', padding: '10px 8px', fontFamily: 'inherit',
}

export default function StudentsClient({ students: init, profile, school, userId, classes }: Props) {
  const [students, setStudents] = useState(init)
  const [search,   setSearch]   = useState('')
  const [modal,    setModal]    = useState(false)
  const [editItem, setEditItem] = useState<Student | null>(null)
  const [delItem,  setDelItem]  = useState<Student | null>(null)
  const [saving,   setSaving]   = useState(false)
  const [msg,      setMsg]      = useState('')
  const [tab,      setTab]      = useState<'list' | 'bulk'>('list')

  const [form, setForm] = useState({
    full_name: '', email: '', class_id: '',
    phone: '', gender: '', date_of_birth: '',
    admission_number: '', guardian_name: '', guardian_phone: '',
  })

  // ── Bulk ──────────────────────────────────────────────────
  const [bRows,     setBRows]     = useState<BulkRow[]>(() => Array.from({ length: DEFAULT_ROWS }, EMPTY_ROW))
  const [bResults,  setBResults]  = useState<GeneratedEntry[]>([])
  const [bLoading,  setBLoading]  = useState(false)
  const [bSaved,    setBSaved]    = useState(false)
  const [copiedAll, setCopiedAll] = useState(false)

  const supabase  = createClient()
  const sc        = school?.primary_color ?? '#7C3AED'
  const schoolId  = school?.id

  // ── Warn before navigating away if bulk results haven't been copied ──
  const hasUnsavedResults = bResults.length > 0 && !bSaved

  useEffect(() => {
    if (!hasUnsavedResults) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = 'You have unsaved student codes — are you sure you want to leave?'
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasUnsavedResults])

  const filtered = students.filter(s =>
    s.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    s.admission_number?.toLowerCase().includes(search.toLowerCase())
  )

  function emptyForm() {
    return {
      full_name: '', email: '', class_id: '',
      phone: '', gender: '', date_of_birth: '',
      admission_number: '', guardian_name: '', guardian_phone: '',
    }
  }

  function openAdd() { setForm(emptyForm()); setEditItem(null); setModal(true) }
  function openEdit(s: Student) {
    setForm({
      full_name: s.full_name, email: s.email ?? '', class_id: s.class_id ?? '',
      phone: s.phone ?? '', gender: s.gender ?? '', date_of_birth: s.date_of_birth ?? '',
      admission_number: s.admission_number ?? '', guardian_name: '', guardian_phone: '',
    })
    setEditItem(s); setModal(true)
  }

  async function saveStudent() {
    if (!form.full_name.trim()) { setMsg('Full name is required.'); return }
    setSaving(true); setMsg('')

    if (editItem) {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name:     form.full_name,
          class_id:      form.class_id || null,
          phone:         form.phone.trim() || null,
          gender:        form.gender || null,
          date_of_birth: form.date_of_birth || null,
        })
        .eq('id', editItem.id)

      if (!error) {
        setStudents(p => p.map(s => s.id === editItem.id
          ? { ...s, full_name: form.full_name, class_id: form.class_id || null, phone: form.phone, gender: form.gender, date_of_birth: form.date_of_birth }
          : s))
        setMsg('Student updated!')
        setModal(false)
      } else setMsg(error.message)
    } else {
      if (!form.email.trim()) { setMsg('Email is required.'); setSaving(false); return }
      const res = await fetch('/api/secretary/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName:        form.full_name.trim(),
          email:           form.email.trim().toLowerCase(),
          role:            'student',
          classId:         form.class_id || null,
          schoolId,
          phone:           form.phone.trim() || null,
          gender:          form.gender || null,
          dateOfBirth:     form.date_of_birth || null,
          admissionNumber: form.admission_number.trim() || null,
          guardianName:    form.guardian_name.trim() || null,
          guardianPhone:   form.guardian_phone.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setMsg(data.error ?? 'Failed to create student'); setSaving(false); return }
      setMsg(`Student created! Code: ${data.code}`)
      setStudents(p => [{
        id: data.userId, full_name: form.full_name, admission_number: data.code,
        class_id: form.class_id || null, onboarding_stage: 'stage_1_pending',
        created_at: new Date().toISOString(), email: form.email,
        phone: form.phone, gender: form.gender, date_of_birth: form.date_of_birth,
      }, ...p])
      setModal(false)
    }
    setSaving(false)
  }

  async function deleteStudent() {
    if (!delItem) return
    setSaving(true)
    await supabase.from('profiles').update({ is_active: false }).eq('id', delItem.id)
    setStudents(p => p.filter(s => s.id !== delItem.id))
    setDelItem(null); setSaving(false)
  }

  // ── Bulk save — direct, no fake preview-only codes ──────────
  async function handleBulkSave() {
    const validRows = bRows.filter(r => r.full_name.trim() && r.email.trim())
    if (!validRows.length) return

    setBLoading(true)
    setBResults(validRows.map(r => ({ ...r, full_name: r.full_name.trim(), email: r.email.trim(), code: '', saved: false, error: null })))

    const updated = await Promise.all(
      validRows.map(async (r) => {
        try {
          const res = await fetch('/api/secretary/create-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fullName:        r.full_name.trim(),
              email:           r.email.trim().toLowerCase(),
              role:            'student',
              classId:         r.classId || null,
              schoolId,
              phone:           r.phone.trim() || null,
              gender:          r.gender || null,
              dateOfBirth:     r.dateOfBirth || null,
              admissionNumber: r.admissionNumber.trim() || null,
              guardianName:    r.guardianName.trim() || null,
              guardianPhone:   r.guardianPhone.trim() || null,
            }),
          })
          const json = await res.json()
          if (!res.ok) return { ...r, full_name: r.full_name.trim(), email: r.email.trim(), code: '', error: json.error ?? 'Failed', saved: false }
          return { ...r, full_name: r.full_name.trim(), email: r.email.trim(), code: json.code, saved: true, error: null }
        } catch (e: any) {
          return { ...r, full_name: r.full_name.trim(), email: r.email.trim(), code: '', error: e.message ?? 'Network error', saved: false }
        }
      })
    )
    setBResults(updated)
    if (updated.some(r => r.saved)) {
      const { data: fresh } = await supabase
        .from('profiles')
        .select('id, full_name, admission_number, class_id, onboarding_stage, created_at, email, phone, gender, date_of_birth')
        .eq('school_id', schoolId).eq('role', 'student').order('created_at', { ascending: false })
      if (fresh) setStudents(fresh as Student[])
    }
    if (updated.every(r => r.saved)) setBSaved(true)
    setBLoading(false)
  }

  function updateBulkRow(index: number, patch: Partial<BulkRow>) {
    setBRows(prev => {
      const next = [...prev]
      next[index] = { ...next[index], ...patch }
      return next
    })
    setBResults([])
    setBSaved(false)
  }

  async function copyAllCodes(list: GeneratedEntry[]) {
    const text = list.filter(r => r.saved).map(r => `${r.full_name} | Code: ${r.code}`).join('\n')
    await navigator.clipboard.writeText(text).catch(() => {})
    setCopiedAll(true)
    setBSaved(true) // clears the "don't leave" warning once they've copied everything
    setTimeout(() => setCopiedAll(false), 2500)
  }

  return (
    <RolePageWrapper userId={userId} role="secretary" profile={profile} school={school} title="Students">

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-5)', borderBottom: '1px solid var(--glass-border)', paddingBottom: 4, overflowX: 'auto' }}>
        {(['list', 'bulk'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              padding: '8px 16px', borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
              border: 'none', background: tab === t ? sc + '14' : 'transparent',
              fontSize: '0.78rem', fontWeight: 700, color: tab === t ? sc : 'var(--text-muted)',
              cursor: 'pointer', whiteSpace: 'nowrap',
              borderBottom: tab === t ? `2px solid ${sc}` : '2px solid transparent', marginBottom: -5,
            }}>
            {t === 'list' ? 'All Students' : 'Bulk Add'}
          </button>
        ))}
      </div>

      {/* ── LIST TAB ── */}
      {tab === 'list' && (
        <>
          <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-5)' }}>
            <div className={styles.searchBar} style={{ flex: 1, marginBottom: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input className={styles.searchInput} placeholder="Search students…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <button className={styles.btnPrimary} onClick={openAdd} style={{ height: 44, padding: '0 var(--space-4)', whiteSpace: 'nowrap' }}>+ Add</button>
          </div>

          {filtered.length === 0 ? (
            <div className={styles.emptyState}>
              <p className={styles.emptyEmoji}>🎓</p>
              <p className={styles.emptyTitle}>No students found</p>
              <p className={styles.emptyHint}>{search ? 'Try a different search' : 'Add your first student to get started'}</p>
            </div>
          ) : (
            <div>
              {filtered.map(s => (
                <div key={s.id} className={styles.listItem}>
                  <div className={styles.listIconBox} style={{ background: sc + '22' }}>
                    <span style={{ fontSize: '1.2rem' }}>🎓</span>
                  </div>
                  <div className={styles.listContent}>
                    <p className={styles.listTitle}>{s.full_name}</p>
                    <p className={styles.listSub}>{s.admission_number ?? '—'} · {s.class_name ?? 'No class'}</p>
                  </div>
                  <span className={`${styles.listBadge} ${s.onboarding_stage === 'complete' ? styles.badgeGreen : styles.badgeYellow}`}>
                    {s.onboarding_stage === 'complete' ? 'Active' : 'Pending'}
                  </span>
                  <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    <button onClick={() => openEdit(s)} style={{ width: 32, height: 32, borderRadius: 'var(--radius-md)', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>✏️</button>
                    <button onClick={() => setDelItem(s)} style={{ width: 32, height: 32, borderRadius: 'var(--radius-md)', background: 'var(--danger-subtle)', border: '1px solid rgba(239,68,68,0.2)', cursor: 'pointer', fontSize: '0.75rem' }}>🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── BULK TAB ── */}
      {tab === 'bulk' && (
        <>
          <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
            <p style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 2px' }}>Bulk Add Students</p>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: 0 }}>Fill in each row directly. Leave blank rows empty — they'll be ignored. Saving creates real accounts immediately.</p>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
              <thead>
                <tr style={{ background: 'var(--bg-elevated)' }}>
                  <th style={thStyle}>#</th>
                  <th style={thStyle}>Full Name *</th>
                  <th style={thStyle}>Email *</th>
                  <th style={thStyle}>Phone</th>
                  <th style={thStyle}>Gender</th>
                  <th style={{ ...thStyle, minWidth: 230 }}>Date of Birth</th>
                  <th style={thStyle}>Class</th>
                  <th style={thStyle}>Admission No.</th>
                  <th style={thStyle}>Guardian Name</th>
                  <th style={thStyle}>Guardian Phone</th>
                  <th style={thStyle} />
                </tr>
              </thead>
              <tbody>
                {bRows.map((row, i) => {
                  const isEmpty = !row.full_name && !row.email
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid var(--glass-border)', background: isEmpty ? 'transparent' : sc + '06' }}>
                      <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 700 }}>{i + 1}</td>
                      <td style={tdStyle}>
                        <input value={row.full_name} placeholder="e.g. Amara Osei"
                          onChange={e => updateBulkRow(i, { full_name: e.target.value })}
                          onKeyDown={e => {
                            if (e.key === 'Tab' && !e.shiftKey && i === bRows.length - 1) {
                              e.preventDefault()
                              setBRows(r => [...r, EMPTY_ROW()])
                            }
                          }}
                          style={cellInputStyle} />
                      </td>
                      <td style={tdStyle}>
                        <input type="email" value={row.email} placeholder="e.g. amara@gmail.com"
                          onChange={e => updateBulkRow(i, { email: e.target.value })} style={cellInputStyle} />
                      </td>
                      <td style={tdStyle}>
                        <input type="tel" value={row.phone} placeholder="08012345678"
                          onChange={e => updateBulkRow(i, { phone: e.target.value })} style={cellInputStyle} />
                      </td>
                      <td style={tdStyle}>
                        <select value={row.gender} onChange={e => updateBulkRow(i, { gender: e.target.value })} style={cellInputStyle}>
                          <option value="">—</option>
                          {GENDERS.map(g => <option key={g} value={g.toLowerCase()}>{g}</option>)}
                        </select>
                      </td>
                      <td style={tdStyle}>
                        <DOBPicker value={row.dateOfBirth} onChange={v => updateBulkRow(i, { dateOfBirth: v })} inputStyle={cellInputStyle} />
                      </td>
                      <td style={tdStyle}>
                        <select value={row.classId} onChange={e => updateBulkRow(i, { classId: e.target.value })} style={cellInputStyle}>
                          <option value="">—</option>
                          {classes.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </td>
                      <td style={tdStyle}>
                        <input value={row.admissionNumber} placeholder="ADM/2025/001"
                          onChange={e => updateBulkRow(i, { admissionNumber: e.target.value })} style={cellInputStyle} />
                      </td>
                      <td style={tdStyle}>
                        <input value={row.guardianName} placeholder="Mr. Osei Kofi"
                          onChange={e => updateBulkRow(i, { guardianName: e.target.value })} style={cellInputStyle} />
                      </td>
                      <td style={tdStyle}>
                        <input type="tel" value={row.guardianPhone} placeholder="08098765432"
                          onChange={e => updateBulkRow(i, { guardianPhone: e.target.value })} style={cellInputStyle} />
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <button
                          onClick={() => {
                            const next = bRows.length === 1 ? [EMPTY_ROW()] : bRows.filter((_, idx) => idx !== i)
                            setBRows(next); setBResults([]); setBSaved(false)
                          }}
                          title="Remove row"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, lineHeight: 1, opacity: isEmpty ? 0.3 : 0.7 }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                          </svg>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <button
            onClick={() => setBRows(r => [...r, EMPTY_ROW()])}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, background: 'none',
              border: '1px dashed var(--glass-border)', borderRadius: 'var(--radius-md)',
              padding: '8px 16px', color: 'var(--text-muted)', fontSize: '0.78rem', fontWeight: 700,
              cursor: 'pointer', width: '100%', justifyContent: 'center', margin: 'var(--space-3) 0',
            }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add Row
          </button>

          {(() => {
            const filled = bRows.filter(r => r.full_name.trim() && r.email.trim()).length
            return filled > 0 ? (
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '0 0 var(--space-3)' }}>
                {filled} student{filled !== 1 ? 's' : ''} ready to save
              </p>
            ) : null
          })()}

          <button
            onClick={handleBulkSave}
            className={styles.btnPrimary}
            style={{ width: '100%' }}
            disabled={bLoading || !bRows.some(r => r.full_name.trim() && r.email.trim())}>
            {bLoading ? 'Saving...' : 'Save All Students'}
          </button>


          {bResults.length > 0 && (
            <div style={{ marginTop: 'var(--space-5)', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <p style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                    {bResults.length} Student{bResults.length !== 1 ? 's' : ''} {bLoading ? 'Saving…' : 'Processed'}
                  </p>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: 0 }}>
                    {bLoading ? 'Creating accounts, please wait...' : 'Codes below are live — share them now.'}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button onClick={() => copyAllCodes(bResults)} disabled={bLoading}
                    style={{
                      padding: '6px 14px', borderRadius: 'var(--radius-md)', fontSize: '0.72rem', fontWeight: 700,
                      cursor: 'pointer', background: 'var(--glass-bg)',
                      border: `1px solid ${copiedAll ? '#10B981' : 'var(--glass-border)'}`,
                      color: copiedAll ? '#10B981' : 'var(--text-secondary)',
                    }}>
                    {copiedAll ? 'All Copied' : 'Copy All'}
                  </button>
                  {bSaved && <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#10B981' }}>All Saved ✓</span>}
                </div>
              </div>

              {bResults.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: i > 0 ? '1px solid var(--glass-border)' : 'none', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                    <p style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.full_name}</p>
                    <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', margin: 0 }}>{r.email}</p>
                  </div>
                  <code style={{ fontSize: '0.74rem', fontWeight: 700, color: sc, background: sc + '15', padding: '2px 8px', borderRadius: 'var(--radius-sm)', fontFamily: 'monospace' }}>
                    {r.code || (bLoading ? '…' : '—')}
                  </code>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: r.error ? '#EF4444' : r.saved ? '#10B981' : 'var(--text-muted)' }}>
                    {r.error ? (r.error.length > 24 ? 'Error' : r.error) : r.saved ? 'Saved ✓' : bLoading ? 'Saving…' : 'Pending'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Add/Edit Modal (single student) */}
      {modal && (
        <div className={styles.modalOverlay} onClick={() => setModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>{editItem ? 'Edit Student' : 'Add New Student'}</h2>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Full Name *</label>
              <input className={styles.formInput} value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} placeholder="e.g. John Doe" />
            </div>

            {!editItem && (
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Email *</label>
                <input className={styles.formInput} type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="student@example.com" />
              </div>
            )}

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Phone</label>
              <input className={styles.formInput} type="tel" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="08012345678" />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Gender</label>
              <select className={styles.formSelect} value={form.gender} onChange={e => setForm(p => ({ ...p, gender: e.target.value }))}>
                <option value="">— Select gender —</option>
                {GENDERS.map(g => <option key={g} value={g.toLowerCase()}>{g}</option>)}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Date of Birth</label>
              <DOBPicker value={form.date_of_birth} onChange={v => setForm(p => ({ ...p, date_of_birth: v }))} inputStyle={dobInputStyle} />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Class</label>
              <select className={styles.formSelect} value={form.class_id} onChange={e => setForm(p => ({ ...p, class_id: e.target.value }))}>
                <option value="">— Select class —</option>
                {classes.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {!editItem && (
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Admission Number</label>
                <input className={styles.formInput} value={form.admission_number} onChange={e => setForm(p => ({ ...p, admission_number: e.target.value }))} placeholder="e.g. ADM/2025/001" />
              </div>
            )}

            {!editItem && (
              <>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Parent / Guardian Name</label>
                  <input className={styles.formInput} value={form.guardian_name} onChange={e => setForm(p => ({ ...p, guardian_name: e.target.value }))} placeholder="e.g. Mr. Osei Kofi" />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Parent / Guardian Phone</label>
                  <input className={styles.formInput} type="tel" value={form.guardian_phone} onChange={e => setForm(p => ({ ...p, guardian_phone: e.target.value }))} placeholder="08098765432" />
                </div>
              </>
            )}

            {msg && <p style={{ fontSize: '0.78rem', color: msg.includes('!') || msg.includes('Code') ? '#10B981' : '#EF4444', margin: '0 0 var(--space-3)' }}>{msg}</p>}

            <div className={styles.modalActions}>
              <button className={styles.btnGhost} onClick={() => setModal(false)}>Cancel</button>
              <button className={styles.btnPrimary} onClick={saveStudent} disabled={saving}>{saving ? 'Saving…' : editItem ? 'Save Changes' : 'Create Student'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {delItem && (
        <div className={styles.modalOverlay} onClick={() => setDelItem(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Remove Student?</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 'var(--space-5)' }}>
              This will deactivate <strong>{delItem.full_name}</strong>'s account. This action cannot easily be undone.
            </p>
            <div className={styles.modalActions}>
              <button className={styles.btnGhost} onClick={() => setDelItem(null)}>Cancel</button>
              <button className={styles.btnDanger} onClick={deleteStudent} disabled={saving}>{saving ? 'Removing…' : 'Remove Student'}</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ height: 110 }} />
    </RolePageWrapper>
  )
}
