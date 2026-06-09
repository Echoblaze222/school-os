'use client'

import { useState, useEffect, useRef } from 'react'
import { useRealtimeTable } from '@/hooks/useRealtimeTable'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import styles from './staff.module.css'

const ROLES = ['teacher', 'bursar', 'secretary', 'librarian', 'counselor', 'nurse', 'admin']
const ROLE_COLORS: Record<string,string> = {
  teacher:'#10B981', bursar:'#F59E0B', secretary:'#EC4899',
  librarian:'#3B82F6', counselor:'#8B5CF6', nurse:'#EF4444', admin:'#6B7280',
}

interface Props { profile: any; school: any; userId: string }

export default function StaffClient({ profile, school, userId }: Props) {
  const supabase   = createClient()
  const sc         = school?.primary_color ?? '#7C3AED'
  // ── Realtime: staff list stays live — new hires appear without refresh ──
  const [staff, setStaff] = useRealtimeTable<any>({
    table:   'profiles',
    filter:  school?.id ? `school_id=eq.${school.id}` : undefined,
    initial: [],
    orderBy: (a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? ''),
  })

  const [loading,  setLoading]  = useState(false)
  const [search,   setSearch]   = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [toast,    setToast]    = useState<{ msg: string; ok: boolean } | null>(null)
  const [confirmDel, setConfirmDel] = useState<any | null>(null)

  // Form fields
  const [form, setForm] = useState({ full_name:'', email:'', phone:'', role:'teacher', subject:'', qualification:'' })
  const [saving, setSaving] = useState(false)

  // Load staff on mount (roles that are staff, not students/parents)
  useEffect(() => {
    async function loadStaff() {
      if (!school?.id) return
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('school_id', school.id)
        .not('role', 'in', '(student,parent)')
        .order('full_name')
      if (data) setStaff(data)
    }
    loadStaff()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [school?.id])

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  async function handleDelete(member: any) {
    setDeleting(member.id)
    const { error } = await supabase.from('profiles').delete().eq('id', member.id)
    setDeleting(null)
    setConfirmDel(null)
    if (error) { showToast('Failed to remove staff member', false); return }
    setStaff(prev => prev.filter(s => s.id !== member.id))
    showToast(`${member.full_name} removed`)
  }

  async function handleCreate() {
    if (!form.full_name.trim() || !form.email.trim()) return
    setSaving(true)
    // Create auth user + profile via admin API isn't possible client-side,
    // so we insert a profile record with a placeholder (requires RLS to allow principal inserts)
    const { data, error } = await supabase.from('profiles').insert({
      full_name:     form.full_name.trim(),
      email:         form.email.trim(),
      phone:         form.phone.trim() || null,
      role:          form.role,
      subject:       form.subject.trim() || null,
      qualification: form.qualification.trim() || null,
      school_id:     school.id,
    }).select().single()

    setSaving(false)
    if (error) { showToast(error.message, false); return }
    setStaff(prev => [data, ...prev])
    setForm({ full_name:'', email:'', phone:'', role:'teacher', subject:'', qualification:'' })
    setShowForm(false)
    showToast(`${data.full_name} added to staff`)
  }

  const filtered = staff.filter(s => {
    const q = search.toLowerCase()
    const matchesSearch = !search ||
      s.full_name?.toLowerCase().includes(q) ||
      s.email?.toLowerCase().includes(q) ||
      s.subject?.toLowerCase().includes(q)
    const matchesRole = !roleFilter || s.role === roleFilter
    return matchesSearch && matchesRole
  })

  const roleCounts = ROLES.reduce((acc, r) => {
    acc[r] = staff.filter(s => s.role === r).length
    return acc
  }, {} as Record<string,number>)

  return (
    <RolePageWrapper userId={userId} role="principal" profile={profile} school={school} title="Staff">
      {/* Toast */}
      {toast && (
        <div className={`${styles.toast} ${toast.ok ? styles.toastOk : styles.toastErr}`}>
          {toast.ok ? '✓' : '✕'} {toast.msg}
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDel && (
        <div className={styles.overlay}>
          <div className={styles.dialog}>
            <h3 className={styles.dialogTitle}>Remove Staff Member?</h3>
            <p className={styles.dialogBody}>
              This will permanently remove <strong>{confirmDel.full_name}</strong> from the school.
              Their login access will be revoked.
            </p>
            <div className={styles.dialogActions}>
              <button className={styles.cancelBtn} onClick={() => setConfirmDel(null)}>Cancel</button>
              <button
                className={styles.deleteBtn}
                onClick={() => handleDelete(confirmDel)}
                disabled={deleting === confirmDel.id}
              >
                {deleting === confirmDel.id ? 'Removing…' : 'Yes, Remove'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={styles.container}>
        {/* Stats strip */}
        <div className={styles.statsRow}>
          <div className={styles.statCard}>
            <p className={styles.statVal} style={{ color: sc }}>{staff.length}</p>
            <p className={styles.statLbl}>Total Staff</p>
          </div>
          {Object.entries(roleCounts).filter(([,c]) => c > 0).map(([r, c]) => (
            <div key={r} className={styles.statCard}>
              <p className={styles.statVal} style={{ color: ROLE_COLORS[r] ?? sc }}>{c}</p>
              <p className={styles.statLbl} style={{ textTransform:'capitalize' }}>{r}s</p>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className={styles.toolbar}>
          <div className={styles.searchWrap}>
            <svg className={styles.searchIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              className={styles.searchInput}
              placeholder="Search staff…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select
            className={styles.filterSelect}
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
          >
            <option value="">All Roles</option>
            {ROLES.map(r => <option key={r} value={r} style={{ textTransform:'capitalize' }}>{r}</option>)}
          </select>
          <button className={styles.addBtn} style={{ background: sc }} onClick={() => setShowForm(v => !v)}>
            {showForm ? '✕ Close' : '+ Add Staff'}
          </button>
        </div>

        {/* Add form */}
        {showForm && (
          <div className={styles.formCard}>
            <p className={styles.formTitle}>Add New Staff Member</p>
            <div className={styles.formGrid}>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Full Name *</label>
                <input className={styles.fieldInput} placeholder="e.g. John Adeyemi" value={form.full_name} onChange={e => setForm(f=>({...f,full_name:e.target.value}))}/>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Email *</label>
                <input className={styles.fieldInput} type="email" placeholder="john@school.edu.ng" value={form.email} onChange={e => setForm(f=>({...f,email:e.target.value}))}/>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Phone</label>
                <input className={styles.fieldInput} placeholder="080xxxxxxxx" value={form.phone} onChange={e => setForm(f=>({...f,phone:e.target.value}))}/>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Role *</label>
                <select className={styles.fieldInput} value={form.role} onChange={e => setForm(f=>({...f,role:e.target.value}))}>
                  {ROLES.map(r => <option key={r} value={r} style={{ textTransform:'capitalize' }}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
                </select>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Subject (Teachers)</label>
                <input className={styles.fieldInput} placeholder="e.g. Mathematics" value={form.subject} onChange={e => setForm(f=>({...f,subject:e.target.value}))}/>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Qualification</label>
                <input className={styles.fieldInput} placeholder="e.g. B.Sc Education" value={form.qualification} onChange={e => setForm(f=>({...f,qualification:e.target.value}))}/>
              </div>
            </div>
            <div className={styles.formActions}>
              <button className={styles.cancelFormBtn} onClick={() => setShowForm(false)}>Cancel</button>
              <button
                className={styles.saveBtn}
                style={{ background: sc }}
                onClick={handleCreate}
                disabled={saving || !form.full_name.trim() || !form.email.trim()}
              >
                {saving ? 'Adding…' : 'Add Staff Member'}
              </button>
            </div>
          </div>
        )}

        {/* Staff list */}
        {loading ? (
          <div className={styles.loadingGrid}>
            {[1,2,3].map(i => <div key={i} className={styles.skeleton}/>)}
          </div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth="1.2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
            <p>{search || roleFilter ? 'No staff match your filters' : 'No staff added yet'}</p>
            {!showForm && <button className={styles.addBtn} style={{ background: sc, marginTop: 12 }} onClick={() => setShowForm(true)}>+ Add First Staff Member</button>}
          </div>
        ) : (
          <div className={styles.staffGrid}>
            {filtered.map(member => {
              const initials = member.full_name?.split(' ').map((n: string) => n[0]).join('').slice(0,2).toUpperCase() ?? '?'
              const roleColor = ROLE_COLORS[member.role] ?? sc
              return (
                <div key={member.id} className={styles.staffCard}>
                  <div className={styles.cardHeader}>
                    <div className={styles.avatar} style={{ background: roleColor + '30', color: roleColor }}>
                      {member.avatar_url
                        ? <img src={member.avatar_url} alt="" style={{ width:'100%', height:'100%', borderRadius:'50%', objectFit:'cover' }}/>
                        : <span>{initials}</span>
                      }
                    </div>
                    <div className={styles.memberInfo}>
                      <p className={styles.memberName}>{member.full_name}</p>
                      <span className={styles.roleBadge} style={{ background: roleColor + '20', color: roleColor }}>
                        {member.role}
                      </span>
                    </div>
                    <button
                      className={styles.delBtn}
                      onClick={() => setConfirmDel(member)}
                      title="Remove staff member"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                    </button>
                  </div>
                  <div className={styles.cardDetails}>
                    {member.email && (
                      <div className={styles.detailRow}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                        <span>{member.email}</span>
                      </div>
                    )}
                    {member.phone && (
                      <div className={styles.detailRow}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 8.81 19.79 19.79 0 01.00 2.19 2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z"/></svg>
                        <span>{member.phone}</span>
                      </div>
                    )}
                    {member.subject && (
                      <div className={styles.detailRow}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>
                        <span>{member.subject}</span>
                      </div>
                    )}
                    {member.default_code && (
                      <div className={styles.codeChip}>
                        {member.default_code}
                      </div>
                    )}
                  </div>
                  <div className={styles.cardFooter}>
                    <span className={styles.joinDate}>
                      Joined {new Date(member.created_at).toLocaleDateString('en-NG',{day:'numeric',month:'short',year:'numeric'})}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <div style={{ height: 100 }}/>
      </div>
    </RolePageWrapper>
  )
}
