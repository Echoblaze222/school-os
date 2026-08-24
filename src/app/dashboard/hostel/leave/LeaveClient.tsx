'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import ContextSwitcher from '@/components/ContextSwitcher'
import { ArrowLeftIcon, AlertCircleIcon, CheckCircleIcon, ClockIcon } from '@/components/Icons'
import styles from './leave.module.css'
import { SkeletonCard } from '@/components/motion/Skeleton'

interface Hostel { id: string; name: string }
interface LeaveRequest {
  id: string; reason: string; is_emergency: boolean; destination: string | null
  departure_expected: string; return_expected: string
  departure_actual: string | null; return_actual: string | null
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  rejection_reason: string | null
  profiles: { id: string; full_name: string } | null
}

const TABS = ['pending', 'approved', 'rejected', 'cancelled'] as const

export default function LeaveClient({ hostels }: { hostels: Hostel[] }) {
  const [hostelId, setHostelId] = useState(hostels[0]?.id ?? '')
  const [tab, setTab] = useState<typeof TABS[number]>('pending')
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  async function load() {
    if (!hostelId) { setStatus('ready'); return }
    setStatus('loading')
    try {
      const res = await fetch(`/api/hostel/leave?hostelId=${hostelId}&status=${tab}`)
      if (!res.ok) throw new Error('failed')
      const data = await res.json()
      setRequests(data.requests ?? [])
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }

  useEffect(() => { load() /* eslint-disable-next-line */ }, [hostelId, tab])

  async function act(requestId: string, action: string, extra?: Record<string, unknown>) {
    if (busyId) return
    setBusyId(requestId)
    setActionError(null)
    try {
      const res = await fetch('/api/hostel/leave', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, requestId, ...extra }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setActionError(data.error ?? 'Could not complete that action.')
      } else {
        setRejectingId(null); setRejectReason('')
        await load()
      }
    } catch {
      setActionError('Could not reach the server. Please try again.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <ContextSwitcher />
      <main className={styles.main}>
        <div className={styles.topBar}>
          <Link href="/dashboard/hostel" className={styles.backLink}>
            <ArrowLeftIcon size={18} /> Back to hostel dashboard
          </Link>
        </div>
        <h1 className={styles.title}>Leave requests</h1>

        <div className={styles.controls}>
          {hostels.length > 1 && (
            <select className={styles.select} value={hostelId} onChange={e => setHostelId(e.target.value)}>
              {hostels.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          )}
          <div className={styles.tabs}>
            {TABS.map(t => (
              <button key={t} className={`${styles.tab} ${t === tab ? styles.tabActive : ''}`} onClick={() => setTab(t)}>
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {status === 'loading' && (
          <div style={{ display: 'grid', gap: 10 }}>
            <SkeletonCard /><SkeletonCard /><SkeletonCard />
          </div>
        )}
        {status === 'error' && (
          <div className={`glass-card ${styles.errorCard}`}>
            <AlertCircleIcon size={20} />
            <p>Couldn't load leave requests. Try again.</p>
            <button className="btn btn-secondary btn-sm" onClick={load}>Try again</button>
          </div>
        )}
        {actionError && (
          <div className={`glass-card ${styles.errorCard}`}><AlertCircleIcon size={20} /><p>{actionError}</p></div>
        )}

        {status === 'ready' && requests.length === 0 && (
          <div className="glass-card" style={{ padding: 16 }}><p>No {tab} leave requests.</p></div>
        )}

        {status === 'ready' && requests.map(r => (
          <div key={r.id} className="glass-card-flat" style={{ padding: 14, borderRadius: 'var(--radius-lg)', marginBottom: 8 }}>
            <div className={styles.reqHeader}>
              <span className={styles.reqName}>{r.profiles?.full_name ?? 'Student'}</span>
              {r.is_emergency && <span className={styles.emergencyTag}>Emergency</span>}
            </div>
            <p className={styles.reqReason}>{r.reason}</p>
            {r.destination && <p className={styles.reqDetail}>Destination: {r.destination}</p>}
            <p className={styles.reqDetail}>
              <ClockIcon size={12} /> Expected {new Date(r.departure_expected).toLocaleString()} to {new Date(r.return_expected).toLocaleString()}
            </p>
            {r.departure_actual && <p className={styles.reqDetail}>Departed: {new Date(r.departure_actual).toLocaleString()}</p>}
            {r.return_actual && <p className={styles.reqDetail}>Returned: {new Date(r.return_actual).toLocaleString()}</p>}
            {r.rejection_reason && <p className={styles.reqDetail}>Rejected: {r.rejection_reason}</p>}

            {tab === 'pending' && (
              <div className={styles.reqActions}>
                <button className="btn btn-primary btn-sm" disabled={busyId === r.id} onClick={() => act(r.id, 'approve')}>
                  {busyId === r.id ? 'Saving...' : 'Approve'}
                </button>
                {rejectingId === r.id ? (
                  <div className={styles.rejectBox}>
                    <textarea className={styles.rejectInput} placeholder="Reason for rejecting"
                      value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
                    <div className={styles.reqActions}>
                      <button className="btn btn-secondary btn-sm" onClick={() => { setRejectingId(null); setRejectReason('') }}>Cancel</button>
                      <button className="btn btn-danger btn-sm" disabled={!rejectReason.trim() || busyId === r.id}
                        onClick={() => act(r.id, 'reject', { rejectionReason: rejectReason.trim() })}>
                        Reject
                      </button>
                    </div>
                  </div>
                ) : (
                  <button className="btn btn-secondary btn-sm" onClick={() => setRejectingId(r.id)}>Reject</button>
                )}
              </div>
            )}

            {tab === 'approved' && !r.departure_actual && (
              <div className={styles.reqActions}>
                <button className="btn btn-primary btn-sm" disabled={busyId === r.id} onClick={() => act(r.id, 'record_departure')}>
                  {busyId === r.id ? 'Saving...' : 'Record departure'}
                </button>
              </div>
            )}
            {tab === 'approved' && r.departure_actual && !r.return_actual && (
              <div className={styles.reqActions}>
                <button className="btn btn-primary btn-sm" disabled={busyId === r.id} onClick={() => act(r.id, 'record_return')}>
                  {busyId === r.id ? 'Saving...' : 'Record return'}
                </button>
              </div>
            )}
            {tab === 'approved' && r.return_actual && (
              <div className={styles.reqActions}>
                <CheckCircleIcon size={14} /> <span className={styles.doneLabel}>Return recorded</span>
              </div>
            )}
          </div>
        ))}
      </main>
    </>
  )
}
