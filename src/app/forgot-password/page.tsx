'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { MailIcon, ArrowLeftIcon } from '@/components/Icons'

export default function ForgotPasswordPage() {
  const [email,   setEmail]   = useState('')
  const [loading, setLoading] = useState(false)
  const [sent,    setSent]    = useState(false)
  const [error,   setError]   = useState('')
  const supabase = createClient()

  useEffect(() => {
    const saved = localStorage.getItem('schoolos_theme') ?? 'dark'
    document.documentElement.setAttribute('data-theme', saved)
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (err) { setError(err.message); setLoading(false); return }
    setSent(true); setLoading(false)
  }

  const card: React.CSSProperties = { width:'100%', maxWidth:400, background:'var(--bg-surface)', border:'1px solid var(--glass-border)', borderRadius:24, padding:'40px 32px', boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }

  return (
    <div style={{ minHeight:'100dvh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg-base)', padding:20 }}>
      <div style={card}>
        <a href="/login" style={{ display:'flex', alignItems:'center', gap:6, fontSize:'0.8rem', color:'var(--text-muted)', textDecoration:'none', marginBottom:24, fontWeight:600 }}>
          <ArrowLeftIcon size={14}/> Back to login
        </a>
        {sent ? (
          <div style={{ textAlign:'center', padding:'20px 0' }}>
            <div style={{ fontSize:'2.5rem', marginBottom:16 }}>📧</div>
            <h2 style={{ fontSize:'1.1rem', fontWeight:800, color:'var(--text-primary)', margin:'0 0 8px' }}>Check your email</h2>
            <p style={{ fontSize:'0.85rem', color:'var(--text-muted)', margin:0, lineHeight:1.6 }}>
              We sent a password reset link to <strong style={{ color:'var(--text-primary)' }}>{email}</strong>. Check your inbox and spam folder.
            </p>
          </div>
        ) : (
          <>
            <h1 style={{ fontSize:'1.3rem', fontWeight:800, color:'var(--text-primary)', margin:'0 0 6px', letterSpacing:'-0.02em' }}>Forgot Password</h1>
            <p style={{ fontSize:'0.82rem', color:'var(--text-muted)', margin:'0 0 28px' }}>Enter your email and we'll send a reset link</p>
            <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:16 }}>
              <div style={{ position:'relative' }}>
                // ✅ After — style on a wrapper span
<span style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', pointerEvents:'none', display:'flex', alignItems:'center' }}>
  <MailIcon size={16} color="var(--text-muted)" />
</span>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                  placeholder="your@email.com"
                  style={{ width:'100%', height:48, padding:'0 14px 0 44px', background:'var(--input-bg)', border:'1px solid var(--input-border)', borderRadius:12, color:'var(--text-primary)', fontSize:'0.9rem', outline:'none' }}/>
              </div>
              {error && <p style={{ fontSize:'0.78rem', color:'var(--danger)', background:'var(--danger-subtle)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:8, padding:'10px 14px', margin:0 }}>{error}</p>}
              <button type="submit" disabled={loading || !email}
                style={{ height:50, background:'linear-gradient(135deg,var(--brand),var(--brand-dark))', color:'#fff', border:'none', borderRadius:12, fontWeight:700, fontSize:'0.9rem', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', opacity: loading || !email ? 0.5 : 1 }}>
                {loading ? '...' : 'Send Reset Link'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
