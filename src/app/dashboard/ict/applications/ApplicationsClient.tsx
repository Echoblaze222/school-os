'use client'
// src/app/dashboard/ict/applications/ApplicationsClient.tsx
//
// Generate Code is deliberately a separate explicit click from Verify,
// never auto-chained, creating a real login is irreversible-feeling
// enough (and email-visible enough to the applicant) that it shouldn't
// happen as a side effect of anything else. Double-click protection:
// the button disables itself the instant it's clicked and the
// application's status flips away from "verified" in local state
// immediately on success, so a second click has nothing to act on.

import { useState } from 'react'
import Link from 'next/link'
import styles from './applications.module.css'

const STATUS_COLOR: Record<string, string> = {
  pending: '#E0A94E', under_review: '#E0A94E', verified: '#3FA66B',
  code_generated: '#4A90D9', rejected: '#D64545',
}
const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending', under_review: 'Under Review', verified: 'Verified',
  code_generated: 'Code Generated', rejected: 'Rejected',
}

interface Application {
  id: string; full_name: string; email: string; phone: string | null
  role_applied_for: string; verification_method: string; status: string
  submitted_at: string; rejection_reason: string | null
  appointment_types?: { label?: string }
}

export default function ApplicationsClient({
  initialApplications, schoolColor,
}: { initialApplications: Application[]; schoolColor: string; canReject: boolean }) {
  const [applications, setApplications] = useState(initialApplications)
  const [filter, setFilter] = useState<'pending' | 'all'>('pending')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [errorId, setErrorId] = useState<string | null>(null)
  const [generatedCode, setGeneratedCode] = useState<Record<string, string>>({})

  const filtered = filter === 'pending'
    ? applications.filter(a => ['pending', 'under_review'].includes(a.status))
    : applications

  async function verify(id: string, decision: 'verified' | 'rejected') {
    let rejectionReason: string | undefined
    if (decision === 'rejected') {
      rejectionReason = window.prompt('Reason for rejecting this application?') ?? undefined
      if (!rejectionReason) return
    }
    setBusyId(id); setErrorId(null)
    try {
      const res = await fetch(`/api/ict/applications/${id}/verify`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, rejectionReason }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setApplications(prev => prev.map(a => a.id === id ? { ...a, status: decision, rejection_reason: rejectionReason ?? null } : a))
    } catch {
      setErrorId(id)
    } finally {
      setBusyId(null)
    }
  }

  async function generateCode(id: string) {
    setBusyId(id); setErrorId(null)
    // Optimistically move it out of "verified" immediately so a second
    // click (double-tap, impatient re-tap) has no verified application
    // left to act on, real double-submit protection, not just a
    // disabled attribute racing the network.
    setApplications(prev => prev.map(a => a.id === id ? { ...a, status: 'code_generated' } : a))
    try {
      const res = await fetch(`/api/ict/applications/${id}/generate-code`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setGeneratedCode(prev => ({ ...prev, [id]: json.code }))
    } catch {
      setErrorId(id)
      // Roll back only the optimistic status flip, a failed request
      // means no account/code exists yet, so it's genuinely still verified.
      setApplications(prev => prev.map(a => a.id === id ? { ...a, status: 'verified' } : a))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg-base)' }}>
      <div className={styles.pageHeader}>
        <Link href="/dashboard/ict" className={styles.backBtn}>←</Link>
        <p className={styles.pageTitle}>Access Applications</p>
      </div>

      <div className={styles.pageBody}>
        <div className={styles.tabs}>
          {(['pending', 'all'] as const).map(f => (
            <button key={f} className={`${styles.tab} ${filter === f ? styles.tabActive : ''}`}
              style={filter === f ? { background: schoolColor } : undefined}
              onClick={() => setFilter(f)}>
              {f === 'pending' ? 'Needs Review' : 'All'}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className={styles.emptyState}>Nothing here right now.</div>
        ) : filtered.map(a => {
          const busy = busyId === a.id
          return (
            <div key={a.id} className={styles.card}>
              <div className={styles.cardTop}>
                <div>
                  <p className={styles.cardName}>{a.full_name}</p>
                  <p className={styles.cardMeta}>
                    {a.appointment_types?.label ?? a.role_applied_for} · {a.email}
                    {a.phone ? ` · ${a.phone}` : ''}
                  </p>
                  <p className={styles.cardMeta}>
                    {a.verification_method === 'in_person' ? 'In-person verification' : 'Remote verification'}
                  </p>
                </div>
                <span className={styles.badge} style={{ background: STATUS_COLOR[a.status] }}>
                  {STATUS_LABEL[a.status]}
                </span>
              </div>

              {a.status === 'rejected' && a.rejection_reason && (
                <p className={styles.cardMeta} style={{ marginTop: 8 }}>Reason: {a.rejection_reason}</p>
              )}

              {generatedCode[a.id] && (
                <div className={styles.codeBox}>
                  <p className={styles.cardMeta} style={{ marginBottom: 4 }}>
                    Access code, share this with {a.full_name.split(' ')[0]} now, it won&apos;t be shown again here:
                  </p>
                  <span className={styles.codeVal}>{generatedCode[a.id]}</span>
                </div>
              )}

              {['pending', 'under_review'].includes(a.status) && (
                <div className={styles.actions}>
                  <button className={styles.btn} style={{ background: '#3FA66B' }} disabled={busy}
                    onClick={() => verify(a.id, 'verified')}>
                    {busy ? 'Saving…' : 'Verify'}
                  </button>
                  <button className={`${styles.btn} ${styles.btnGhost}`} disabled={busy}
                    onClick={() => verify(a.id, 'rejected')}>
                    Reject
                  </button>
                </div>
              )}

              {a.status === 'verified' && !generatedCode[a.id] && (
                <div className={styles.actions}>
                  <button className={styles.btn} style={{ background: schoolColor }} disabled={busy}
                    onClick={() => generateCode(a.id)}>
                    {busy ? 'Generating…' : 'Generate Access Code'}
                  </button>
                </div>
              )}

              {errorId === a.id && (
                <p className={styles.errorText}>Something went wrong, check your connection and try again.</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
