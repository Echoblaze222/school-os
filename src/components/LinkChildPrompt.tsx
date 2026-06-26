'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { UserIcon } from '@/components/Icons'

interface Props { userId: string; schoolColor: string; schoolId: string }

export default function LinkChildPrompt({ userId, schoolColor, schoolId }: Props) {
  const [code,    setCode]    = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [found,   setFound]   = useState<any>(null)

  async function findChild() {
    if (!code.trim()) return
    setLoading(true); setError(''); setFound(null)
    try {
      const supabase = createClient()

      // Step 1: find student by code — simple query, no joins
      const { data: student, error: e1 } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .eq('default_code', code.trim().toUpperCase())
        .eq('role', 'student')
        .eq('school_id', schoolId)
        .maybeSingle()

      if (e1) throw e1
      if (!student) {
        setError('No student found with that code. Check with the school admin.')
        return
      }

      // Step 2: get their class label separately
      const { data: sp } = await supabase
        .from('student_profiles')
        .select('class_id, classes(name, class_level)')
        .eq('id', student.id)
        .maybeSingle()

      const classLabel = (sp?.classes as any)?.class_level
                      ?? (sp?.classes as any)?.name
                      ?? 'Student'

      setFound({ ...student, class_label: classLabel })
    } catch (err: any) {
      console.error('findChild error:', err)
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function linkChild() {
    setLoading(true); setError('')
    try {
      const supabase = createClient()

      // Check if already linked
      const { data: existing } = await supabase
        .from('parent_student_links')
        .select('id')
        .eq('parent_id', userId)
        .eq('student_id', found.id)
        .maybeSingle()

      if (!existing) {
        const { error: insertErr } = await supabase
          .from('parent_student_links')
          .insert({ parent_id: userId, student_id: found.id })

        if (insertErr) throw insertErr
      }

      window.location.reload()
    } catch (err: any) {
      console.error('linkChild error:', err)
      setError('Failed to link child: ' + (err?.message ?? 'unknown error'))
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
            Enter your child's student access code to connect your account
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
              Student Access Code
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && findChild()}
                placeholder="e.g. STU-2024-001"
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
                  ? <img src={found.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
            The access code is given by your school's secretary or principal. It looks like{' '}
            <span style={{ fontFamily: 'monospace', color: 'var(--text-primary)' }}>STU-2024-001</span>.
          </div>
        </div>
      </div>
    </div>
  )
}
