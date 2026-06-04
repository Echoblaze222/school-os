'use client'
// src/app/dashboard/secretary/students/StudentsClient.tsx

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import styles from '../secretary.module.css'

interface Student {
  user_id: string
  full_name: string
  student_number: string
  class_id: string | null
  class_name?: string
  onboarding_status: string
  created_at: string
  email?: string
}

interface Props { students: Student[]; profile: any; school: any; userId: string; classes: any[] }

export default function StudentsClient({ students: init, profile, school, userId, classes }: Props) {
  const [students, setStudents] = useState(init)
  const [search,   setSearch]   = useState('')
  const [modal,    setModal]    = useState(false)
  const [editItem, setEditItem] = useState<Student | null>(null)
  const [delItem,  setDelItem]  = useState<Student | null>(null)
  const [saving,   setSaving]   = useState(false)
  const [msg,      setMsg]      = useState('')

  const [form, setForm] = useState({ full_name: '', email: '', class_id: '' })

  const supabase  = createClient()
  const sc        = school?.primary_color ?? '#7C3AED'
  const schoolId  = school?.id

  const filtered = students.filter(s =>
    s.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    s.student_number?.toLowerCase().includes(search.toLowerCase())
  )

  function openAdd() { setForm({ full_name: '', email: '', class_id: '' }); setEditItem(null); setModal(true) }
  function openEdit(s: Student) {
    setForm({ full_name: s.full_name, email: s.email ?? '', class_id: s.class_id ?? '' })
    setEditItem(s); setModal(true)
  }

  async function saveStudent() {
    if (!form.full_name.trim()) { setMsg('Full name is required.'); return }
    setSaving(true); setMsg('')

    if (editItem) {
      // Edit: update student_profiles + profiles
      const { error } = await supabase
        .from('student_profiles')
        .update({ full_name: form.full_name, class_id: form.class_id || null })
        .eq('user_id', editItem.user_id)

      await supabase.from('profiles').update({ full_name: form.full_name }).eq('id', editItem.user_id)

      if (!error) {
        setStudents(p => p.map(s => s.user_id === editItem.user_id
          ? { ...s, full_name: form.full_name, class_id: form.class_id || null }
          : s))
        setMsg('Student updated!')
        setModal(false)
      } else setMsg(error.message)
    } else {
      // Create via API
      const res = await fetch('/api/secretary/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: form.full_name, email: form.email, role: 'student', classId: form.class_id, schoolId }),
      })
      const data = await res.json()
      if (!res.ok) { setMsg(data.error ?? 'Failed to create student'); setSaving(false); return }
      setMsg(`Student created! Code: ${data.code}`)
      // Optimistically append
      setStudents(p => [{ user_id: data.userId, full_name: form.full_name, student_number: data.code, class_id: form.class_id || null, onboarding_status: 'incomplete', created_at: new Date().toISOString(), email: form.email }, ...p])
      setModal(false)
    }
    setSaving(false)
  }

  async function deleteStudent() {
    if (!delItem) return
    setSaving(true)
    await supabase.from('student_profiles').delete().eq('user_id', delItem.user_id)
    await supabase.from('profiles').update({ is_active: false }).eq('id', delItem.user_id)
    setStudents(p => p.filter(s => s.user_id !== delItem.user_id))
    setDelItem(null); setSaving(false)
  }

  return (
    <RolePageWrapper userId={userId} role="secretary" profile={profile} school={school} title="Students">
      {/* Search + Add */}
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
            <div key={s.user_id} className={styles.listItem}>
              <div className={styles.listIconBox} style={{ background: sc + '22' }}>
                <span style={{ fontSize: '1.2rem' }}>🎓</span>
              </div>
              <div className={styles.listContent}>
                <p className={styles.listTitle}>{s.full_name}</p>
                <p className={styles.listSub}>{s.student_number} · {s.class_name ?? 'No class'}</p>
              </div>
              <span className={`${styles.listBadge} ${s.onboarding_status === 'complete' ? styles.badgeGreen : styles.badgeYellow}`}>
                {s.onboarding_status === 'complete' ? 'Active' : 'Pending'}
              </span>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <button onClick={() => openEdit(s)} style={{ width: 32, height: 32, borderRadius: 'var(--radius-md)', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>✏️</button>
                <button onClick={() => setDelItem(s)} style={{ width: 32, height: 32, borderRadius: 'var(--radius-md)', background: 'var(--danger-subtle)', border: '1px solid rgba(239,68,68,0.2)', cursor: 'pointer', fontSize: '0.75rem' }}>🗑️</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
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
              <label className={styles.formLabel}>Class</label>
              <select className={styles.formSelect} value={form.class_id} onChange={e => setForm(p => ({ ...p, class_id: e.target.value }))}>
                <option value="">— Select class —</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

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
