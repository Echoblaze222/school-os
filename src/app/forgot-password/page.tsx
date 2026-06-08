'use client'
// src/app/forgot-password/page.tsx

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import styles from './forgot-password.module.css'

type Stage = 'input' | 'sent'

export default function ForgotPasswordPage() {
  const router = useRouter()
  const supabase = createClient()
  const [mounted, setMounted] = useState(false)
  const [stage, setStage] = useState<Stage>('input')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { setMounted(true) }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (error) {
        setError(error.message)
        return
      }
      setStage('sent')
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.bgGlow} />

      <div className={`${styles.card} ${mounted ? styles.visible : ''}`}>
        {/* Back */}
        <button className={styles.backBtn} onClick={() => router.push('/login')}>
          ← Back to Sign In
        </button>

        {/* Logo */}
        <div className={styles.logoWrap}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/logo.png" alt="SchoolOS" className={styles.logo} />
        </div>

        {stage === 'input' ? (
          <>
            <div className={styles.header}>
              <div className={styles.iconBox}>🔐</div>
              <h1 className={styles.title}>Forgot Password?</h1>
              <p className={styles.subtitle}>
                Enter your email and we'll send you a secure reset link
              </p>
            </div>

            {error && <div className={styles.errorBanner}>{error}</div>}

            <form onSubmit={handleSubmit} className={styles.form}>
              <label className={styles.label}>Email Address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className={styles.input}
                placeholder="you@school.edu.ng"
                required
                autoFocus
              />

              <button type="submit" className={styles.submitBtn} disabled={loading}>
                {loading
                  ? <span className={styles.spinner} />
                  : '📨 Send Reset Link'
                }
              </button>
            </form>
          </>
        ) : (
          <div className={styles.sentState}>
            {/* Animated envelope */}
            <div className={styles.envelopeWrap}>
              <div className={styles.envelope}>
                <div className={styles.envelopeFlap} />
                <div className={styles.envelopeLetter}>✉️</div>
              </div>
              <div className={styles.sparkle1}>✦</div>
              <div className={styles.sparkle2}>✦</div>
              <div className={styles.sparkle3}>✦</div>
            </div>

            <h2 className={styles.sentTitle}>Check Your Inbox</h2>
            <p className={styles.sentMsg}>
              We sent a password reset link to
            </p>
            <div className={styles.emailPill}>{email}</div>
            <p className={styles.sentNote}>
              The link expires in 60 minutes. Check your spam folder if you don't see it.
            </p>

            <button className={styles.submitBtn} onClick={() => setStage('input')}>
              Try a Different Email
            </button>

            <button className={styles.linkBtn} onClick={() => router.push('/login')}>
              Back to Sign In
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
