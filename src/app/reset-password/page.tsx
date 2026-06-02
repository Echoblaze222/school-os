'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { LockIcon, EyeIcon, EyeOffIcon } from '@/components/Icons'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [done,     setDone]     = useState(false)
  const [sessionReady, setSessionReady] = useState(false)
  const router   = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const saved = localStorage.getItem('schoolos_theme') ?? 'dark'
    document.documentElement.setAttribute('data-theme', saved)
  }, [])

  // Exchange the token from the URL hash for a valid session
  useEffect(() => {
    const hash = window.location.hash
    if (hash.includes('access_token')) {
      const params = new URLSearchParams(hash.replace('#', ''))
      const access_token  = params.get('access_token') ?? ''
      const refresh_token = params.get('refresh_token') ?? ''
      supabase.auth.setSession({ access_token, refresh_token }).then(({ error }) => {
        if (error) {
          setError('Invalid or expired reset link. Please request a new one.')
        } else {
          setSessionReady(true)
          // Clean the hash from the URL
          window.history.replaceState(null, '', window.location.pathname)
        }
      })
    } else {
      // Check if there's already an active session (e.g. user navigated back)
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) setSessionReady(true)
        else setError('Invalid or expired reset link. Please request a new one.')
      })
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!sessionReady) { setError('No active session. Please use the reset link from your email.'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    setLoading(true); setError('')
    const { error: err } = await supabase.auth.updateUser({ password })
    if (err) { setError(err.message); setLoading(false); return }
    setDone(true)
    setTimeout(() => router.push('/login'), 2500)
  }

  const card: React.CSSProperties = {
    width: '100%', maxWidth: 400,
    background: 'var(--bg-surface)',
    border: '1px solid var(--glass-border)',
    borderRadius: 24, padding: '40px 32px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
  }

  return (
    <div style={{ minHeight:'100dvh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg-base)', padding:20 }}>
      <div style={card}>
        {done ? (
          <div style={{ textAlign:'center', padding:'20px 0' }}>
            <div style={{ fontSize:'2.5rem', marginBottom:16 }}>✅</div>
            <h2 style={{ fontSize:'1.1rem', fontWeight:800, color:'var(--text-primary)', margin:'0 0 8px' }}>Password Updated!</h2>
            <p style={{ fontSize:'0.85rem', color:'var(--text-muted)', margin:0 }}>Redirecting to login...</p>
          </div>
        ) : (
          <>
            <h1 style={{ fontSize:'1.3rem', fontWeight:800, color:'var(--text-primary)', margin:'0 0 6px', letterSpacing:'-0.02em' }}>Reset Password</h1>
            <p style={{ fontSize:'0.82rem', color:'var(--text-muted)', margin:'0 0 28px' }}>Enter your new password below</p>
            <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:16 }}>
              {[
                { label:'New Password', val:password, set:setPassword },
                { label:'Confirm Password', val:confirm, set:setConfirm },
              ].map(({ label, val, set }) => (
                <div key={label}>
                  <label style={{ fontSize:'0.78rem', fontWeight:600, color:'var(--text-secondary)', display:'block', marginBottom:6 }}>{label}</label>
                  <div style={{ position:'relative' }}>
                    <span style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', pointerEvents:'none', display:'flex', alignItems:'center' }}>
                      <LockIcon size={15} color="var(--text-muted)" />
                    </span>
                    <input type={showPass ? 'text' : 'password'} value={val} onChange={e => set(e.target.value)} required
                      placeholder="••••••••"
                      style={{ width:'100%', height:48, padding:'0 44px 0 44px', background:'var(--input-bg)', border:'1px solid var(--input-border)', borderRadius:12, color:'var(--text-primary)', fontSize:'0.9rem', outline:'none' }}/>
                    <button type="button" onClick={() => setShowPass(!showPass)}
                      style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', display:'flex', alignItems:'center' }}>
                      {showPass ? <EyeOffIcon size={15}/> : <EyeIcon size={15}/>}
                    </button>
                  </div>
                </div>
              ))}
              {error && <p style={{ fontSize:'0.78rem', color:'var(--danger)', background:'var(--danger-subtle)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:8, padding:'10px 14px', margin:0 }}>{error}</p>}
              <button type="submit" disabled={loading || !sessionReady}
                style={{ height:50, background:'linear-gradient(135deg,var(--brand),var(--brand-dark))', color:'#fff', border:'none', borderRadius:12, fontWeight:700, fontSize:'0.9rem', cursor: (loading || !sessionReady) ? 'not-allowed' : 'pointer', opacity:(loading || !sessionReady) ? 0.5 : 1 }}>
                {loading ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
                       }
