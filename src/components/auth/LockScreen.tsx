'use client'
// src/components/auth/LockScreen.tsx
// Shown by dashboard/layout.tsx (and by offline twin pages) when useAutoLock
// reports locked=true. The Supabase session is still fully valid the whole time
// this is up - this only confirms it's still the same person, it never signs
// anyone out on its own (see the "Sign out instead" escape hatch for the one
// deliberate exception).
//
// OFFLINE: unlocking normally checks the password with the server.
//  - Identity comes from the local session (no network), so the form works at once.
//  - A lost connection is NEVER counted as a wrong password (five wrong passwords
//    sign the person out).
//  - In the Android app only, with no connection, the password is checked against
//    the slow hash saved on the phone at the last online sign-in/unlock
//    (src/lib/offline/unlockVerifier.ts): 5 tries, then it is wiped and the person
//    is signed out. Browsers always need a connection to unlock.

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { signOutFlow } from '@/lib/signOutFlow'
import { isNetworkFailure } from '@/lib/offline/classify'
import { readLastKnownUserId } from '@/lib/offline/identity'
import { offlineUnlockSupported, rememberLogin, verifyOfflinePassword } from '@/lib/offline/offlineUnlock'
import { useRouter } from 'next/navigation'
import { LockIcon } from '@/components/Icons'
import { getStoredSchoolBrand, shadeHex } from '@/lib/schoolBrand'
import styles from './LockScreen.module.css'

const MAX_ATTEMPTS = 5
const SIGN_IN_TIMEOUT_MS = 10_000

const NO_CONNECTION = 'No connection. Connect to the internet to unlock, or sign out.'

export default function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [email,     setEmail]     = useState<string | null>(null)
  const [userId,    setUserId]    = useState<string | null>(null)
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
  // holds, so it needs no network. Only if that has nothing do we ask the server
  // with getUser().
  async function loadIdentity() {
    let user: { id?: string; email?: string | null; user_metadata?: Record<string, unknown> } | null = null
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
    setUserId(user.id ?? null)
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

  // Android app, no connection: check against the verifier saved on the phone.
  // Returns true when it dealt with the attempt (unlocked, or showed a message).
  async function tryOfflineUnlock(): Promise<boolean> {
    if (!offlineUnlockSupported()) return false
    const id = userId ?? readLastKnownUserId()
    if (!id) return false
    const out = await verifyOfflinePassword(id, password)
    if (out.result === 'ok') {
      setVerifying(false)
      onUnlock()
      return true
    }
    if (out.result === 'wrong') {
      setPassword('')
      setVerifying(false)
      setError(`Wrong password. ${out.attemptsLeft} attempt${out.attemptsLeft === 1 ? '' : 's'} left.`)
      return true
    }
    if (out.result === 'locked-out') {
      await signOutFlow(supabase, router, 'timeout')
      return true
    }
    return false // unavailable: nothing saved on this phone yet
  }

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault()
    if (verifying) return
    setVerifying(true)
    setError('')

    // Try the server first when we think we are online and know the account.
    // A request that hangs counts as no connection after SIGN_IN_TIMEOUT_MS.
    const looksOnline = typeof navigator === 'undefined' || navigator.onLine !== false
    if (looksOnline && email) {
      const result = await Promise.race([
        supabase.auth.signInWithPassword({ email, password }),
        new Promise<{ data: null; error: { message: string; status: number } }>((resolve) =>
          setTimeout(() => resolve({ data: null, error: { message: 'Failed to fetch', status: 0 } }), SIGN_IN_TIMEOUT_MS)
        ),
      ])

      if (!result.error) {
        const confirmedId = result.data?.user?.id ?? userId
        // Password confirmed online: refresh what the phone remembers for offline.
        if (confirmedId) await rememberLogin(confirmedId, password)
        setVerifying(false)
        onUnlock()
        return
      }

      // A real answer from the server: this is a wrong password.
      if (!isNetworkFailure(result.error.message, result.error.status)) {
        setVerifying(false)
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
      // Otherwise the request never reached the server: fall through to offline.
    }

    if (await tryOfflineUnlock()) return

    // Nothing could verify the password: say why, keep what was typed, and retry
    // the account lookup. This never counts as a wrong password.
    setVerifying(false)
    setError(NO_CONNECTION)
    void loadIdentity()
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
