'use client'
// src/app/reset-password/page.tsx
// Handles the Supabase password reset link redirect

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import styles from './reset-password.module.css'

type Stage = 'form' | 'success' | 'invalid'

export default function ResetPasswordPage() {
  const router = useRouter()
  const supabase = createClient()
  const [mounted, setMounted] = useState(false)
  const [stage, setStage] = useState<Stage>('form')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setMounted(true)
    // Supabase injects the session from the magic link on page load
    // Check the URL hash for access_token
    const hash = window.location.hash
    if (!hash.includes('access_token') && !hash.includes('type=recovery')) {
      // Check if session exists (user came via email link)
      supabase.auth.getSession().then(({ data }) => {
        if (!data.session) setStage('invalid')
      })
    }
  }, [])

  function getStrength(pw: string) {
    let s = 0
    if (pw.length >= 8) s++
    if (/[A-Z]/.test(pw)) s++
    if (/[0-9]/.test(pw)) s++
    if (/[^A-Za-z0-9]/.test(pw)) s++
    return s
  }

  const strength = getStrength(password)
  const strengthLabels = ['', 'Weak', 'Fair', 'Good', 'Strong']
  const strengthColors = ['', '#ef4444', '#f97316', '#eab308', '#22c55e']

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) {
        setError(error.message)
        return
      }
      setStage('success')
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
        {/* Logo */}
        <div className={styles.logoWrap}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/logo.png" alt="SchoolOS" className={styles.logo} />
        </div>

        {stage === 'invalid' && (
          <div className={styles.invalidState}>
            <div className={styles.invalidIcon}>⚠️</div>
            <h2 className={styles.title}>Link Expired</h2>
            <p className={styles.subtitle}>
              This reset link is no longer valid. Please request a new one.
            </p>
            <button className={styles.submitBtn} onClick={() => router.push('/forgot-password')}>
              Request New Link
            </button>
          </div>
        )}

        {stage === 'form' && (
          <>
            <div className={styles.header}>
              <div className={styles.iconBox}>🛡️</div>
              <h1 className={styles.title}>Set New Password</h1>
              <p className={styles.subtitle}>Choose a strong password for your account</p>
            </div>

            {error && <div className={styles.errorBanner}>{error}</div>}

            <form onSubmit={handleSubmit} className={styles.form}>
              <label className={styles.label}>New Password</label>
              <div className={styles.passWrap}>
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className={styles.input}
                  placeholder="Min. 8 characters"
                  required
                  autoFocus
                />
                <button
                  type="button"
                  className={styles.eyeBtn}
                  onClick={() => setShowPass(!showPass)}
                  tabIndex={-1}
                >
                  {showPass ? '🙈' : '👁️'}
                </button>
              </div>

              {/* Strength meter */}
              {password && (
                <div className={styles.strengthWrap}>
                  <div className={styles.strengthBars}>
                    {[1,2,3,4].map(i => (
                      <div
                        key={i}
                        className={styles.strengthBar}
                        style={{
                          background: strength >= i ? strengthColors[strength] : 'rgba(255,255,255,0.1)',
                          transition: 'background 0.3s',
                        }}
                      />
                    ))}
                  </div>
                  <span
                    className={styles.strengthLabel}
                    style={{ color: strengthColors[strength] }}
                  >
                    {strengthLabels[strength]}
                  </span>
                </div>
              )}

              {/* Password requirements */}
              <div className={styles.requirements}>
                {[
                  { label: '8+ characters', met: password.length >= 8 },
                  { label: 'Uppercase letter', met: /[A-Z]/.test(password) },
                  { label: 'Number', met: /[0-9]/.test(password) },
                  { label: 'Special character', met: /[^A-Za-z0-9]/.test(password) },
                ].map(req => (
                  <div key={req.label} className={`${styles.req} ${req.met ? styles.reqMet : ''}`}>
                    {req.met ? '✓' : '○'} {req.label}
                  </div>
                ))}
              </div>

              <label className={styles.label}>Confirm Password</label>
              <div className={styles.passWrap}>
                <input
                  type={showPass ? 'text' : 'password'}
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  className={`${styles.input} ${confirm && confirm !== password ? styles.inputError : ''}`}
                  placeholder="Re-enter password"
                  required
                />
              </div>

              {confirm && confirm !== password && (
                <p className={styles.matchError}>Passwords do not match</p>
              )}

              <button
                type="submit"
                className={styles.submitBtn}
                disabled={loading || strength < 2 || password !== confirm}
              >
                {loading
                  ? <span className={styles.spinner} />
                  : '🔒 Reset Password'
                }
              </button>
            </form>
          </>
        )}

        {stage === 'success' && (
          <div className={styles.successState}>
            <div className={styles.successRing}>
              <div className={styles.successCheck}>✓</div>
            </div>
            <h2 className={styles.title}>Password Updated!</h2>
            <p className={styles.subtitle}>
              Your password has been reset successfully. You can now sign in with your new password.
            </p>
            <button className={styles.submitBtn} onClick={() => router.push('/login')}>
              Sign In Now
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
