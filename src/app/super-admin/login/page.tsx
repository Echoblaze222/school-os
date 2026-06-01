'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ShieldIcon, LockIcon, EyeIcon, EyeOffIcon } from '@/components/Icons'
import styles from './super-admin-login.module.css'

export default function SuperAdminLoginPage() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [pin,      setPin]      = useState('')
  const [showPass, setShowPass] = useState(false)
  const [step,     setStep]     = useState<'credentials' | 'pin'>('credentials')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const router   = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const saved = localStorage.getItem('schoolos_theme') ?? 'dark'
    document.documentElement.setAttribute('data-theme', saved)
  }, [])

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) { setError('Invalid credentials.'); setLoading(false); return }

    // Check if super admin
    const { data: sa } = await supabase.from('super_admins')
      .select('id').eq('id', (await supabase.auth.getUser()).data.user?.id ?? '').single()
    if (!sa) {
      await supabase.auth.signOut()
      setError('Access denied. This portal is restricted.')
      setLoading(false); return
    }
    setStep('pin')
    setLoading(false)
  }

  async function handlePin(e: React.FormEvent) {
    e.preventDefault()
    if (pin.length !== 6) { setError('PIN must be 6 digits'); return }
    setLoading(true); setError('')

    const res = await fetch('/api/super-admin/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    })
    const data = await res.json()
    if (!data.ok) { setError('Incorrect PIN. Try again.'); setLoading(false); return }

    router.push('/super-admin')
    router.refresh()
  }

  return (
    <div className={styles.page}>
      <div className={styles.bgOrb1} /><div className={styles.bgOrb2} />

      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.shieldIcon}>
            <ShieldIcon size={28} color="white" />
          </div>
          <h1 className={styles.title}>Super Admin</h1>
          <p className={styles.sub}>SchoolOS Control Centre</p>
        </div>

        <div className={styles.securityNote}>
          🔒 This portal is for authorized personnel only. Unauthorized access is prohibited.
        </div>

        {step === 'credentials' && (
          <form onSubmit={handleCredentials} className={styles.form}>
            <div className={styles.fieldGroup}>
              <label className={styles.label}>Email Address</label>
              <input className={styles.input} type="email" value={email}
                onChange={e => setEmail(e.target.value)} placeholder="admin@schoolos.ng" autoFocus required />
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.label}>Password</label>
              <div className={styles.inputWrap}>
                <input className={styles.input} type={showPass ? 'text' : 'password'}
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" required />
                <button type="button" className={styles.eyeBtn} onClick={() => setShowPass(!showPass)}>
                  {showPass ? <EyeOffIcon size={15} /> : <EyeIcon size={15} />}
                </button>
              </div>
            </div>

            {error && <p className={styles.error}>{error}</p>}

            <button type="submit" className={styles.submitBtn} disabled={loading}>
              {loading ? <span className={styles.spinner} /> : 'Continue →'}
            </button>
          </form>
        )}

        {step === 'pin' && (
          <form onSubmit={handlePin} className={styles.form}>
            <p className={styles.pinInstruction}>
              Enter your 6-digit super admin PIN to complete login.
            </p>

            <div className={styles.fieldGroup}>
              <label className={styles.label}>6-Digit PIN</label>
              <input
                className={`${styles.input} ${styles.pinInput}`}
                type="password"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g,''))}
                placeholder="● ● ● ● ● ●"
                autoFocus
              />
            </div>

            {error && <p className={styles.error}>{error}</p>}

            <button type="submit" className={styles.submitBtn} disabled={loading || pin.length !== 6}>
              {loading ? <span className={styles.spinner} /> : 'Access Dashboard'}
            </button>

            <button type="button" className={styles.backBtn}
              onClick={() => { setStep('credentials'); setPin(''); setError('') }}>
              ← Back
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
