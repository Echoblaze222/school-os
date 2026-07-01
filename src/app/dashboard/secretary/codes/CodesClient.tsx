'use client'
// src/app/dashboard/secretary/codes/CodesClient.tsx

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import styles from '../secretary.module.css'

interface CodeEntry {
  id: string; full_name: string; email: string; role: string
  default_code: string; is_active: boolean; created_at: string
}
interface Props { entries: CodeEntry[]; profile: any; school: any; userId: string }

const ROLE_COLORS: Record<string, string> = {
  student: '#10B981', teacher: '#3B82F6', bursar: '#F59E0B',
  secretary: '#8B5CF6', librarian: '#EC4899', nurse: '#EF4444',
}

// Stores a revealed new password per user id — cleared when dismissed
type RevealedPasswords = Record<string, { password: string; copied: boolean }>

export default function CodesClient({ entries: init, profile, school, userId }: Props) {
  const [entries,  setEntries]  = useState(init)
  const [search,   setSearch]   = useState('')
  const [roleTab,  setRoleTab]  = useState('all')
  const [copied,   setCopied]   = useState<string | null>(null)
  const [saving,   setSaving]   = useState<string | null>(null)

  // Reset password state
  const [resetting,  setResetting]  = useState<string | null>(null)
  const [revealed,   setRevealed]   = useState<RevealedPasswords>({})
  const [resetError, setResetError] = useState<string | null>(null)

  const supabase = createClient()
  const sc       = school?.primary_color ?? '#7C3AED'

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

  const roles = ['all', ...Array.from(new Set(entries.map(e => e.role))).sort()]

  return (
    <RolePageWrapper userId={userId} role="secretary" profile={profile} school={school} title="Access Codes">

      {/* Info banner */}
      <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', marginBottom: 'var(--space-5)', display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
        <span style={{ fontSize: '1.2rem' }}>🔐</span>
        <div>
          <p style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 2px' }}>Access Codes</p>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: 0 }}>
            Each user has a unique login code. Share it with them to access SchoolOS.
            You can regenerate a code if it's compromised, or reset their password if they've forgotten it.
          </p>
        </div>
      </div>

      {/* Global reset error */}
      {resetError && (
        <div style={{ background: '#EF444415', border: '1px solid #EF444433', borderRadius: 'var(--radius-md)', padding: 'var(--space-3) var(--space-4)', marginBottom: 'var(--space-4)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontSize: '0.78rem', color: '#EF4444', margin: 0 }}>{resetError}</p>
          <button onClick={() => setResetError(null)} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: '1rem', padding: 0 }}>×</button>
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
          <p className={styles.emptyEmoji}>🔑</p>
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
                  <span style={{ fontSize: '1rem' }}>👤</span>
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
                    style={{ padding: '5px 10px', borderRadius: 'var(--radius-md)', background: copied === e.id ? '#10B98122' : 'var(--glass-bg)', border: `1px solid ${copied === e.id ? '#10B981' : 'var(--glass-border)'}`, cursor: 'pointer', fontSize: '0.7rem', fontWeight: 700, color: copied === e.id ? '#10B981' : 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                    {copied === e.id ? '✓ Copied' : '📋 Copy'}
                  </button>

                  {/* Regen code */}
                  <button onClick={() => regenerateCode(e)}
                    disabled={saving === e.id}
                    title="Regenerate login code"
                    style={{ padding: '5px 10px', borderRadius: 'var(--radius-md)', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap', opacity: saving === e.id ? 0.5 : 1 }}>
                    {saving === e.id ? '⏳' : '🔄 Regen'}
                  </button>

                  {/* Reset password */}
                  <button onClick={() => resetPassword(e)}
                    disabled={resetting === e.id}
                    title="Reset this user's password"
                    style={{ padding: '5px 10px', borderRadius: 'var(--radius-md)', background: rev ? '#F59E0B15' : 'var(--glass-bg)', border: `1px solid ${rev ? '#F59E0B55' : 'var(--glass-border)'}`, cursor: 'pointer', fontSize: '0.7rem', fontWeight: 700, color: resetting === e.id ? 'var(--text-muted)' : '#F59E0B', whiteSpace: 'nowrap', opacity: resetting === e.id ? 0.6 : 1 }}>
                    {resetting === e.id ? '⏳ Resetting…' : '🔑 Reset Pwd'}
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
                    style={{ padding: '4px 10px', borderRadius: 'var(--radius-sm)', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer', background: 'var(--glass-bg)', border: `1px solid ${rev.copied ? '#10B981' : '#F59E0B55'}`, color: rev.copied ? '#10B981' : '#F59E0B', whiteSpace: 'nowrap' }}>
                    {rev.copied ? '✓ Copied' : 'Copy'}
                  </button>
                  <button onClick={() => dismissPassword(e.id)}
                    title="Dismiss — make sure you've copied the password first"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1rem', padding: '0 4px', lineHeight: 1 }}>
                    ×
                  </button>
                  <p style={{ width: '100%', fontSize: '0.68rem', color: '#F59E0B99', margin: 0 }}>
                    ⚠️ Copy this now — it won't be shown again once you dismiss it.
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
