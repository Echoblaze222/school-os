'use client'
// src/app/dashboard/ict/account-requests/AccountRequestsClient.tsx
//
// Note what's deliberately absent: no password input field anywhere in
// this file. For request_type === 'password_reset', the only action
// available is "Send reset link", it calls the server route that
// triggers Supabase's own recovery email, and this component never
// receives, displays, or stores anything resembling a password. That's
// the UI half of §12's "ICT can never see or retrieve a password."

import { useState } from 'react'
import Link from 'next/link'
import styles from './account-requests.module.css'

const STATUS_COLOR: Record<string, string> = {
  open: '#E0A94E', in_progress: '#4A90D9', resolved: '#3FA66B', closed: '#7A7A88',
}
const STATUS_LABEL: Record<string, string> = {
  open: 'Open', in_progress: 'In Progress', resolved: 'Resolved', closed: 'Closed',
}
const TYPE_LABEL: Record<string, string> = {
  password_reset: 'Password Reset', access_troubleshooting: 'Access Issue',
  device_registration: 'Device Registration', email_support: 'Email Support',
  provisioning: 'Provisioning', other: 'Other',
}

interface Request {
  id: string; requested_by: string; request_type: string; description: string
  status: string; resolution_note: string | null; created_at: string
  profiles?: { full_name?: string; role?: string }
}

export default function AccountRequestsClient({
  initialRequests, schoolColor,
}: { initialRequests: Request[]; schoolColor: string }) {
  const [requests, setRequests] = useState(initialRequests)
  const [filter, setFilter] = useState<'open' | 'all'>('open')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [errorId, setErrorId] = useState<string | null>(null)
  const [noteId, setNoteId] = useState<string | null>(null)

  const filtered = filter === 'open'
    ? requests.filter(r => !['resolved', 'closed'].includes(r.status))
    : requests

  async function sendResetLink(id: string) {
    setBusyId(id); setErrorId(null); setNoteId(null)
    try {
      const res = await fetch(`/api/ict/account-requests/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send_password_reset' }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'in_progress' } : r))
      setNoteId(id)
    } catch {
      setErrorId(id)
    } finally {
      setBusyId(null)
    }
  }

  async function resolve(id: string) {
    setBusyId(id); setErrorId(null)
    try {
      const res = await fetch(`/api/ict/account-requests/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'resolved' }),
      })
      if (!res.ok) throw new Error()
      setRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'resolved' } : r))
    } catch {
      setErrorId(id)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg-base)' }}>
      <div className={styles.pageHeader}>
        <Link href="/dashboard/ict" className={styles.backBtn}>←</Link>
        <p className={styles.pageTitle}>Account Requests</p>
      </div>

      <div className={styles.pageBody}>
        <div className={styles.tabs}>
          {(['open', 'all'] as const).map(f => (
            <button key={f} className={`${styles.tab} ${filter === f ? styles.tabActive : ''}`}
              style={filter === f ? { background: schoolColor } : undefined}
              onClick={() => setFilter(f)}>
              {f === 'open' ? 'Open' : 'All'}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className={styles.emptyState}>Nothing here right now.</div>
        ) : filtered.map(r => {
          const busy = busyId === r.id
          return (
            <div key={r.id} className={styles.card}>
              <div className={styles.cardTop}>
                <div>
                  <p className={styles.cardName}>{r.profiles?.full_name ?? 'Unknown'}</p>
                  <p className={styles.cardMeta}>{TYPE_LABEL[r.request_type] ?? r.request_type} · {r.profiles?.role ?? ''}</p>
                </div>
                <span className={styles.badge} style={{ background: STATUS_COLOR[r.status] }}>
                  {STATUS_LABEL[r.status]}
                </span>
              </div>

              <p className={styles.cardDesc}>{r.description}</p>

              {!['resolved', 'closed'].includes(r.status) && (
                <div className={styles.actions}>
                  {r.request_type === 'password_reset' ? (
                    <button className={styles.btn} style={{ background: schoolColor }} disabled={busy}
                      onClick={() => sendResetLink(r.id)}>
                      {busy ? 'Sending…' : 'Send reset link'}
                    </button>
                  ) : (
                    <button className={styles.btn} style={{ background: '#3FA66B' }} disabled={busy}
                      onClick={() => resolve(r.id)}>
                      {busy ? 'Saving…' : 'Mark resolved'}
                    </button>
                  )}
                </div>
              )}

              {noteId === r.id && (
                <p className={styles.successNote}>Recovery link sent to the user&apos;s registered email.</p>
              )}
              {errorId === r.id && (
                <p className={styles.errorText}>Couldn&apos;t complete that, check your connection and try again.</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
