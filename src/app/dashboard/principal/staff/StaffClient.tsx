'use client'

import { useState, useEffect } from 'react'
import { useRealtimeTable } from '@/hooks/useRealtimeTable'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import styles from './staff.module.css'

const ROLES = ['teacher', 'bursar', 'secretary', 'librarian', 'counselor', 'nurse', 'admin']
const ROLE_COLORS: Record<string, string> = {
  teacher: '#10B981', bursar: '#F59E0B', secretary: '#EC4899',
  librarian: '#3B82F6', counselor: '#8B5CF6', nurse: '#EF4444', admin: '#6B7280',
}

interface Props { profile: any; school: any; userId: string }

// ── Success modal shown after staff is added ─────────────────
function StaffSuccessModal({
  result, sc, onClose,
}: {
  result: { full_name: string; email: string; role: string; code: string; password: string }
  sc: string
  onClose: () => void
}) {
  const [copiedCode, setCopiedCode] = useState(false)
  const [copiedPwd,  setCopiedPwd]  = useState(false)
  const [copiedAll,  setCopiedAll]  = useState(false)
  const roleColor  = ROLE_COLORS[result.role] ?? sc
  const initials   = result.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const roleLabel  = result.role.charAt(0).toUpperCase() + result.role.slice(1)

  async function copy(text: string, which: 'code' | 'pwd' | 'all') {
    await navigator.clipboard.writeText(text).catch(() => {})
    if (which === 'code') { setCopiedCode(true); setTimeout(() => setCopiedCode(false), 2000) }
    else if (which === 'pwd') { setCopiedPwd(true); setTimeout(() => setCopiedPwd(false), 2000) }
    else { setCopiedAll(true); setTimeout(() => setCopiedAll(false), 2500) }
  }

  function copyAllDetails() {
    const text = `Name: ${result.full_name}\nRole: ${roleLabel}\nEmail: ${result.email}\nAccess Code: ${result.code}\nTemp Password: ${result.password}`
    copy(text, 'all')
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.dialog} style={{ maxWidth: 440, width: '100%' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%', background: '#10B98118',
            border: '2px solid #10B981', display: 'flex', alignItems: 'center',
            justifyContent: 'center', margin: '0 auto 12px',
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <h3 className={styles.dialogTitle} style={{ marginBottom: 4 }}>Staff Added!</h3>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>
            Share these login details with <strong style={{ color: 'var(--text-base)' }}>{result.full_name}</strong>
          </p>
        </div>

        {/* User badge */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
          background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
          borderRadius: 10, marginBottom: 16,
        }}>
          <div style={{
            width: 38, height: 38, borderRadius: '50%',
            background: roleColor + '22', color: roleColor,
            fontWeight: 700, fontSize: '0.85rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>{initials}</div>
          <div>
            <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-base)' }}>{result.full_name}</p>
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {result.email} · <span style={{ color: roleColor, fontWeight: 600 }}>{roleLabel}</span>
            </p>
          </div>
        </div>

        {/* Access Code */}
        <div style={{
          border: `1px solid ${roleColor}44`, background: roleColor + '0a',
          borderRadius: 10, padding: '12px 14px', marginBottom: 10,
        }}>
          <p style={{ margin: '0 0 6px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Access Code
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <code style={{
              flex: 1, fontSize: '1.15rem', fontWeight: 800, letterSpacing: '0.08em',
              color: roleColor, fontFamily: 'monospace',
            }}>{result.code}</code>
            <button
              onClick={() => copy(result.code, 'code')}
              style={{
                padding: '5px 12px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                background: copiedCode ? '#10B98122' : 'transparent',
                border: `1px solid ${copiedCode ? '#10B981' : roleColor + '55'}`,
                color: copiedCode ? '#10B981' : roleColor,
              }}
            >
              {copiedCode ? '✓ Copied' : 'Copy'}
            </button>
          </div>
        </div>

        {/* Temp Password */}
        <div style={{
          border: '1px solid #F59E0B44', background: '#F59E0B0a',
          borderRadius: 10, padding: '12px 14px', marginBottom: 16,
        }}>
          <p style={{ margin: '0 0 6px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Temporary Password
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <code style={{
              flex: 1, fontSize: '1rem', fontWeight: 700,
              color: '#F59E0B', fontFamily: 'monospace', letterSpacing: '0.05em',
            }}>{result.password}</code>
            <button
              onClick={() => copy(result.password, 'pwd')}
              style={{
                padding: '5px 12px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                background: copiedPwd ? '#10B98122' : 'transparent',
                border: `1px solid ${copiedPwd ? '#10B981' : '#F59E0B55'}`,
                color: copiedPwd ? '#10B981' : '#F59E0B',
              }}
            >
              {copiedPwd ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: '0.72rem', color: '#F59E0B', opacity: 0.85 }}>
            ⚠️ Staff must change this password on first login.
          </p>
        </div>

        {/* Actions */}
        <button
          onClick={copyAllDetails}
          style={{
            width: '100%', padding: '10px', borderRadius: 8, marginBottom: 8,
            fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
            background: copiedAll ? '#10B98122' : 'var(--glass-bg)',
            border: `1px solid ${copiedAll ? '#10B981' : 'var(--glass-border)'}`,
            color: copiedAll ? '#10B981' : 'var(--text-base)',
          }}
        >
          {copiedAll ? '✓ All Details Copied' : 'Copy All Details'}
        </button>
        <button
          onClick={onClose}
          className={styles.saveBtn}
          style={{ width: '100%', background: sc }}
        >
          Done — Add Another
        </button>
      </div>
    </div>
  )
}

export default function StaffClient({ profile, school, userId }: Props) {
  const supabase = createClient()
  const sc       = school?.primary_color ?? '#7C3AED'

  const [staff, setStaff] = useRealtimeTable<any>({
    table:   'profiles',
    filter:  school?.id ? `school_id=eq.${school.id}` : undefined,
    initial: [],
    orderBy: (a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? ''),
  })

  const [loading,    setLoading]    = useState(false)
  const [search,     setSearch]     = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [showForm,   setShowForm]   = useState(false)
  const [deleting,   setDeleting]   = useState<string | null>(null)
  const [toast,      setToast]      = useState<{ msg: string; ok: boolean } | null>(null)
  const [confirmDel, setConfirmDel] = useState<any | null>(null)
  const [saving,     setSaving]     = useState(false)
  const [addResult,  setAddResult]  = useState<{ full_name: string; email: string; role: string; code: string; password: string } | null>(null)
  // ── Preview / Edit bottom sheets ───────────────────────────
  const [previewMember, setPreviewMember] = useState<any | null>(null)
  const [editMember,    setEditMember]    = useState<any | null>(null)
  const [editForm,      setEditForm]      = useState<any>({})
  const [editSaving,    setEditSaving]    = useState(false)

  const [form, setForm] = useState({
    full_name: '', email: '', phone: '', role: 'teacher',
    subject: '', qualification: '', gender: '', date_of_birth: '',
  })

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
    if (!form.full_name.trim() || !form.email.trim()) {
      showToast('Full name and email are required.', false)
      return
    }
    setSaving(true)
    try {
      const res  = await fetch('/api/secretary/create-user', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          fullName:         form.full_name.trim(),
          email:            form.email.trim().toLowerCase(),
          role:             form.role,
          schoolId:         school.id,
          phone:            form.phone.trim()         || null,
          gender:           form.gender               || null,
          dateOfBirth:      form.date_of_birth        || null,
          qualification:    form.qualification.trim() || null,
          subjectSpecialty: form.role === 'teacher' ? (form.subject.trim() || null) : null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to add staff member')

      // Refresh list
      const { data: fresh } = await supabase
        .from('profiles').select('*')
        .eq('school_id', school.id)
        .not('role', 'in', '(student,parent)')
        .order('full_name')
      if (fresh) setStaff(fresh)

      const captured = { ...form }
      setForm({ full_name: '', email: '', phone: '', role: 'teacher', subject: '', qualification: '', gender: '', date_of_birth: '' })
      setShowForm(false)
      setAddResult({
        full_name: captured.full_name.trim(),
        email:     captured.email.trim(),
        role:      captured.role,
        code:      json.code,
        password:  json.password,
      })
    } catch (err: any) {
      showToast(err.message ?? 'Failed to add staff member', false)
    }
    setSaving(false)
  }

  // ── Save edited staff details ───────────────────────────────
  async function handleEditSave() {
    if (!editMember) return
    setEditSaving(true)
    const { error } = await supabase.from('profiles').update({
      full_name:     editForm.full_name     || editMember.full_name,
      phone:         editForm.phone         ?? editMember.phone,
      date_of_birth: editForm.date_of_birth ?? editMember.date_of_birth,
      gender:        editForm.gender        ?? editMember.gender,
      qualification: editForm.qualification ?? editMember.qualification,
      subject:       editForm.subject       ?? editMember.subject,
      address:       editForm.address       ?? editMember.address,
    }).eq('id', editMember.id)
    setEditSaving(false)
    if (error) { showToast('Failed to save changes', false); return }
    setStaff(prev => prev.map(s => s.id === editMember.id ? { ...s, ...editForm } : s))
    setPreviewMember((p: any) => p ? { ...p, ...editForm } : p)
    setEditMember(null)
    setEditForm({})
    showToast('Staff details updated')
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
  }, {} as Record<string, number>)

  return (
    <RolePageWrapper userId={userId} role="principal" profile={profile} school={school} title="Staff">
      {toast && (
        <div className={`${styles.toast} ${toast.ok ? styles.toastOk : styles.toastErr}`}>
          {toast.ok ? '✓' : '✕'} {toast.msg}
        </div>
      )}

      {/* Code + password modal after adding staff */}
      {addResult && (
        <StaffSuccessModal
          result={addResult}
          sc={sc}
          onClose={() => setAddResult(null)}
        />
      )}

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
          {Object.entries(roleCounts).filter(([, c]) => c > 0).map(([r, c]) => (
            <div key={r} className={styles.statCard}>
              <p className={styles.statVal} style={{ color: ROLE_COLORS[r] ?? sc }}>{c}</p>
              <p className={styles.statLbl} style={{ textTransform: 'capitalize' }}>{r}s</p>
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
            {ROLES.map(r => (
              <option key={r} value={r} style={{ textTransform: 'capitalize' }}>
                {r.charAt(0).toUpperCase() + r.slice(1)}
              </option>
            ))}
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
                <input className={styles.fieldInput} placeholder="e.g. John Adeyemi" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}/>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Email *</label>
                <input className={styles.fieldInput} type="email" placeholder="john@school.edu.ng" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}/>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Phone</label>
                <input className={styles.fieldInput} placeholder="080xxxxxxxx" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}/>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Role *</label>
                <select className={styles.fieldInput} value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                  {ROLES.map(r => (
                    <option key={r} value={r} style={{ textTransform: 'capitalize' }}>
                      {r.charAt(0).toUpperCase() + r.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Gender</label>
                <select className={styles.fieldInput} value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}>
                  <option value="">Select gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Date of Birth</label>
                <input className={styles.fieldInput} type="date" value={form.date_of_birth} onChange={e => setForm(f => ({ ...f, date_of_birth: e.target.value }))}/>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Qualification</label>
                <input className={styles.fieldInput} placeholder="e.g. B.Sc Education" value={form.qualification} onChange={e => setForm(f => ({ ...f, qualification: e.target.value }))}/>
              </div>
              {form.role === 'teacher' && (
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Subject Specialty</label>
                  <input className={styles.fieldInput} placeholder="e.g. Mathematics, Physics" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}/>
                </div>
              )}
            </div>
            <div className={styles.formActions}>
              <button className={styles.cancelFormBtn} onClick={() => setShowForm(false)}>Cancel</button>
              <button
                className={styles.saveBtn}
                style={{ background: sc }}
                onClick={handleCreate}
                disabled={saving || !form.full_name.trim() || !form.email.trim()}
              >
                {saving ? 'Adding…' : 'Add & Get Code'}
              </button>
            </div>
          </div>
        )}

        {/* Staff list */}
        {loading ? (
          <div className={styles.loadingGrid}>
            {[1, 2, 3].map(i => <div key={i} className={styles.skeleton}/>)}
          </div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth="1.2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
            <p>{search || roleFilter ? 'No staff match your filters' : 'No staff added yet'}</p>
            {!showForm && (
              <button className={styles.addBtn} style={{ background: sc, marginTop: 12 }} onClick={() => setShowForm(true)}>
                + Add First Staff Member
              </button>
            )}
          </div>
        ) : (
          <div className={styles.staffGrid}>
            {filtered.map(member => {
              const initials  = member.full_name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() ?? '?'
              const roleColor = ROLE_COLORS[member.role] ?? sc
              return (
                <div key={member.id} className={styles.staffCard} onClick={() => setPreviewMember(member)} style={{ cursor: 'pointer' }}>
                  <div className={styles.cardHeader}>
                    <div className={styles.avatar} style={{ background: roleColor + '30', color: roleColor }}>
                      {member.avatar_url
                        ? <img src={member.avatar_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}/>
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
                      Joined {new Date(member.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <div style={{ height: 100 }}/>
      </div>

      {/* ── Preview bottom sheet ─────────────────────────────── */}
      {previewMember && !editMember && (
        <div
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', backdropFilter:'blur(4px)', zIndex:1000, display:'flex', alignItems:'flex-end' }}
          onClick={() => setPreviewMember(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background:'var(--bg-card)', border:'1px solid var(--glass-border)', borderRadius:'var(--radius-xl) var(--radius-xl) 0 0', padding:'var(--space-6)', width:'100%', maxHeight:'85vh', overflowY:'auto' }}
          >
            <div style={{ width:40, height:4, borderRadius:2, background:'var(--glass-border)', margin:'0 auto var(--space-5)' }}/>

            {/* Avatar + name */}
            <div style={{ display:'flex', alignItems:'center', gap:'var(--space-4)', marginBottom:'var(--space-5)' }}>
              {(() => {
                const roleColor = ROLE_COLORS[previewMember.role] ?? sc
                const initials  = previewMember.full_name?.split(' ').map((n:string)=>n[0]).join('').slice(0,2).toUpperCase() ?? '?'
                return (
                  <div style={{ width:56, height:56, borderRadius:'50%', flexShrink:0, overflow:'hidden', background:roleColor+'25', color:roleColor, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:'1.2rem' }}>
                    {previewMember.avatar_url ? <img src={previewMember.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/> : initials}
                  </div>
                )
              })()}
              <div>
                <p style={{ fontWeight:800, fontSize:'1.1rem', color:'var(--text-primary)', margin:0 }}>{previewMember.full_name}</p>
                <span style={{ fontSize:'0.72rem', fontWeight:700, padding:'2px 10px', borderRadius:'var(--radius-full)', background:(ROLE_COLORS[previewMember.role]??sc)+'22', color:ROLE_COLORS[previewMember.role]??sc, textTransform:'capitalize' }}>
                  {previewMember.role}
                </span>
              </div>
            </div>

            {([
              ['Email',         previewMember.email],
              ['Phone',         previewMember.phone],
              ['Gender',        previewMember.gender],
              ['Date of Birth', previewMember.date_of_birth],
              ['Qualification', previewMember.qualification],
              ['Subject',       previewMember.subject],
              ['Address',       previewMember.address],
              ['Access Code',   previewMember.default_code],
              ['Joined',        previewMember.created_at ? new Date(previewMember.created_at).toLocaleDateString('en-NG',{day:'numeric',month:'short',year:'numeric'}) : null],
            ] as [string,string|null|undefined][]).map(([label, value]) => (
              <div key={label} style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', padding:'var(--space-3) 0', borderBottom:'1px solid var(--glass-border)', gap:'var(--space-4)' }}>
                <span style={{ fontSize:'0.78rem', color:'var(--text-muted)', flexShrink:0 }}>{label}</span>
                {value
                  ? <span style={{ fontSize:'0.82rem', fontWeight:600, color:'var(--text-primary)', textAlign:'right' }}>{value}</span>
                  : <span style={{ fontSize:'0.78rem', color:'var(--text-faint)', fontStyle:'italic' }}>Not set</span>
                }
              </div>
            ))}

            <div style={{ display:'flex', gap:'var(--space-3)', marginTop:'var(--space-5)' }}>
              <button className={styles.saveBtn} style={{ flex:1, background:sc }}
                onClick={() => { setEditMember(previewMember); setEditForm({ ...previewMember }) }}>
                ✏️ Edit Details
              </button>
              <button className={styles.cancelBtn} onClick={() => setPreviewMember(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit bottom sheet ────────────────────────────────── */}
      {editMember && (
        <div
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(4px)', zIndex:1001, display:'flex', alignItems:'flex-end' }}
          onClick={() => { setEditMember(null); setEditForm({}) }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background:'var(--bg-card)', border:'1px solid var(--glass-border)', borderRadius:'var(--radius-xl) var(--radius-xl) 0 0', padding:'var(--space-6)', width:'100%', maxHeight:'92vh', overflowY:'auto' }}
          >
            <div style={{ width:40, height:4, borderRadius:2, background:'var(--glass-border)', margin:'0 auto var(--space-5)' }}/>
            <p style={{ fontWeight:800, fontSize:'1rem', color:'var(--text-primary)', marginBottom:'var(--space-5)' }}>
              Edit — {editMember.full_name}
            </p>

            <div className={styles.formGrid}>
              {([
                ['Full Name',     'full_name',     'text', 'e.g. John Adeyemi'],
                ['Phone',         'phone',         'tel',  '080xxxxxxxx'],
                ['Date of Birth', 'date_of_birth', 'date', ''],
                ['Qualification', 'qualification', 'text', 'e.g. B.Sc Education'],
                ['Subject',       'subject',       'text', 'e.g. Mathematics'],
                ['Address',       'address',       'text', 'e.g. 12 Lagos Street'],
              ] as [string,string,string,string][]).map(([label, key, type, placeholder]) => (
                <div key={key} className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>{label}</label>
                  <input className={styles.fieldInput} type={type} placeholder={placeholder}
                    value={editForm[key] ?? ''}
                    onChange={e => setEditForm((f:any) => ({ ...f, [key]: e.target.value }))} />
                </div>
              ))}
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Gender</label>
                <select className={styles.fieldInput} value={editForm.gender ?? ''}
                  onChange={e => setEditForm((f:any) => ({ ...f, gender: e.target.value }))}>
                  <option value="">Select gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Role</label>
                <select className={styles.fieldInput} value={editForm.role ?? editMember.role}
                  onChange={e => setEditForm((f:any) => ({ ...f, role: e.target.value }))}>
                  {ROLES.map(r => <option key={r} value={r} style={{ textTransform:'capitalize' }}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
                </select>
              </div>
            </div>

            <div className={styles.formActions}>
              <button className={styles.cancelFormBtn} onClick={() => { setEditMember(null); setEditForm({}) }}>Cancel</button>
              <button className={styles.saveBtn} style={{ background:sc }} onClick={handleEditSave} disabled={editSaving}>
                {editSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </RolePageWrapper>
  )
}