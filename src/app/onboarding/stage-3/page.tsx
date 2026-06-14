'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const ROLE_ROUTES: Record<string, string> = {
  student:   '/dashboard/student',
  teacher:   '/dashboard/teacher',
  principal: '/dashboard/principal',
  bursar:    '/dashboard/bursar',
  secretary: '/dashboard/secretary',
  parent:    '/dashboard/parent',
}

type VerifiedIdentity = {
  firstName:   string
  lastName:    string
  middleName:  string
  dateOfBirth: string
  gender:      string
  phone:       string
  photo:       string | null
}

type NinStatus = 'idle' | 'verifying' | 'verified' | 'failed'

export default function OnboardingStage3() {
  const [photo,           setPhoto]           = useState<File | null>(null)
  const [nin,             setNin]             = useState('')
  const [preview,         setPreview]         = useState('')
  const [loading,         setLoading]         = useState(false)
  const [error,           setError]           = useState('')
  const [ninStatus,       setNinStatus]       = useState<NinStatus>('idle')
  const [ninError,        setNinError]        = useState('')
  const [verifiedId,      setVerifiedId]      = useState<VerifiedIdentity | null>(null)
  const router   = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const saved = localStorage.getItem('schoolos_theme') ?? 'dark'
    document.documentElement.setAttribute('data-theme', saved)
  }, [])

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhoto(file)
    setPreview(URL.createObjectURL(file))
  }

  // Called when the NIN field loses focus or the user clicks "Verify NIN"
  async function verifyNin() {
    if (nin.length !== 11) return
    setNinStatus('verifying')
    setNinError('')
    setVerifiedId(null)

    const res = await fetch('/api/auth/verify-nin', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ nin }),
    })

    const data = await res.json()

    if (!res.ok || !data.verified) {
      setNinStatus('failed')
      setNinError(data.error ?? 'NIN verification failed. Please check the number.')
      return
    }

    setNinStatus('verified')
    setVerifiedId(data.identity)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!photo)                  { setError('Please upload your passport photo'); return }
    if (nin.length !== 11)       { setError('NIN must be 11 digits'); return }
    if (ninStatus !== 'verified') { setError('Please verify your NIN before continuing'); return }

    setLoading(true); setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const nameParts = photo.name.split('.')
    const ext  = nameParts.length > 1 ? nameParts.pop()!.toLowerCase() : 'jpg'
    const path = `passports/${user.id}.${ext}`

    const { error: upErr } = await supabase.storage
      .from('avatars').upload(path, photo, { upsert: true })

    if (upErr) {
      setError(`Upload failed: ${upErr.message}. Please try again.`)
      setLoading(false)
      return
    }

    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)

    const { data: profile, error: profileErr } = await supabase.from('profiles')
      .update({
        avatar_url:         urlData.publicUrl,
        nin_screenshot_url: nin,
        nin_verified:       true,
        nin_verified_at:    new Date().toISOString(),
        onboarding_stage:   'complete',
      })
      .eq('id', user.id)
      .select('role')
      .single()

    if (profileErr) {
      setError(`Profile update failed: ${profileErr.message}`)
      setLoading(false)
      return
    }

    router.push(ROLE_ROUTES[(profile as any)?.role ?? 'student'])
  }

  // NIN status indicator shown next to the input
  const ninIndicator = () => {
    if (ninStatus === 'verifying') return (
      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
        <span style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.2)', borderTopColor: '#7C3AED', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
        Verifying with NIMC...
      </span>
    )
    if (ninStatus === 'verified') return (
      <span style={{ fontSize: '0.72rem', color: '#10B981', display: 'flex', alignItems: 'center', gap: 5, marginTop: 6, fontWeight: 600 }}>
        ✅ NIN verified
      </span>
    )
    if (ninStatus === 'failed') return (
      <span style={{ fontSize: '0.72rem', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 5, marginTop: 6 }}>
        ❌ {ninError}
      </span>
    )
    return null
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 440, background: 'var(--bg-surface)', border: '1px solid var(--glass-border)', borderRadius: 24, padding: 40, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 56, height: 56, background: 'linear-gradient(135deg,#10B981,#059669)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: '1.5rem', boxShadow: '0 4px 16px rgba(16,185,129,0.3)' }}>📸</div>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px', letterSpacing: '-0.02em' }}>Final Step</h1>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>Step 3 of 3 — Passport photo &amp; NIN verification</p>
        </div>

        {/* Progress dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 28 }}>
          {[1, 2, 3].map(n => (
            <div key={n} style={{ width: n === 3 ? 24 : 8, height: 8, borderRadius: 99, background: n === 3 ? '#10B981' : 'var(--glass-border)', transition: 'all 0.3s' }} />
          ))}
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Photo upload */}
          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>Passport Photo</label>
            <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 24, background: 'var(--glass-bg)', border: `2px dashed ${preview ? '#10B981' : 'var(--glass-border)'}`, borderRadius: 16, cursor: 'pointer', transition: 'border-color 0.2s' }}>
              {preview
                ? <img src={preview} alt="Preview" style={{ width: 90, height: 90, borderRadius: '50%', objectFit: 'cover', border: '3px solid #10B981' }} />
                : <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--glass-bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem' }}>👤</div>
              }
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: preview ? '#10B981' : 'var(--brand-light)' }}>
                {preview ? '✓ Photo uploaded — tap to change' : 'Tap to upload'}
              </span>
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhoto} />
            </label>
          </div>

          {/* NIN field */}
          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
              National Identification Number (NIN)
            </label>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '0 0 8px' }}>
              11 digits — verified in real time against NIMC
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                inputMode="numeric"
                maxLength={11}
                value={nin}
                onChange={e => {
                  const val = e.target.value.replace(/\D/g, '')
                  setNin(val)
                  // Reset verification if user edits the NIN
                  if (ninStatus !== 'idle') {
                    setNinStatus('idle')
                    setVerifiedId(null)
                    setNinError('')
                  }
                }}
                onBlur={() => { if (nin.length === 11 && ninStatus === 'idle') verifyNin() }}
                placeholder="e.g. 12345678901"
                style={{
                  flex: 1,
                  height: 48,
                  padding: '0 14px',
                  background: 'var(--input-bg)',
                  border: `1px solid ${
                    ninStatus === 'verified' ? '#10B981' :
                    ninStatus === 'failed'   ? 'var(--danger)' :
                    'var(--input-border)'
                  }`,
                  borderRadius: 12,
                  color: 'var(--text-primary)',
                  fontSize: '0.9rem',
                  outline: 'none',
                  letterSpacing: '0.08em',
                  transition: 'border-color 0.2s',
                }}
              />
              {/* Manual verify button — for when onBlur doesn't fire (e.g. mobile) */}
              {nin.length === 11 && ninStatus !== 'verified' && (
                <button
                  type="button"
                  onClick={verifyNin}
                  disabled={ninStatus === 'verifying'}
                  style={{
                    height: 48, padding: '0 16px',
                    background: 'var(--glass-bg)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: 12,
                    color: 'var(--text-secondary)',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: ninStatus === 'verifying' ? 'not-allowed' : 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {ninStatus === 'verifying' ? '...' : 'Verify'}
                </button>
              )}
            </div>
            {ninIndicator()}
          </div>

          {/* Verified identity card — shown after successful NIN lookup */}
          {ninStatus === 'verified' && verifiedId && (
            <div style={{
              background: 'rgba(16,185,129,0.06)',
              border: '1px solid rgba(16,185,129,0.25)',
              borderRadius: 14,
              padding: '16px 18px',
              display: 'flex',
              gap: 16,
              alignItems: 'flex-start',
            }}>
              {/* NIMC photo if returned */}
              {verifiedId.photo ? (
                <img
                  src={`data:image/jpeg;base64,${verifiedId.photo}`}
                  alt="NIMC photo"
                  style={{ width: 52, height: 52, borderRadius: 10, objectFit: 'cover', border: '2px solid rgba(16,185,129,0.4)', flexShrink: 0 }}
                />
              ) : (
                <div style={{ width: 52, height: 52, borderRadius: 10, background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', flexShrink: 0 }}>🪪</div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '0.7rem', color: '#10B981', fontWeight: 700, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Identity Verified</p>
                <p style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 2px' }}>
                  {[verifiedId.firstName, verifiedId.middleName, verifiedId.lastName].filter(Boolean).join(' ')}
                </p>
                {verifiedId.dateOfBirth && (
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0 0 1px' }}>DOB: {verifiedId.dateOfBirth}</p>
                )}
                {verifiedId.gender && (
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0, textTransform: 'capitalize' }}>{verifiedId.gender}</p>
                )}
              </div>
            </div>
          )}

          {error && (
            <p style={{ fontSize: '0.78rem', color: 'var(--danger)', background: 'var(--danger-subtle)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px', margin: 0 }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || ninStatus !== 'verified'}
            style={{
              width: '100%', height: 50,
              background: ninStatus === 'verified'
                ? 'linear-gradient(135deg,#10B981,#059669)'
                : 'var(--glass-bg)',
              color: ninStatus === 'verified' ? '#fff' : 'var(--text-muted)',
              border: ninStatus === 'verified' ? 'none' : '1px solid var(--glass-border)',
              borderRadius: 12, fontSize: '0.9rem', fontWeight: 700,
              cursor: ninStatus === 'verified' ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: ninStatus === 'verified' ? '0 4px 16px rgba(16,185,129,0.3)' : 'none',
              transition: 'all 0.25s',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading
              ? <span style={{ width: 20, height: 20, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
              : ninStatus === 'verified' ? '🚀 Complete Setup' : 'Verify NIN to continue'
            }
          </button>

        </form>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
