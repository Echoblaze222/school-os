'use client'
// src/app/register-school/pending/page.tsx
// Shown when Paystack is not configured and registration completes without payment.
// Also serves as a fallback landing after any registration where payment URL is unavailable.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import styles from '../success/success.module.css'

export default function RegistrationPendingPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [schoolName, setSchoolName] = useState('')
  const [email,      setEmail]      = useState('')

  useEffect(() => {
    async function loadInfo() {
      // Best-effort: pull the most recently created school for display
      const { data } = await supabase
        .from('schools')
        .select('name, email')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (data) {
        setSchoolName(data.name ?? '')
        setEmail(data.email ?? '')
      }
    }
    loadInfo()
  }, [])

  return (
    <div className={styles.page}>
      <div className={styles.card}>

        <div className={styles.successIcon}>📋</div>

        <h1 className={styles.title}>Registration Received!</h1>

        <p className={styles.subtitle}>
          {schoolName
            ? `${schoolName} has been registered on SchoolOS.`
            : 'Your school has been registered on SchoolOS.'}
        </p>

        <div className={styles.nextSteps}>
          <h3>What happens next:</h3>
          <ol>
            <li>Our team will review your registration within 24 hours</li>
            <li>
              {email
                ? `A confirmation and payment link will be sent to ${email}`
                : 'A confirmation email will be sent to your registered email address'}
            </li>
            <li>Once payment is confirmed, your portal will be activated</li>
            <li>You will receive your principal access code by email</li>
          </ol>
        </div>

        <p style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', marginBottom: '1.5rem' }}>
          If you do not receive an email within 24 hours, please contact{' '}
          <a href="mailto:support@schoolos.ng" style={{ color: 'var(--accent)' }}>
            support@schoolos.ng
          </a>
        </p>

        <button
          className="btn btn-primary"
          onClick={() => router.push('/select-school')}
          style={{ width: '100%' }}
        >
          Back to School Search →
        </button>

      </div>
    </div>
  )
}
