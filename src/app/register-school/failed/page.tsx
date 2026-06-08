'use client'
// src/app/register-school/failed/page.tsx
// Shown when Paystack payment fails or is cancelled.
// The callback route redirects here on any verification failure.

import { useRouter } from 'next/navigation'
import styles from '../success/success.module.css'

export default function RegistrationFailedPage() {
  const router = useRouter()

  return (
    <div className={styles.page}>
      <div className={styles.card}>

        <div className={styles.successIcon}>⚠️</div>

        <h1 className={styles.title}>Payment Not Completed</h1>

        <p className={styles.subtitle}>
          Your payment could not be verified or was not completed.
          Your school registration has been saved — you can try paying again.
        </p>

        <div className={styles.nextSteps}>
          <h3>What you can do:</h3>
          <ol>
            <li>Click below to try registering again with the same details</li>
            <li>Make sure your card has sufficient funds</li>
            <li>If you were charged but see this page, contact us immediately</li>
          </ol>
        </div>

        <p style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center' }}>
          Need help? Email{' '}
          <a href="mailto:support@schoolos.ng" style={{ color: 'var(--accent)' }}>
            support@schoolos.ng
          </a>
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
          <button
            className="btn btn-primary"
            onClick={() => router.push('/register-school')}
            style={{ width: '100%' }}
          >
            Try Again →
          </button>
          <button
            className="btn"
            onClick={() => router.push('/select-school')}
            style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            Back to School Search
          </button>
        </div>

      </div>
    </div>
  )
}
