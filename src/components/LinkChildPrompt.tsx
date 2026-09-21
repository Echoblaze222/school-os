'use client'
import { useState } from 'react'
import Image from 'next/image'
import { UserIcon } from '@/components/Icons'

// C1: linking is now done through the server with a PARENT LINK CODE issued by
// the school for this specific child. The student's normal access code /
// default_code is only a visible identifier and no longer works here, and the
// browser no longer reads student profiles or inserts into
// parent_student_links itself.

interface Props { userId: string; schoolColor: string; schoolId: string; onLinked?: () => void }

interface FoundChild { full_name: string; avatar_url: string | null; class_label: string }

export default function LinkChildPrompt({ schoolColor, onLinked }: Props) {
  const [code,    setCode]    = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [found,   setFound]   = useState<FoundChild | null>(null)

  async function call(preview: boolean) {
    const res = await fetch('/api/parent/link-child', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ child_code: code.trim(), preview }),
    })
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok && data.ok === true, data }
  }

  async function findChild() {
    if (!code.trim()) return
    setLoading(true); setError(''); setFound(null)
    try {
      const { ok, data } = await call(true)
      if (!ok) { setError(data.error || 'Something went wrong. Please try again.'); return }
      setFound(data.student)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function linkChild() {
    setLoading(true); setError('')
    try {
      const { ok, data } = await call(false)
      if (!ok) { setError(data.error || 'Failed to link child. Please try again.'); setLoading(false); return }
      if (onLinked) {
        onLinked()
      } else {
        window.location.reload()
      }
    } catch {
      setError('Failed to link child. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 420, background: 'var(--bg-surface)', border: '1px solid var(--glass-border)', borderRadius: 24, padding: '40px 32px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>

        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 64, height: 64, background: schoolColor, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', boxShadow: `0 4px 20px ${schoolColor}40` }}>
            <UserIcon size={28} color="white" />
          </div>
          <h1 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px', letterSpacing: '-0.02em' }}>
            Link Your Child
          </h1>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
            Enter the parent link code your school gave you for your child
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
              Parent Link Code
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && findChild()}
                placeholder="e.g. LNK-XXXX-XXXX-XXXX-XXXX"
                autoComplete="off"
                style={{ flex: 1, height: 46, padding: '0 14px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 10, color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none', letterSpacing: '0.04em', fontFamily: 'monospace' }}
              />
              <button
                onClick={findChild}
                disabled={loading || !code.trim()}
                style={{ height: 46, padding: '0 16px', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 10, color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', whiteSpace: 'nowrap', opacity: loading || !code.trim() ? 0.5 : 1 }}>
                {loading ? '...' : 'Find'}
              </button>
            </div>
          </div>

          {error && (
            <p style={{ fontSize: '0.78rem', color: 'var(--danger)', background: 'var(--danger-subtle)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px', margin: 0 }}>
              {error}
            </p>
          )}

          {found && (
            <div style={{ background: `${schoolColor}12`, border: `1px solid ${schoolColor}30`, borderRadius: 12, padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: schoolColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                {found.avatar_url
                  ? <Image src={found.avatar_url} alt="" width={44} height={44} style={{ objectFit: 'cover' }} />
                  : <span style={{ fontWeight: 800, color: '#fff', fontSize: '1rem' }}>{found.full_name?.[0]}</span>
                }
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 2px', fontSize: '0.9rem' }}>{found.full_name}</p>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: 0 }}>{found.class_label} · Student</p>
              </div>
              <button
                onClick={linkChild}
                disabled={loading}
                style={{ padding: '8px 16px', background: schoolColor, color: '#fff', border: 'none', borderRadius: 999, fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', flexShrink: 0, opacity: loading ? 0.7 : 1 }}>
                {loading ? '...' : 'Link ✓'}
              </button>
            </div>
          )}

          <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 10, padding: '12px 14px', fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--text-secondary)' }}>Where to find the code?</strong><br />
            Your school's secretary or principal can generate a parent link code for your child. It looks like{' '}
            <span style={{ fontFamily: 'monospace', color: 'var(--text-primary)' }}>LNK-7H2K-9QXM-4TRD-B8WP</span>{' '}
            and expires after 30 days.
          </div>
        </div>
      </div>
    </div>
  )
}
