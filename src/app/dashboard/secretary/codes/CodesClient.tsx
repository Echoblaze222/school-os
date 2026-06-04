'use client'
// src/app/dashboard/secretary/codes/CodesClient.tsx

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import styles from '../secretary.module.css'

interface CodeEntry { id: string; full_name: string; email: string; role: string; default_code: string; is_active: boolean; created_at: string }
interface Props { entries: CodeEntry[]; profile: any; school: any; userId: string }

const ROLE_COLORS: Record<string, string> = {
  student: '#10B981', teacher: '#3B82F6', bursar: '#F59E0B',
  secretary: '#8B5CF6', librarian: '#EC4899', nurse: '#EF4444',
}

export default function CodesClient({ entries: init, profile, school, userId }: Props) {
  const [entries,  setEntries] = useState(init)
  const [search,   setSearch]  = useState('')
  const [roleTab,  setRoleTab] = useState('all')
  const [copied,   setCopied]  = useState<string | null>(null)
  const [saving,   setSaving]  = useState<string | null>(null)

  const supabase = createClient()
  const sc       = school?.primary_color ?? '#7C3AED'

  const filtered = entries.filter(e => {
    const matchSearch = e.full_name?.toLowerCase().includes(search.toLowerCase()) || e.default_code?.toLowerCase().includes(search.toLowerCase()) || e.email?.toLowerCase().includes(search.toLowerCase())
    const matchRole   = roleTab === 'all' || e.role === roleTab
    return matchSearch && matchRole
  })

  async function regenerateCode(entry: CodeEntry) {
    setSaving(entry.id)
    const year = new Date().getFullYear()
    const rand = Math.floor(1000 + Math.random() * 9000)
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

  const roles = ['all', ...Array.from(new Set(entries.map(e => e.role))).sort()]

  return (
    <RolePageWrapper userId={userId} role="secretary" profile={profile} school={school} title="Access Codes">
      <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', marginBottom: 'var(--space-5)', display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
        <span style={{ fontSize: '1.2rem' }}>🔐</span>
        <div>
          <p style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 2px' }}>Access Codes</p>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: 0 }}>Each user has a unique login code. Share it with them to access SchoolOS. You can regenerate a code if it's been compromised.</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
        <div className={styles.searchBar} style={{ flex: 1, marginBottom: 0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input className={styles.searchInput} placeholder="Search by name or code…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-5)', overflowX: 'auto', paddingBottom: 4 }}>
        {roles.map(r => (
          <button key={r} onClick={() => setRoleTab(r)}
            style={{ padding: '6px 14px', borderRadius: 'var(--radius-full)', border: '1px solid', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
              background: roleTab === r ? (ROLE_COLORS[r] ?? sc) + '22' : 'var(--glass-bg)',
              borderColor: roleTab === r ? (ROLE_COLORS[r] ?? sc) : 'var(--glass-border)',
              color: roleTab === r ? (ROLE_COLORS[r] ?? sc) : 'var(--text-muted)',
            }}>{r === 'all' ? 'All' : r.charAt(0).toUpperCase() + r.slice(1)} ({entries.filter(e => r === 'all' || e.role === r).length})</button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className={styles.emptyState}><p className={styles.emptyEmoji}>🔑</p><p className={styles.emptyTitle}>No users found</p></div>
      ) : (
        filtered.map(e => (
          <div key={e.id} style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4) var(--space-5)', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
            <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: (ROLE_COLORS[e.role] ?? sc) + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: '1rem' }}>👤</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.full_name}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <code style={{ fontSize: '0.78rem', fontWeight: 700, color: sc, background: sc + '15', padding: '2px 8px', borderRadius: 'var(--radius-md)', letterSpacing: '0.04em', fontFamily: 'monospace' }}>{e.default_code}</code>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{e.role}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <button onClick={() => copyCode(e.default_code, e.id)}
                title="Copy code"
                style={{ padding: '5px 10px', borderRadius: 'var(--radius-md)', background: copied === e.id ? '#10B98122' : 'var(--glass-bg)', border: `1px solid ${copied === e.id ? '#10B981' : 'var(--glass-border)'}`, cursor: 'pointer', fontSize: '0.7rem', fontWeight: 700, color: copied === e.id ? '#10B981' : 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                {copied === e.id ? '✓ Copied' : '📋 Copy'}
              </button>
              <button onClick={() => regenerateCode(e)}
                disabled={saving === e.id}
                title="Regenerate code"
                style={{ padding: '5px 10px', borderRadius: 'var(--radius-md)', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap', opacity: saving === e.id ? 0.5 : 1 }}>
                {saving === e.id ? '⏳' : '🔄 Regen'}
              </button>
            </div>
          </div>
        ))
      )}
      <div style={{ height: 110 }} />
    </RolePageWrapper>
  )
}
