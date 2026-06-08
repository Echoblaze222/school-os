'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function OnboardingStage1() {
  const [fullName,   setFullName]   = useState('')
  const [phone,      setPhone]      = useState('')
  const [password,   setPassword]   = useState('')
  const [confirm,    setConfirm]    = useState('')
  const [showPass,   setShowPass]   = useState(false)
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState('')
  const [prefilling, setPrefilling] = useState(true)
  const router   = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const saved = localStorage.getItem('schoolos_theme') ?? 'dark'
    document.documentElement.setAttribute('data-theme', saved)
    // Pre-fill existing profile data
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      supabase.from('profiles').select('full_name, phone').eq('id', user.id).single()
        .then(({ data }) => {
          if (data?.full_name) setFullName(data.full_name)
          if (data?.phone)     setPhone(data.phone)
          setPrefilling(false)
        })
    })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!fullName.trim())        { setError('Full name is required'); return }
    if (password.length < 8)     { setError('Password must be at least 8 characters'); return }
    if (password !== confirm)    { setError('Passwords do not match'); return }
    setLoading(true); setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    // Update password via Supabase auth
    const { error: passErr } = await supabase.auth.updateUser({ password })
    if (passErr) {
      setError(`Password update failed: ${passErr.message}`)
      setLoading(false)
      return
    }

    // Update profile
    const { error: profileErr } = await supabase.from('profiles')
      .update({
        full_name:        fullName.trim(),
        phone:            phone.trim() || null,
        onboarding_stage: 'stage_2_pending',
      })
      .eq('id', user.id)

    if (profileErr) {
      setError(`Profile update failed: ${profileErr.message}`)
      setLoading(false)
      return
    }

    router.push('/onboarding/stage-2')
  }

  if (prefilling) return null

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)', padding: 20, position: 'relative', overflow: 'hidden' }}>
      {/* Background orbs */}
      <div style={{ position: 'absolute', top: -100, left: -80, width: 350, height: 350, borderRadius: '50%', background: 'radial-gradient(circle,rgba(124,58,237,0.2) 0%,transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: -80, right: -60, width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle,rgba(16,185,129,0.12) 0%,transparent 70%)', pointerEvents: 'none' }} />

      <div style={{ width: '100%', maxWidth: 420, background: 'var(--bg-surface)', border: '1px solid var(--glass-border)', borderRadius: 24, padding: '40px 36px', position: 'relative', zIndex: 1, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 56, height: 56, background: 'linear-gradient(135deg,#7C3AED,#5B21B6)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: '1.5rem', boxShadow: '0 4px 16px rgba(124,58,237,0.3)' }}>🎓</div>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px', letterSpacing: '-0.02em' }}>Welcome to SchoolOS</h1>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>Step 1 of 3 — Set up your profile &amp; password</p>
        </div>

        {/* Progress dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 28 }}>
          {[1, 2, 3].map(n => (
            <div key={n} style={{ width: n === 1 ? 24 : 8, height: 8, borderRadius: 99, background: n === 1 ? '#7C3AED' : 'var(--glass-border)', transition: 'all 0.3s' }} />
          ))}
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Full Name */}
          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Full Name *</label>
            <input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="e.g. Adaeze Okonkwo"
              style={{ width: '100%', height: 48, padding: '0 14px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 12, color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none' }}
            />
          </div>

          {/* Phone */}
          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Phone Number</label>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '0 0 6px' }}>Optional — used for account recovery</p>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="e.g. 08012345678"
              style={{ width: '100%', height: 48, padding: '0 14px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 12, color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none' }}
            />
          </div>

          {/* Password */}
          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Create Password *</label>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '0 0 6px' }}>At least 8 characters</p>
            <div style={{ position: 'relative' }}>
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Create a strong password"
                style={{ width: '100%', height: 48, padding: '0 44px 0 14px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 12, color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none' }}
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.8rem', padding: 4 }}
              >
                {showPass ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {/* Confirm Password */}
          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Confirm Password *</label>
            <input
              type={showPass ? 'text' : 'password'}
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Re-enter your password"
              style={{ width: '100%', height: 48, padding: '0 14px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 12, color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none' }}
            />
          </div>

          {error && (
            <p style={{ fontSize: '0.78rem', color: 'var(--danger)', background: 'var(--danger-subtle)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px', margin: 0 }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{ width: '100%', height: 50, background: 'linear-gradient(135deg,#7C3AED,#5B21B6)', color: '#fff', border: 'none', borderRadius: 12, fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 4px 16px rgba(124,58,237,0.3)', opacity: loading ? 0.7 : 1 }}
          >
            {loading
              ? <span style={{ width: 20, height: 20, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
              : 'Continue →'
            }
          </button>
        </form>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
