'use client'
// src/app/join/JoinClient.tsx
// Public platform (Phase 4, Lane C) - §58 self-service SchoolOS identity.
// Distinct from /login: this page never asks for a school access code.
// It exists so a visitor who wants to send an admission request can get
// an identity first, then apply - instead of being blocked entirely.

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { MailIcon, LockIcon, EyeIcon, EyeOffIcon, ArrowRightIcon } from '@/components/Icons'
import styles from './join.module.css'

export default function JoinClient() {
  const router = useRouter()
  const params = useSearchParams()
  const next = params.get('next') || '/dashboard/applications'
  const supabase = createClient()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'parent' | 'student'>('parent')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/self-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, email, password, role }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data?.error || "Couldn't create your account. Please try again.")
        setLoading(false)
        return
      }

      // Account created server-side; sign in immediately so the applicant
      // doesn't hit a second manual login step right after registering.
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) {
        // Account exists, but auto-sign-in failed (e.g. a stale session
        // race) - send them to sign in manually rather than leaving them
        // stuck on a spinner with no explanation.
        router.push(`/login?next=${encodeURIComponent(next)}`)
        return
      }

      router.push(next)
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.")
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Create your SchoolOS account</h1>
        <p className={styles.subtitle}>
          No access code needed - this gets you an identity you can use to apply to any participating school.
        </p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.roleToggle}>
            <button
              type="button"
              className={role === 'parent' ? styles.roleActive : styles.roleBtn}
              onClick={() => setRole('parent')}
            >
              I'm a parent/guardian
            </button>
            <button
              type="button"
              className={role === 'student' ? styles.roleActive : styles.roleBtn}
              onClick={() => setRole('student')}
            >
              I'm applying for myself
            </button>
          </div>

          <label className={styles.field}>
            <span className={styles.label}>Full name</span>
            <input
              className={styles.input}
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="Full name"
              required
              maxLength={200}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Email</span>
            <div className={styles.inputWithIcon}>
              <MailIcon size={16} color="var(--text-muted)" />
              <input
                className={styles.inputBare}
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Password</span>
            <div className={styles.inputWithIcon}>
              <LockIcon size={16} color="var(--text-muted)" />
              <input
                className={styles.inputBare}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                required
                minLength={8}
              />
              <button type="button" className={styles.eyeBtn} onClick={() => setShowPassword(s => !s)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                {showPassword ? <EyeOffIcon size={16} color="var(--text-muted)" /> : <EyeIcon size={16} color="var(--text-muted)" />}
              </button>
            </div>
          </label>

          {error && <p className={styles.error}>{error}</p>}

          <button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading ? 'Creating account…' : 'Create account'}
            {!loading && <ArrowRightIcon size={16} color="currentColor" />}
          </button>
        </form>

        <p className={styles.footer}>
          Already have a SchoolOS account? <Link href={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link>
        </p>
        <p className={styles.footerMuted}>
          Staff, student, or parent at a school already? Use the access code your school gave you on the <Link href="/login">sign-in page</Link> instead.
        </p>
      </div>
    </div>
  )
}
