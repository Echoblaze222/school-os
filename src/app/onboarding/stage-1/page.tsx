'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'

// Premium black / light: all colour from --pm-* tokens (src/app/premium.css).
// Flat surfaces, hairline borders, no gradients, no glow.
const fieldStyle: React.CSSProperties = {
  width: '100%', height: 48, padding: '0 20px',
  background: 'var(--pm-bg)', border: '1px solid var(--pm-line-strong)',
  borderRadius: 9999, color: 'var(--pm-text)', fontSize: '0.9rem', outline: 'none',
}
const labelStyle: React.CSSProperties = {
  fontSize: '0.7rem', fontWeight: 700, color: 'var(--pm-text-3)',
  letterSpacing: '0.07em', textTransform: 'uppercase', display: 'block', marginBottom: 8,
}

export default function OnboardingStage1() {
  const [fullName,   setFullName]   = useState('')
  const [phone,      setPhone]      = useState('')
  const [agreedToTerms, setAgreedToTerms] = useState(false)
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
    if (!fullName.trim()) { setError('Full name is required'); return }
    if (!agreedToTerms) { setError('You must agree to the Terms & Conditions and Privacy Policy to continue'); return }
    setLoading(true); setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    // Update profile - password was already set during the first-login flow
    // (access code → /api/auth/first-login). Stage 1 only collects profile info.
    const { error: profileErr } = await supabase.from('profiles')
      .update({
        full_name:         fullName.trim(),
        phone:             phone.trim() || null,
        onboarding_stage:  'stage_2_pending',
        terms_accepted_at: new Date().toISOString(),
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
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--pm-bg)', color: 'var(--pm-text)', padding: 20, position: 'relative', overflow: 'hidden' }}>

      <div style={{ width: '100%', maxWidth: 420, background: 'var(--pm-surface)', border: '1px solid var(--pm-line)', borderRadius: 24, padding: '40px 36px', position: 'relative', zIndex: 1 }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Image src="/icons/logo.png" alt="SchoolOS" width={56} height={56} style={{ margin: '0 auto 16px', borderRadius: 16, objectFit: 'contain' }} />
          <h1 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--pm-text)', margin: '0 0 6px', letterSpacing: '-0.02em' }}>Welcome to SchoolOS</h1>
          <p style={{ fontSize: '0.78rem', color: 'var(--pm-text-3)', margin: 0 }}>Step 1 of 3: Set up your profile</p>
        </div>

        {/* Progress dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 28 }}>
          {[1, 2, 3].map(n => (
            <div key={n} style={{ width: n === 1 ? 24 : 8, height: 8, borderRadius: 99, background: n === 1 ? 'var(--pm-text)' : 'var(--pm-line-strong)', transition: 'all 0.3s' }} />
          ))}
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Full Name */}
          <div>
            <label style={labelStyle}>Full Name *</label>
            <input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="e.g. Adaeze Okonkwo"
              style={fieldStyle}
            />
          </div>

          {/* Phone */}
          <div>
            <label style={{ ...labelStyle, marginBottom: 4 }}>Phone Number</label>
            <p style={{ fontSize: '0.72rem', color: 'var(--pm-text-3)', margin: '0 0 8px' }}>Optional, used for account recovery</p>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="e.g. 08012345678"
              style={fieldStyle}
            />
          </div>

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', borderRadius: 16, background: 'var(--pm-bg)', border: '1px solid var(--pm-line)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={agreedToTerms}
              onChange={e => setAgreedToTerms(e.target.checked)}
              style={{ marginTop: 2, width: 16, height: 16, flexShrink: 0, accentColor: 'var(--pm-accent)', cursor: 'pointer' }}
            />
            <span style={{ fontSize: '0.76rem', lineHeight: 1.5, color: 'var(--pm-text-2)' }}>
              I agree to the{' '}
              <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--pm-link)', textDecoration: 'underline' }}>Terms &amp; Conditions</a>
              {' '}and{' '}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--pm-link)', textDecoration: 'underline' }}>Privacy Policy</a>
            </span>
          </label>

          {error && (
            <p style={{ fontSize: '0.78rem', color: 'var(--pm-danger)', background: 'var(--pm-bg)', border: '1px solid var(--pm-danger)', borderRadius: 16, padding: '10px 14px', margin: 0 }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{ width: '100%', height: 50, background: 'var(--pm-accent)', color: 'var(--pm-accent-text)', border: 'none', borderRadius: 9999, fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: loading ? 0.7 : 1 }}
          >
            {loading
              ? <span style={{ width: 20, height: 20, border: '2px solid rgba(255,255,255,0.35)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
              : 'Continue →'
            }
          </button>
        </form>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
