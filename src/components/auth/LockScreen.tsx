'use client'
// src/components/auth/LockScreen.tsx
// Shown by dashboard/layout.tsx when useAutoLock reports locked=true.
// The Supabase session is still fully valid the whole time this is up -
// this only confirms it's still the same person, it never signs anyone
// out on its own (see the "Sign out instead" escape hatch for the one
// deliberate exception).

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { signOutFlow } from '@/lib/signOutFlow'
import { useRouter } from 'next/navigation'
import { LockIcon } from '@/components/Icons'
import { getStoredSchoolBrand, shadeHex } from '@/lib/schoolBrand'
import styles from './LockScreen.module.css'

const MAX_ATTEMPTS = 5

export default function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [email,     setEmail]     = useState<string | null>(null)
  const [name,      setName]      = useState<string | null>(null)
  const [password,  setPassword]  = useState('')
  const [error,     setError]     = useState('')
  const [verifying, setVerifying] = useState(false)
  const [attempts,  setAttempts]  = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()
  const router = useRouter()

  // Was previously missing entirely - this whole screen was hardcoded to
  // a fixed violet (#7C3AED) regardless of which school's account was
  // locked. Same localStorage source /school-locked now uses (see
  // schoolBrand.ts) - synchronous, no extra query, no loading flash.
  const [brand] = useState(() => getStoredSchoolBrand())
  const accent = brand.primaryColor || null
  const overlayStyle = accent
    ? ({ '--lock-accent-a': accent, '--lock-accent-b': shadeHex(accent, 0.6) } as React.CSSProperties)
    : undefined

  useEffect(() => {
    inputRef.current?.focus()
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null)
      const full = (data.user?.user_metadata as Record<string, unknown> | undefined)?.full_name
      if (full) setName(String(full).split(' ')[0])
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault()
    if (!email || verifying) return
    setVerifying(true)
    setError('')

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })

    if (signInError) {
      const nextAttempts = attempts + 1
      setAttempts(nextAttempts)
      setPassword('')
      setVerifying(false)
      if (nextAttempts >= MAX_ATTEMPTS) {
        await signOutFlow(supabase, router, 'timeout')
        return
      }
      setError(`Wrong password. ${MAX_ATTEMPTS - nextAttempts} attempt${MAX_ATTEMPTS - nextAttempts === 1 ? '' : 's'} left.`)
      return
    }

    setVerifying(false)
    onUnlock()
  }

  async function handleSignOutInstead() {
    await signOutFlow(supabase, router, undefined)
  }

  return (
    <div className={styles.overlay} style={overlayStyle}>
      <div className={styles.card}>
        <div className={styles.iconWrap}><LockIcon size={26} color="white" /></div>
        <h1 className={styles.title}>{name ? `Welcome back, ${name}` : 'Locked'}</h1>
        <p className={styles.sub}>You&apos;ve been away a while. Enter your password to continue.</p>

        <form onSubmit={handleUnlock} className={styles.form}>
          <input
            ref={inputRef}
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password"
            className={styles.input}
            autoComplete="current-password"
            disabled={verifying}
          />
          {error && <p className={styles.error}>{error}</p>}
          <button type="submit" className={styles.unlockBtn} disabled={verifying || !password}>
            {verifying ? 'Checking…' : 'Unlock'}
          </button>
        </form>

        <button className={styles.signOutLink} onClick={handleSignOutInstead}>
          Not you? Sign out
        </button>
      </div>
    </div>
  )
}
