'use client'
// src/components/auth/LockScreen.tsx
// Shown by dashboard/layout.tsx when useAutoLock reports locked=true.
// The Supabase session is still fully valid the whole time this is up -
// this only confirms it's still the same person, it never signs anyone
// out on its own (see the "Sign out instead" escape hatch for the one
// deliberate exception).
//
// OFFLINE FIX: unlocking checks the password with the server. Before this,
// with no connection (a) the account lookup was a network call, so email stayed
// null and Unlock silently did nothing, and (b) had it got that far, a lost
// connection was counted as a WRONG PASSWORD - five of those signed the person
// out. A network failure is now reported as "no connection" and never counts
// against the five attempts. (Unlocking with no connection at all is a separate
// decision - see docs/offline/PHASE3_DESIGN.md.)

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { signOutFlow } from '@/lib/signOutFlow'
import { isNetworkFailure } from '@/lib/offline/classify'
import { useRouter } from 'next/navigation'
import { LockIcon } from '@/components/Icons'
import { getStoredSchoolBrand, shadeHex } from '@/lib/schoolBrand'
import styles from './LockScreen.module.css'

const MAX_ATTEMPTS = 5

const NO_CONNECTION = 'No connection. Connect to the internet to unlock, or sign out.'

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

  // Who is locked? getSession() first: it reads the session the browser already
  // holds, so it needs no network and the unlock form is usable at once. Only if
  // that has nothing do we ask the server with getUser().
  async function loadIdentity() {
    let user: { email?: string | null; user_metadata?: Record<string, unknown> } | null = null
    try {
      const { data } = await supabase.auth.getSession()
      user = data.session?.user ?? null
    } catch {
      // fall through to getUser
    }
    if (!user) {
      try {
        const { data } = await supabase.auth.getUser()
        user = data.user
      } catch {
        // still nothing: handled when the person taps Unlock
      }
    }
    if (!user) return false
    setEmail(user.email ?? null)
    const full = user.user_metadata?.full_name
    if (full) setName(String(full).split(' ')[0])
    return !!user.email
  }

  useEffect(() => {
    inputRef.current?.focus()
    void loadIdentity()
    // When the connection comes back, try again so Unlock starts working.
    const onOnline = () => { void loadIdentity() }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault()
    if (verifying) return
    if (!email) {
      // Never fail silently: say why nothing happened, and retry the lookup.
      setError(NO_CONNECTION)
      void loadIdentity()
      return
    }
    setVerifying(true)
    setError('')

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })

    if (signInError) {
      setVerifying(false)
      // The request never reached the server: that is not a wrong password, so
      // it must not count against the attempts (five would sign the person out).
      if (isNetworkFailure(signInError.message, signInError.status)) {
        setError(NO_CONNECTION)
        return
      }
      const nextAttempts = attempts + 1
      setAttempts(nextAttempts)
      setPassword('')
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
