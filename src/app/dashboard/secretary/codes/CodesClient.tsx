'use client'
// src/app/dashboard/secretary/codes/CodesClient.tsx

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import {
  LockIcon, ClipboardIcon, RefreshIcon, KeyIcon, CheckIcon,
  AlertIcon, UserIcon, XIcon, PeopleIcon,
} from '@/components/Icons'
import styles from '../secretary.module.css'

interface CodeEntry {
  id: string; full_name: string; email: string; role: string
  default_code: string; is_active: boolean; created_at: string
}
interface StudentOption {
  id: string; full_name: string; class_level: string | null; admission_number: string | null
}
interface Props { entries: CodeEntry[]; students: StudentOption[]; profile: any; school: any; userId: string }

const ROLE_COLORS: Record<string, string> = {
  student: '#10B981', teacher: '#3B82F6', bursar: '#F59E0B',
  secretary: '#8B5CF6', parent: '#06B6D4', librarian: '#EC4899', nurse: '#EF4444',
}

const RELATIONSHIPS = ['Father', 'Mother', 'Guardian']

// Stores a revealed new password per user id — cleared when dismissed
type RevealedPasswords = Record<string, { password: string; copied: boolean }>

export default function CodesClient({ entries: init, students, profile, school, userId }: Props) {
  const [entries,  setEntries]  = useState(init)
  const [search,   setSearch]   = useState('')
  const [roleTab,  setRoleTab]  = useState('all')
  const [copied,   setCopied]   = useState<string | null>(null)
  const [saving,   setSaving]   = useState<string | null>(null)

  // Reset password state
  const [resetting,  setResetting]  = useState<string | null>(null)
  const [revealed,   setRevealed]   = useState<RevealedPasswords>({})
  const [resetError, setResetError] = useState<string | null>(null)

  // New parent access code state
  const [showParentForm, setShowParentForm] = useState(false)
  const [parentName,     setParentName]     = useState('')
  const [parentEmail,    setParentEmail]    = useState('')
  const [parentPhone,    setParentPhone]    = useState('')
  const [relationship,   setRelationship]   = useState('')
  const [studentId,      setStudentId]      = useState('')
  const [creatingParent, setCreatingParent] = useState(false)
  const [parentError,    setParentError]    = useState<string | null>(null)
  const [newParentCode,  setNewParentCode]  = useState<{ name: string; code: string; copied: boolean } | null>(null)

  const supabase = createClient()
  const sc       = school?.primary_color ?? '#800020'

  const filtered = entries.filter(e => {
    const matchSearch = e.full_name?.toLowerCase().includes(search.toLowerCase())
      || e.default_code?.toLowerCase().includes(search.toLowerCase())
      || e.email?.toLowerCase().includes(search.toLowerCase())
    const matchRole = roleTab === 'all' || e.role === roleTab
    return matchSearch && matchRole
  })

  async function regenerateCode(entry: CodeEntry) {
    setSaving(entry.id)
    const year    = new Date().getFullYear()
    const rand    = Math.floor(1000 + Math.random() * 9000)
    const newCode = `SCH-${year}-${rand}`
    const { error } = await supabase.from('profiles').update({ default_code: newCode }).eq('id', entry.id)
    if (!error) setEntries(p => p.map(e => e.id === entry.id ? { ...e, default_code: newCode } : e))
    setSaving(null)
  }

  async function copyCode(code: string, id: string) {
    await navigator.clipboard.writeText(code).catch(() => {})
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  async function resetPassword(entry: CodeEntry) {
    setResetting(entry.id)
    setResetError(null)
    // Clear any existing revealed password for this user first
    setRevealed(p => { const n = { ...p }; delete n[entry.id]; return n })

    try {
      const res  = await fetch('/api/secretary/reset-password', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ targetUserId: entry.id }),
      })
      const json = await res.json()
      if (!res.ok) { setResetError(json.error ?? 'Failed to reset password'); setResetting(null); return }
      // Show the new password inline — stays visible until dismissed
      setRevealed(p => ({ ...p, [entry.id]: { password: json.password, copied: false } }))
    } catch (e: any) {
      setResetError(e.message ?? 'Network error')
    }
    setResetting(null)
  }

  async function copyNewPassword(id: string, password: string) {
    await navigator.clipboard.writeText(password).catch(() => {})
    setRevealed(p => ({ ...p, [id]: { ...p[id], copied: true } }))
    setTimeout(() => setRevealed(p => p[id] ? { ...p, [id]: { ...p[id], copied: false } } : p), 2000)
  }

  function dismissPassword(id: string) {
    setRevealed(p => { const n = { ...p }; delete n[id]; return n })
  }

  async function createParentCode() {
    if (!parentName.trim() || !parentEmail.trim()) {
      setParentError('Name and email are required')
      return
    }
    setCreatingParent(true)
    setParentError(null)
    try {
      const res = await fetch('/api/secretary/create-user', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: parentName.trim(),
          email:    parentEmail.trim(),
          phone:    parentPhone.trim() || undefined,
          role:     'parent',
          schoolId: profile.school_id,
          studentId:    studentId || undefined,
          relationship: relationship || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setParentError(json.error ?? 'Failed to generate parent code'); setCreatingParent(false); return }

      // Add the new parent straight into the list and reveal the code
      setEntries(p => [{
        id: json.userId, full_name: parentName.trim(), email: parentEmail.trim(),
        role: 'parent', default_code: json.code, is_active: true, created_at: new Date().toISOString(),
      }, ...p])
      setNewParentCode({ name: parentName.trim(), code: json.code, copied: false })

      // Reset the form
      setParentName(''); setParentEmail(''); setParentPhone(''); setRelationship(''); setStudentId('')
      setShowParentForm(false)
    } catch (e: any) {
      setParentError(e.message ?? 'Network error')
    }
    setCreatingParent(false)
  }

  async function copyNewParentCode() {
    if (!newParentCode) return
    await navigator.clipboard.writeText(newParentCode.code).catch(() => {})
    setNewParentCode(p => p ? { ...p, copied: true } : p)
    setTimeout(() => setNewParentCode(p => p ? { ...p, copied: false } : p), 2000)
  }

  const roles = ['all', ...Array.from(new Set(entries.map(e => e.role))).sort()]
  if (!roles.includes('parent')) roles.splice(1, 0, 'parent')

  const inputStyle: React.CSSProperties = {
    width: '100%', background: 'var(--input-bg)', border: '1px solid var(--input-border)',
    borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontSize: '0.82rem',
    padding: '10px 12px', fontFamily: 'inherit', outline: 'none',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4, display: 'block',
  }

  return (
    <RolePageWrapper userId={userId} role="secretary" profile={profile} school={school} title="Access Codes">

      {/* Info banner */}
      <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', marginBottom: 'var(--space-5)', display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
        <LockIcon size={19} color={sc} />
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 2px' }}>Access Codes</p>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: 0 }}>
            Each user has a unique login code. Share it with them to access SchoolOS.
            You can regenerate a code if it's compromised, reset their password if they've forgotten it,
            or generate a brand-new code for a parent below.
          </p>
        </div>
        <button
          onClick={() => { setShowParentForm(s => !s); setParentError(null) }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 'var(--radius-md)',
            background: showParentForm ? 'var(--glass-bg-hover)' : (sc + '18'), border: `1px solid ${sc}`,
            color: sc, cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0,
          }}>
          <PeopleIcon size={14} color={sc} />
          {showParentForm ? 'Cancel' : 'New Parent Code'}
        </button>
      </div>

      {/* New parent code form */}
      {showParentForm && (
        <div style={{ background: 'var(--glass-bg)', border: `1px solid ${sc}55`, borderRadius: 'var(--radius-lg)', padding: 'var(--space-5)', marginBottom: 'var(--space-5)' }}>
          <p style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 var(--space-4)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <PeopleIcon size={16} color={sc} /> Generate Parent Access Code
          </p>

          {parentError && (
            <div style={{ background: '#EF444415', border: '1px solid #EF444433', borderRadius: 'var(--radius-md)', padding: 'var(--space-2) var(--space-3)', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertIcon size={14} color="#EF4444" />
              <p style={{ fontSize: '0.76rem', color: '#EF4444', margin: 0 }}>{parentError}</p>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
            <div>
              <label style={labelStyle}>Parent full name *</label>
              <input style={inputStyle} value={parentName} onChange={e => setParentName(e.target.value)} placeholder="e.g. Mrs. Adaeze Okoro" />
            </div>
            <div>
              <label style={labelStyle}>Email *</label>
              <input style={inputStyle} type="email" value={parentEmail} onChange={e => setParentEmail(e.target.value)} placeholder="parent@email.com" />
            </div>
            <div>
              <label style={labelStyle}>Phone</label>
              <input style={inputStyle} value={parentPhone} onChange={e => setParentPhone(e.target.value)} placeholder="080…" />
            </div>
            <div>
              <label style={labelStyle}>Relationship</label>
              <select style={inputStyle} value={relationship} onChange={e => setRelationship(e.target.value)}>
                <option value="">Select…</option>
                {RELATIONSHIPS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Link to student (optional — can be added later)</label>
              <select style={inputStyle} value={studentId} onChange={e => setStudentId(e.target.value)}>
                <option value="">No student linked yet</option>
                {students.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}{s.class_level ? ` — ${s.class_level}` : ''}{s.admission_number ? ` (${s.admission_number})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            onClick={createParentCode}
            disabled={creatingParent}
            style={{
              padding: '9px 18px', borderRadius: 'var(--radius-md)', background: sc, border: 'none',
              color: '#F6F1E4', cursor: creatingParent ? 'default' : 'pointer', fontSize: '0.78rem', fontWeight: 700,
              opacity: creatingParent ? 0.6 : 1,
            }}>
            {creatingParent ? 'Generating…' : 'Generate Code'}
          </button>
        </div>
      )}

      {/* Newly generated parent code — stays visible until dismissed */}
      {newParentCode && (
        <div style={{ background: '#06B6D40D', border: '1px solid #06B6D433', borderRadius: 'var(--radius-md)', padding: 'var(--space-3) var(--space-4)', marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#06B6D4' }}>{newParentCode.name}'s access code:</span>
          <code style={{ fontSize: '0.82rem', fontWeight: 700, color: '#06B6D4', fontFamily: 'monospace', letterSpacing: '0.08em', flex: 1 }}>
            {newParentCode.code}
          </code>
          <button onClick={copyNewParentCode}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 'var(--radius-sm)', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer', background: 'var(--glass-bg)', border: `1px solid ${newParentCode.copied ? '#10B981' : '#06B6D455'}`, color: newParentCode.copied ? '#10B981' : '#06B6D4' }}>
            {newParentCode.copied ? <><CheckIcon size={12} color="#10B981" /> Copied</> : <><ClipboardIcon size={12} color="#06B6D4" /> Copy</>}
          </button>
          <button onClick={() => setNewParentCode(null)}
            title="Dismiss — make sure you've copied the code first"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0 2px', display: 'flex' }}>
            <XIcon size={16} />
          </button>
          <p style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.68rem', color: '#06B6D499', margin: 0 }}>
            <AlertIcon size={12} color="#06B6D499" /> Share this with the parent now — it won't be shown again once dismissed.
          </p>
        </div>
      )}

      {/* Global reset error */}
      {resetError && (
        <div style={{ background: '#EF444415', border: '1px solid #EF444433', borderRadius: 'var(--radius-md)', padding: 'var(--space-3) var(--space-4)', marginBottom: 'var(--space-4)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontSize: '0.78rem', color: '#EF4444', margin: 0 }}>{resetError}</p>
          <button onClick={() => setResetError(null)} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', padding: 0, display: 'flex' }}><XIcon size={14} color="#EF4444" /></button>
        </div>
      )}

      {/* Search */}
      <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
        <div className={styles.searchBar} style={{ flex: 1, marginBottom: 0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input className={styles.searchInput} placeholder="Search by name, email or code…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Role filter tabs */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-5)', overflowX: 'auto', paddingBottom: 4 }}>
        {roles.map(r => (
          <button key={r} onClick={() => setRoleTab(r)}
            style={{
              padding: '6px 14px', borderRadius: 'var(--radius-full)', border: '1px solid',
              fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
              background:   roleTab === r ? (ROLE_COLORS[r] ?? sc) + '22' : 'var(--glass-bg)',
              borderColor:  roleTab === r ? (ROLE_COLORS[r] ?? sc)        : 'var(--glass-border)',
              color:        roleTab === r ? (ROLE_COLORS[r] ?? sc)        : 'var(--text-muted)',
            }}>
            {r === 'all' ? 'All' : r.charAt(0).toUpperCase() + r.slice(1)} ({entries.filter(e => r === 'all' || e.role === r).length})
          </button>
        ))}
      </div>

      {/* Entries */}
      {filtered.length === 0 ? (
        <div className={styles.emptyState}>
          <KeyIcon size={32} color="var(--text-muted)" />
          <p className={styles.emptyTitle}>No users found</p>
        </div>
      ) : (
        filtered.map(e => {
          const rc  = ROLE_COLORS[e.role] ?? sc
          const rev = revealed[e.id]
          return (
            <div key={e.id} style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4) var(--space-5)', marginBottom: 'var(--space-3)' }}>

              {/* Main row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
                <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: rc + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <UserIcon size={18} color={rc} />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.full_name}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                    <code style={{ fontSize: '0.78rem', fontWeight: 700, color: sc, background: sc + '15', padding: '2px 8px', borderRadius: 'var(--radius-md)', letterSpacing: '0.04em', fontFamily: 'monospace' }}>
                      {e.default_code}
                    </code>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{e.role}</span>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                  {/* Copy code */}
                  <button onClick={() => copyCode(e.default_code, e.id)}
                    title="Copy login code"
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 'var(--radius-md)', background: copied === e.id ? '#10B98122' : 'var(--glass-bg)', border: `1px solid ${copied === e.id ? '#10B981' : 'var(--glass-border)'}`, cursor: 'pointer', fontSize: '0.7rem', fontWeight: 700, color: copied === e.id ? '#10B981' : 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                    {copied === e.id ? <><CheckIcon size={12} color="#10B981" /> Copied</> : <><ClipboardIcon size={12} /> Copy</>}
                  </button>

                  {/* Regen code */}
                  <button onClick={() => regenerateCode(e)}
                    disabled={saving === e.id}
                    title="Regenerate login code"
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 'var(--radius-md)', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap', opacity: saving === e.id ? 0.5 : 1 }}>
                    <RefreshIcon size={12} /> {saving === e.id ? 'Regenerating…' : 'Regen'}
                  </button>

                  {/* Reset password */}
                  <button onClick={() => resetPassword(e)}
                    disabled={resetting === e.id}
                    title="Reset this user's password"
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 'var(--radius-md)', background: rev ? '#F59E0B15' : 'var(--glass-bg)', border: `1px solid ${rev ? '#F59E0B55' : 'var(--glass-border)'}`, cursor: 'pointer', fontSize: '0.7rem', fontWeight: 700, color: resetting === e.id ? 'var(--text-muted)' : '#F59E0B', whiteSpace: 'nowrap', opacity: resetting === e.id ? 0.6 : 1 }}>
                    <KeyIcon size={12} color={resetting === e.id ? 'var(--text-muted)' : '#F59E0B'} /> {resetting === e.id ? 'Resetting…' : 'Reset Pwd'}
                  </button>
                </div>
              </div>

              {/* Revealed new password — stays until dismissed */}
              {rev && (
                <div style={{ marginTop: 'var(--space-3)', background: '#F59E0B0D', border: '1px solid #F59E0B33', borderRadius: 'var(--radius-md)', padding: 'var(--space-3) var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#F59E0B' }}>New password:</span>
                  <code style={{ fontSize: '0.82rem', fontWeight: 700, color: '#F59E0B', fontFamily: 'monospace', letterSpacing: '0.08em', flex: 1 }}>
                    {rev.password}
                  </code>
                  <button onClick={() => copyNewPassword(e.id, rev.password)}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 'var(--radius-sm)', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer', background: 'var(--glass-bg)', border: `1px solid ${rev.copied ? '#10B981' : '#F59E0B55'}`, color: rev.copied ? '#10B981' : '#F59E0B', whiteSpace: 'nowrap' }}>
                    {rev.copied ? <><CheckIcon size={12} color="#10B981" /> Copied</> : 'Copy'}
                  </button>
                  <button onClick={() => dismissPassword(e.id)}
                    title="Dismiss — make sure you've copied the password first"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0 4px', display: 'flex' }}>
                    <XIcon size={16} />
                  </button>
                  <p style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.68rem', color: '#F59E0B99', margin: 0 }}>
                    <AlertIcon size={12} color="#F59E0B99" /> Copy this now — it won't be shown again once you dismiss it.
                  </p>
                </div>
              )}

            </div>
          )
        })
      )}

      <div style={{ height: 110 }} />
    </RolePageWrapper>
  )
}
