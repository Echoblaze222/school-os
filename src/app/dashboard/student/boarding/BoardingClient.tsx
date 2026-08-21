'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import ContextSwitcher from '@/components/ContextSwitcher'
import { ArrowLeftIcon, AlertCircleIcon, HomeIcon, UsersIcon, CheckCircleIcon } from '@/components/Icons'
import styles from './boarding.module.css'
import motion from '@/components/dashboard-motion.module.css'

interface Summary {
  boarding: boolean
  hostel?: string; hostelId?: string; block?: string; room?: string; bed?: string
  roommates?: string[]
  latestRollCall?: { status: string; sessionType: string; sessionDate: string } | null
}

interface LeaveRequest {
  id: string; reason: string; is_emergency: boolean; destination: string | null
  departure_expected: string; return_expected: string
  departure_actual: string | null; return_actual: string | null
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  rejection_reason: string | null
}

const ROLL_CALL_LABEL: Record<string, string> = {
  present: 'Present', absent: 'Absent', excused: 'Excused',
  on_leave: 'On leave', late: 'Late', unknown: 'Not yet recorded',
}

export default function BoardingClient() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([])
  const [showLeaveForm, setShowLeaveForm] = useState(false)
  const [leaveError, setLeaveError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null)
  const [form, setForm] = useState({ reason: '', destination: '', isEmergency: false, departureExpected: '', returnExpected: '' })

  async function load() {
    setStatus('loading')
    try {
      const res = await fetch('/api/student/boarding/summary')
      if (!res.ok) throw new Error('failed')
      const data = await res.json()
      setSummary(data)
      if (data.boarding) await loadLeaveRequests()
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }

  async function loadLeaveRequests() {
    try {
      const res = await fetch('/api/student/boarding/leave')
      if (!res.ok) return
      const data = await res.json()
      setLeaveRequests(data.requests ?? [])
    } catch {
      // Leave history failing to load isn't fatal to the rest of the
      // page: the location/roll-call sections still render.
    }
  }

  useEffect(() => { load() }, [])

  async function submitLeave() {
    if (submitting || !summary?.hostelId) return
    if (!form.reason.trim() || !form.departureExpected || !form.returnExpected) {
      setLeaveError('Reason, expected departure, and expected return are all required.')
      return
    }
    setSubmitting(true)
    setLeaveError(null)
    try {
      const res = await fetch('/api/student/boarding/leave', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit', hostelId: summary.hostelId,
          reason: form.reason.trim(), destination: form.destination.trim() || undefined,
          isEmergency: form.isEmergency,
          departureExpected: form.departureExpected, returnExpected: form.returnExpected,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setLeaveError(data.error ?? 'Could not submit your leave request.')
      } else {
        setShowLeaveForm(false)
        setForm({ reason: '', destination: '', isEmergency: false, departureExpected: '', returnExpected: '' })
        await loadLeaveRequests()
      }
    } catch {
      setLeaveError('Could not reach the server. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function cancelLeave(requestId: string) {
    if (busyRequestId) return
    setBusyRequestId(requestId)
    setLeaveError(null)
    try {
      const res = await fetch('/api/student/boarding/leave', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', requestId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setLeaveError(data.error ?? 'Could not cancel this request.')
      } else await loadLeaveRequests()
    } catch {
      setLeaveError('Could not reach the server. Please try again.')
    } finally {
      setBusyRequestId(null)
    }
  }

  return (
    <>
      <ContextSwitcher />
      <main className={styles.main}>
        <div className={styles.topBar}>
          <Link href="/dashboard/student" className={styles.backLink}>
            <ArrowLeftIcon size={18} /> Back to student dashboard
          </Link>
        </div>
        <h1 className={styles.title}>Boarding</h1>

        {status === 'loading' && (
          <div className="glass-card" style={{ padding: 16 }}>
            <span className={motion.shimmer}>Loading your hostel details...</span>
          </div>
        )}

        {status === 'error' && (
          <div className={`glass-card ${styles.errorCard}`}>
            <AlertCircleIcon size={20} />
            <p>Couldn't load your boarding details. Check your connection and try again.</p>
            <button className="btn btn-secondary btn-sm" onClick={load}>Try again</button>
          </div>
        )}

        {status === 'ready' && summary && !summary.boarding && (
          <div className="glass-card" style={{ padding: 16, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <HomeIcon size={24} />
            <p>You're not currently assigned to a hostel bed. If you believe this is wrong, contact your hostel warden.</p>
          </div>
        )}

        {status === 'ready' && summary?.boarding && (
          <>
            <div className={`glass-card ${styles.locationCard}`}>
              <HomeIcon size={20} />
              <div>
                <div className={styles.locationMain}>{summary.hostel}</div>
                <div className={styles.locationSub}>{summary.block} &middot; {summary.room} &middot; {summary.bed}</div>
              </div>
            </div>

            {summary.roommates && summary.roommates.length > 0 && (
              <div className={`glass-card ${styles.section}`}>
                <div className={styles.sectionHeader}><UsersIcon size={16} /> Roommates</div>
                <p className={styles.roommateList}>{summary.roommates.join(', ')}</p>
              </div>
            )}

            <div className={`glass-card ${styles.section}`}>
              <div className={styles.sectionHeader}><CheckCircleIcon size={16} /> Roll call status</div>
              {summary.latestRollCall ? (
                <p className={styles.rollCallStatus}>
                  {ROLL_CALL_LABEL[summary.latestRollCall.status] ?? summary.latestRollCall.status}
                  <span className={styles.rollCallMeta}>
                    {' '}({summary.latestRollCall.sessionType}, {summary.latestRollCall.sessionDate})
                  </span>
                </p>
              ) : (
                <p className={styles.rollCallStatus}>No roll call recorded yet.</p>
              )}
            </div>

            <div className={`glass-card ${styles.section}`}>
              <div className={styles.leaveHeaderRow}>
                <div className={styles.sectionHeader}>Leave requests</div>
                <button className="btn btn-primary btn-sm" onClick={() => setShowLeaveForm(v => !v)}>
                  {showLeaveForm ? 'Cancel' : 'New request'}
                </button>
              </div>

              {leaveError && <p className={styles.leaveError}>{leaveError}</p>}

              {showLeaveForm && (
                <div className={styles.leaveForm}>
                  <textarea className={styles.leaveInput} placeholder="Reason for leave"
                    value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
                  <input className={styles.leaveInput} placeholder="Destination (optional)"
                    value={form.destination} onChange={e => setForm(f => ({ ...f, destination: e.target.value }))} />
                  <label className={styles.leaveDateLabel}>
                    Expected departure
                    <input type="datetime-local" className={styles.leaveInput}
                      value={form.departureExpected} onChange={e => setForm(f => ({ ...f, departureExpected: e.target.value }))} />
                  </label>
                  <label className={styles.leaveDateLabel}>
                    Expected return
                    <input type="datetime-local" className={styles.leaveInput}
                      value={form.returnExpected} onChange={e => setForm(f => ({ ...f, returnExpected: e.target.value }))} />
                  </label>
                  <label className={styles.emergencyLabel}>
                    <input type="checkbox" checked={form.isEmergency}
                      onChange={e => setForm(f => ({ ...f, isEmergency: e.target.checked }))} />
                    This is an emergency
                  </label>
                  <button className="btn btn-primary btn-sm" disabled={submitting} onClick={submitLeave}>
                    {submitting ? 'Submitting...' : 'Submit request'}
                  </button>
                </div>
              )}

              {leaveRequests.length === 0 && !showLeaveForm && (
                <p className={styles.pendingNote}>No leave requests yet.</p>
              )}

              {leaveRequests.map(r => (
                <div key={r.id} className={styles.leaveRow}>
                  <div className={styles.leaveRowTop}>
                    <span className={`${styles.leaveStatus} ${styles[`leaveStatus_${r.status}`]}`}>{r.status}</span>
                    {r.status === 'pending' && (
                      <button className="btn btn-secondary btn-sm" disabled={busyRequestId === r.id}
                        onClick={() => cancelLeave(r.id)}>
                        {busyRequestId === r.id ? 'Cancelling...' : 'Cancel'}
                      </button>
                    )}
                  </div>
                  <p className={styles.leaveReason}>{r.reason}</p>
                  <p className={styles.leaveDates}>
                    {new Date(r.departure_expected).toLocaleDateString()} to {new Date(r.return_expected).toLocaleDateString()}
                  </p>
                  {r.rejection_reason && <p className={styles.leaveRejection}>Rejected: {r.rejection_reason}</p>}
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </>
  )
}
