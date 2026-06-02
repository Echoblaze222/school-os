'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const ROLE_ROUTES: Record<string, string> = {
  student: '/dashboard/student', teacher: '/dashboard/teacher',
  principal: '/dashboard/principal', bursar: '/dashboard/bursar',
  secretary: '/dashboard/secretary', parent: '/dashboard/parent',
}

export default function OnboardingStage3() {
  const [photo,   setPhoto]   = useState<File | null>(null)
  const [nin,     setNin]     = useState('')
  const [preview, setPreview] = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!photo)           { setError('Please upload your passport photo'); return }
    if (nin.length < 11)  { setError('NIN must be 11 digits'); return }
    setLoading(true); setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const ext  = photo.name.split('.').pop()
    const path = `passports/${user.id}.${ext}`
    const { error: upErr } = await supabase.storage
      .from('passports').upload(path, photo, { upsert: true })
    if (upErr) {
      console.error('Passport upload error:', upErr)
      setError(`Upload failed: ${upErr.message}. Please try again.`)
      setLoading(false)
      return
    }

    const { data: urlData } = supabase.storage.from('passports').getPublicUrl(path)
    const { data: profile, error: profileErr } = await supabase.from('profiles')
      .update({ avatar_url: urlData.publicUrl, nin, onboarding_stage: 0 })
      .eq('id', user.id).select('role').single()

    if (profileErr) {
      console.error('Profile update error:', profileErr)
      setError(`Profile update failed: ${profileErr.message}`)
      setLoading(false)
      return
    }

    router.push(ROLE_ROUTES[(profile as any)?.role ?? 'student'])
  }

  return (
    <div style={{ minHeight:'100dvh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg-base)', padding:20 }}>
      <div style={{ width:'100%', maxWidth:420, background:'var(--bg-surface)', border:'1px solid var(--glass-border)', borderRadius:24, padding:40, boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ width:56, height:56, background:'linear-gradient(135deg,#10B981,#059669)', borderRadius:16, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px', fontSize:'1.5rem', boxShadow:'0 4px 16px rgba(16,185,129,0.3)' }}>📸</div>
          <h1 style={{ fontSize:'1.3rem', fontWeight:800, color:'var(--text-primary)', margin:'0 0 6px', letterSpacing:'-0.02em' }}>Final Step</h1>
          <p style={{ fontSize:'0.78rem', color:'var(--text-muted)', margin:0 }}>Step 3 of 3 — Passport photo &amp; NIN</p>
        </div>

        <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:20 }}>
          {/* Photo upload */}
          <div>
            <label style={{ fontSize:'0.78rem', fontWeight:700, color:'var(--text-secondary)', display:'block', marginBottom:8 }}>Passport Photo</label>
            <label style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:12, padding:24, background:'var(--glass-bg)', border:'2px dashed var(--glass-border)', borderRadius:16, cursor:'pointer' }}>
              {preview
                ? <img src={preview} alt="Preview" style={{ width:90, height:90, borderRadius:'50%', objectFit:'cover', border:'3px solid var(--brand)' }}/>
                : <div style={{ width:72, height:72, borderRadius:'50%', background:'var(--glass-bg-hover)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.8rem' }}>👤</div>
              }
              <span style={{ fontSize:'0.82rem', fontWeight:600, color:'var(--brand-light)' }}>
                {preview ? 'Change photo' : 'Tap to upload'}
              </span>
              <input type="file" accept="image/*" style={{ display:'none' }} onChange={handlePhoto}/>
            </label>
          </div>

          {/* NIN */}
          <div>
            <label style={{ fontSize:'0.78rem', fontWeight:700, color:'var(--text-secondary)', display:'block', marginBottom:4 }}>NIN (11 digits)</label>
            <p style={{ fontSize:'0.72rem', color:'var(--text-muted)', margin:'0 0 8px' }}>Your National Identity Number</p>
            <input
              type="text" inputMode="numeric" maxLength={11}
              value={nin} onChange={e => setNin(e.target.value.replace(/\D/g,''))}
              placeholder="e.g. 12345678901"
              style={{ width:'100%', height:48, padding:'0 14px', background:'var(--input-bg)', border:'1px solid var(--input-border)', borderRadius:12, color:'var(--text-primary)', fontSize:'0.9rem', outline:'none', letterSpacing:'0.05em' }}
            />
          </div>

          {error && (
            <p style={{ fontSize:'0.78rem', color:'var(--danger)', background:'var(--danger-subtle)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:8, padding:'10px 14px', margin:0 }}>{error}</p>
          )}

          <button type="submit" disabled={loading}
            style={{ width:'100%', height:50, background:'linear-gradient(135deg,#10B981,#059669)', color:'#fff', border:'none', borderRadius:12, fontSize:'0.9rem', fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8, boxShadow:'0 4px 16px rgba(16,185,129,0.3)' }}>
            {loading
              ? <span style={{ width:20, height:20, border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'#fff', borderRadius:'50%', display:'inline-block', animation:'spin 0.7s linear infinite' }}/>
              : '🚀 Complete Setup'
            }
          </button>
        </form>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
                      }
