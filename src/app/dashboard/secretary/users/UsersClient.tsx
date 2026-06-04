'use client'
// src/app/dashboard/secretary/users/UsersClient.tsx

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import styles from '../secretary.module.css'

const ROLES = ['teacher', 'bursar', 'librarian', 'counselor', 'nurse', 'secretary']
const ROLE_COLORS: Record<string, string> = {
  teacher: '#10B981', bursar: '#3B82F6', secretary: '#8B5CF6',
  librarian: '#F59E0B', counselor: '#EC4899', nurse: '#EF4444',
}

interface User { id: string; full_name: string; email: string; role: string; is_active: boolean; default_code: string; created_at: string }
interface Props { users: User[]; profile: any; school: any; userId: string }

export default function UsersClient({ users: init, profile, school, userId }: Props) {
  const [users,   setUsers]   = useState(init)
  const [search,  setSearch]  = useState('')
  const [roleTab, setRoleTab] = useState('all')
  const [modal,   setModal]   = useState(false)
  const [delItem, setDelItem] = useState<User | null>(null)
  const [saving,  setSaving]  = useState(false)
  const [msg,     setMsg]     = useState('')
  const [form,    setForm]    = useState({ full_name: '', email: '', role: 'teacher' })

  const supabase = createClient()
  const sc       = school?.primary_color ?? '#7C3AED'

  const filtered = users.filter(u => {
    const matchSearch = u.full_name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase())
    const matchRole   = roleTab === 'all' || u.role === roleTab
    return matchSearch && matchRole
  })

  async function createUser() {
    if (!form.full_name.trim() || !form.email.trim()) { setMsg('Name and email are required.'); return }
    setSaving(true); setMsg('')
    const res  = await fetch('/api/secretary/create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: form.full_name, email: form.email, role: form.role, schoolId: school?.id }),
    })
    const data = await res.json()
    if (!res.ok) { setMsg(data.error ?? 'Failed'); setSaving(false); return }
    setMsg(`Created! Login code: ${data.code}`)
    setUsers(p => [{ id: data.userId, full_name: form.full_name, email: form.email, role: form.role, is_active: true, default_code: data.code, created_at: new Date().toISOString() }, ...p])
    setForm({ full_name: '', email: '', role: 'teacher' })
    setSaving(false)
  }

  async function toggleActive(u: User) {
    const next = !u.is_active
    await supabase.from('profiles').update({ is_active: next }).eq('id', u.id)
    setUsers(p => p.map(x => x.id === u.id ? { ...x, is_active: next } : x))
  }

  async function deleteUser() {
    if (!delItem) return
    setSaving(true)
    await supabase.from('profiles').update({ is_active: false }).eq('id', delItem.id)
    setUsers(p => p.filter(u => u.id !== delItem.id))
    setDelItem(null); setSaving(false)
  }

  return (
    <RolePageWrapper userId={userId} role="secretary" profile={profile} school={school} title="Users">
      {/* Controls */}
      <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
        <div className={styles.searchBar} style={{ flex: 1, marginBottom: 0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input className={styles.searchInput} placeholder="Search users…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button className={styles.btnPrimary} onClick={() => { setMsg(''); setModal(true) }} style={{ height: 44, padding: '0 var(--space-4)', whiteSpace: 'nowrap' }}>+ Add</button>
      </div>

      {/* Role filter tabs */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-5)', overflowX: 'auto', paddingBottom: 4 }}>
        {['all', ...ROLES].map(r => (
          <button key={r} onClick={() => setRoleTab(r)}
            style={{ padding: '6px 14px', borderRadius: 'var(--radius-full)', border: '1px solid', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
              background: roleTab === r ? (ROLE_COLORS[r] ?? sc) + '22' : 'var(--glass-bg)',
              borderColor: roleTab === r ? (ROLE_COLORS[r] ?? sc) : 'var(--glass-border)',
              color: roleTab === r ? (ROLE_COLORS[r] ?? sc) : 'var(--text-muted)',
            }}>
            {r === 'all' ? '👤 All' : r.charAt(0).toUpperCase() + r.slice(1)}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyEmoji}>👥</p>
          <p className={styles.emptyTitle}>No users found</p>
          <p className={styles.emptyHint}>Add a staff member to get started</p>
        </div>
      ) : (
        filtered.map(u => (
          <div key={u.id} className={styles.listItem}>
            <div className={styles.listIconBox} style={{ background: (ROLE_COLORS[u.role] ?? sc) + '22' }}>
              <span style={{ fontSize: '1.1rem' }}>👤</span>
            </div>
            <div className={styles.listContent}>
              <p className={styles.listTitle}>{u.full_name}</p>
              <p className={styles.listSub}>{u.email} · {u.default_code}</p>
            </div>
            <span className={`${styles.listBadge} ${u.is_active ? styles.badgeGreen : styles.badgeRed}`} style={{ textTransform: 'capitalize' }}>
              {u.role}
            </span>
            <button onClick={() => toggleActive(u)}
              style={{ padding: '4px 10px', borderRadius: 'var(--radius-full)', border: '1px solid', fontSize: '0.65rem', fontWeight: 700, cursor: 'pointer',
                background: u.is_active ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                borderColor: u.is_active ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)',
                color: u.is_active ? '#10B981' : '#EF4444',
              }}>{u.is_active ? 'Active' : 'Inactive'}</button>
            <button onClick={() => setDelItem(u)} style={{ width: 32, height: 32, borderRadius: 'var(--radius-md)', background: 'var(--danger-subtle)', border: '1px solid rgba(239,68,68,0.2)', cursor: 'pointer', fontSize: '0.75rem' }}>🗑️</button>
          </div>
        ))
      )}

      {/* Create Modal */}
      {modal && (
        <div className={styles.modalOverlay} onClick={() => setModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Add Staff Member</h2>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Full Name *</label>
              <input className={styles.formInput} value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} placeholder="e.g. Jane Smith" />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Email *</label>
              <input className={styles.formInput} type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="staff@school.edu" />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Role *</label>
              <select className={styles.formSelect} value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}>
                {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
              </select>
            </div>

            {msg && <p style={{ fontSize: '0.78rem', color: msg.includes('!') ? '#10B981' : '#EF4444', margin: '0 0 var(--space-3)' }}>{msg}</p>}

            <div className={styles.modalActions}>
              <button className={styles.btnGhost} onClick={() => setModal(false)}>Cancel</button>
              <button className={styles.btnPrimary} onClick={createUser} disabled={saving}>{saving ? 'Creating…' : 'Create User'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {delItem && (
        <div className={styles.modalOverlay} onClick={() => setDelItem(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Deactivate User?</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 'var(--space-5)' }}>
              This will deactivate <strong>{delItem.full_name}</strong>'s account.
            </p>
            <div className={styles.modalActions}>
              <button className={styles.btnGhost} onClick={() => setDelItem(null)}>Cancel</button>
              <button className={styles.btnDanger} onClick={deleteUser} disabled={saving}>{saving ? 'Working…' : 'Deactivate'}</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ height: 110 }} />
    </RolePageWrapper>
  )
}
