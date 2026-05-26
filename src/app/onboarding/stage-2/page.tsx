'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ShieldIcon, EyeIcon, EyeOffIcon } from '@/components/Icons'
import styles from './stage2.module.css'

export default function OnboardingStage2() {
  const [pin,      setPin]      = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [secret,   setSecret]   = useState('')
  const [showPin,  setShowPin]  = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const router   = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const saved = localStorage.getItem('schoolos_theme') ?? 'dark'
    document.documentElement.setAttribute('data-theme', saved)
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (pin.length !== 6)        { setError('PIN must be exactly 6 digits'); return }
    if (pin !== confirm)         { setError('PINs do not match'); return }
    if (secret.trim().length < 3){ setError('Secret identifier must be at least 3 characters'); return }
    setLoading(true); setError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    await supabase.from('profiles').update({
      pin_hash:         pin,  // hash server-side in production
      secret_identifier: secret.trim().toLowerCase(),
      onboarding_stage: 3,
    }).eq('id', user.id)
    router.push('/onboarding/stage-3')
  }

  return (
    <div className={styles.page}>
      <div className={styles.bgOrb1}/><div className={styles.bgOrb2}/>
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.icon}><ShieldIcon size={26} color="white"/></div>
          <h1 className={styles.title}>Secure Your Account</h1>
          <p className={styles.sub}>Step 2 of 3 — Set up your PIN and secret identifier</p>
        </div>
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>6-Digit PIN</label>
            <p className={styles.hint}>Used for quick login and identity verification</p>
            <div className={styles.pinRow}>
              {[0,1,2,3,4,5].map(i => (
                <input key={i} id={`pin-${i}`} type={showPin ? 'text' : 'password'}
                  inputMode="numeric" maxLength={1}
                  className={styles.pinBox}
                  value={pin[i] ?? ''}
                  onChange={e => {
                    const val = e.target.value.replace(/\D/,'')
                    const arr = pin.split('')
                    arr[i] = val
                    setPin(arr.join('').slice(0,6))
                    if (val && i < 5) document.getElementById(`pin-${i+1}`)?.focus()
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Backspace' && !pin[i] && i > 0) document.getElementById(`pin-${i-1}`)?.focus()
                  }}/>
              ))}
              <button type="button" className={styles.eyeBtn} onClick={() => setShowPin(!showPin)}>
                {showPin ? <EyeOffIcon size={15}/> : <EyeIcon size={15}/>}
              </button>
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Confirm PIN</label>
            <input className={styles.input} type="password" inputMode="numeric"
              maxLength={6} value={confirm}
              onChange={e => setConfirm(e.target.value.replace(/\D/,''))}
              placeholder="Re-enter 6-digit PIN"/>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Secret Identifier</label>
            <p className={styles.hint}>A word only you know — used for password recovery (e.g. your mother's maiden name)</p>
            <input className={styles.input} type="text" value={secret}
              onChange={e => setSecret(e.target.value)}
              placeholder="e.g. Sunshine, Mango, etc." autoComplete="off"/>
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <button type="submit" className={styles.btn} disabled={loading}>
            {loading ? <span className={styles.spinner}/> : 'Continue →'}
          </button>
        </form>
      </div>
    </div>
  )
}
