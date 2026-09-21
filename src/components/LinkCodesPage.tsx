'use client'
// Shared by /dashboard/principal/link-codes and /dashboard/secretary/link-codes.
// Lets staff generate the one-time PARENT LINK CODE for a student. The code is
// shown once, right here; the server only keeps a hash and cannot show it again.

import { useMemo, useState } from 'react'
import RoleSubHeader from '@/components/RoleSubHeader'
import { PRINCIPAL_FEATURE_GROUPS } from '@/app/dashboard/principal/featureGroups'
import { SECRETARY_FEATURE_GROUPS } from '@/app/dashboard/secretary/featureGroups'

interface Student { id: string; full_name: string; class_level: string | null }

interface Props {
  role:     'principal' | 'secretary'
  userId:   string
  profile:  any
  school:   any
  students: Student[]
}

interface Issued { studentId: string; name: string; code: string; expiresAt: string }

export default function LinkCodesPage({ role, userId, profile, school, students }: Props) {
  const brand = school?.primary_color ?? '#800020'
  const [query,  setQuery]  = useState('')
  const [busy,   setBusy]   = useState<string | null>(null)
  const [error,  setError]  = useState<string | null>(null)
  const [issued, setIssued] = useState<Issued | null>(null)
  const [copied, setCopied] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? students.filter(s => (s.full_name ?? '').toLowerCase().includes(q)) : students
  }, [students, query])

  async function generate(s: Student) {
    setBusy(s.id); setError(null); setCopied(false)
    try {
      const res  = await fetch('/api/students/link-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: s.id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) { setError(data.error || 'Could not generate a code.'); return }
      setIssued({ studentId: s.id, name: s.full_name, code: data.code, expiresAt: data.expiresAt })
    } catch {
      setError('Could not generate a code. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  async function copy() {
    if (!issued) return
    await navigator.clipboard.writeText(`Parent link code for ${issued.name}: ${issued.code}`).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <RoleSubHeader
      userId={userId}
      role={role}
      profile={profile}
      school={school}
      title="Parent link codes"
      featureGroups={role === 'principal' ? PRINCIPAL_FEATURE_GROUPS : SECRETARY_FEATURE_GROUPS}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 110 }}>
        <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 12, padding: '12px 14px', fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          A parent needs this code to link their account to their child. Generate one for the student,
          then give it to the parent. It works for both parents, expires in 30 days, and is shown
          <strong style={{ color: 'var(--text-secondary)' }}> only once</strong>. Generating a new code
          replaces the old one.
        </div>

        {issued && (
          <div style={{ border: `1px solid ${brand}55`, background: `${brand}0f`, borderRadius: 14, padding: 16 }}>
            <p style={{ margin: '0 0 6px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Parent link code for <strong>{issued.name}</strong></p>
            <code style={{ display: 'block', fontSize: '1.15rem', fontWeight: 800, letterSpacing: '0.06em', color: brand, wordBreak: 'break-all' }}>{issued.code}</code>
            <p style={{ margin: '8px 0 12px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Expires {new Date(issued.expiresAt).toLocaleDateString()}. Copy it now: it cannot be shown again.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={copy} style={{ padding: '8px 16px', borderRadius: 999, border: `1px solid ${brand}`, background: copied ? '#10B98122' : 'transparent', color: copied ? '#10B981' : brand, fontWeight: 700, cursor: 'pointer' }}>
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button onClick={() => setIssued(null)} style={{ padding: '8px 16px', borderRadius: 999, border: '1px solid var(--glass-border)', background: 'transparent', color: 'var(--text-muted)', fontWeight: 600, cursor: 'pointer' }}>
                Done
              </button>
            </div>
          </div>
        )}

        {error && <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--danger)' }}>{error}</p>}

        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search students by name"
          style={{ height: 44, padding: '0 14px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 10, color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none' }}
        />

        {filtered.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No students found.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 12px', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.full_name}</p>
                  <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)' }}>{s.class_level ?? 'No class'}</p>
                </div>
                <button
                  onClick={() => generate(s)}
                  disabled={busy === s.id}
                  style={{ padding: '8px 14px', borderRadius: 999, border: `1px solid ${brand}`, background: 'transparent', color: brand, fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', whiteSpace: 'nowrap', opacity: busy === s.id ? 0.5 : 1 }}>
                  {busy === s.id ? 'Wait...' : 'Generate code'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </RoleSubHeader>
  )
}
