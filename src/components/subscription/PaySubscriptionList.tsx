'use client'

// src/components/subscription/PaySubscriptionList.tsx
//
// Shared by the student's own subscribe page and the parent's subscription
// page. Starts the per-student Paystack payment; the amount shown is
// informational only, the server recomputes the real price.

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import PaidBadge from './PaidBadge'
import styles from './subscription.module.css'

export interface PayItem {
  studentId: string
  name: string
  className?: string | null
  paid: boolean
  termName: string | null
  graceEndsOn: string | null
  amount: number
  tierLabel: string
}

interface Props {
  items: PayItem[]
  selfMode?: boolean // true on the student's own page
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-NG', { day: '2-digit', month: 'long', year: 'numeric' })
}

export default function PaySubscriptionList({ items, selfMode = false }: Props) {
  const params = useSearchParams()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    const status = params.get('status')
    if (status === 'success') setToast('Payment successful. The subscription is now active.')
    else if (status === 'failed') setError('Payment was not completed. Please try again.')
  }, [params])

  async function pay(studentId: string) {
    setBusyId(studentId)
    setError(null)
    try {
      const res = await fetch('/api/student-subscription/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Could not start payment. Please try again.')
        setBusyId(null)
        return
      }
      window.location.href = data.paymentUrl
    } catch {
      setError('Something went wrong. Please try again.')
      setBusyId(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {toast && (
        <p className={styles.success}>{toast}</p>
      )}
      {error && (
        <p role="alert" className={styles.error}>{error}</p>
      )}

      {items.length === 0 && (
        <p style={{ opacity: 0.7, fontSize: '0.9rem' }}>
          {selfMode ? 'No subscription details found.' : 'No linked students found on your account.'}
        </p>
      )}

      {items.map(it => (
        <div key={it.studentId} className={styles.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <div>
              <p style={{ margin: 0, fontWeight: 700 }}>{selfMode ? 'Your subscription' : it.name}</p>
              {it.className && <p style={{ margin: 0, fontSize: '0.78rem', opacity: 0.65 }}>{it.className}</p>}
            </div>
            <PaidBadge paid={it.paid} />
          </div>

          {it.termName ? (
            <p style={{ margin: 0, fontSize: '0.85rem', opacity: 0.8 }}>
              {it.termName}
              {!it.paid && it.graceEndsOn && ` · pay by ${fmtDate(it.graceEndsOn)}`}
            </p>
          ) : (
            <p style={{ margin: 0, fontSize: '0.85rem', opacity: 0.8 }}>
              Nothing is due right now.
            </p>
          )}

          {!it.paid && it.termName && (
            <button
              onClick={() => pay(it.studentId)}
              disabled={busyId !== null}
              className={styles.btn}
              aria-busy={busyId === it.studentId}
            >
              {busyId === it.studentId
                ? <><span className={styles.spinner} aria-hidden="true" />Opening Paystack</>
                : `Pay ₦${it.amount.toLocaleString()}`}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
