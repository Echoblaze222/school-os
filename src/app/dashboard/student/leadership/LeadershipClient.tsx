'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import ContextSwitcher from '@/components/ContextSwitcher'
import { ArrowLeftIcon, AlertCircleIcon, CheckCircleIcon, ClockIcon, ChevronRightIcon } from '@/components/Icons'
import styles from './leadership.module.css'
import motion from '@/components/dashboard-motion.module.css'

interface Duty {
  id: string; title: string; description: string | null; due_date: string | null
  status: 'pending' | 'done' | 'escalated'; escalation_note: string | null
}

const LABELS: Record<string, string> = {
  head_boy: 'Headboy', head_girl: 'Head Girl',
  deputy_head_boy: 'Deputy Headboy', deputy_head_girl: 'Deputy Head Girl',
  senior_prefect: 'Senior Prefect', class_prefect: 'Class Prefect',
  house_captain: 'House Captain', house_vice_captain: 'House Vice Captain',
  academic_prefect: 'Academic Prefect', sports_prefect: 'Sports Prefect',
  health_prefect: 'Health Prefect', library_prefect: 'Library Prefect',
  press_prefect: 'Press/Media Prefect', sanitation_prefect: 'Sanitation Prefect',
  social_prefect: 'Social Prefect', hostel_prefect: 'Hostel Prefect',
}

export default function LeadershipClient({
  appointmentId, appointmentType,
}: { appointmentId: string; appointmentType: string }) {
  const [duties, setDuties] = useState<Duty[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [escalatingId, setEscalatingId] = useState<string | null>(null)
  const [escalationText, setEscalationText] = useState('')

  async function load() {
    setStatus('loading')
    try {
      const res = await fetch(`/api/student/leadership/duties?appointmentId=${appointmentId}`)
      if (!res.ok) throw new Error('failed')
      const data = await res.json()
      setDuties(data.duties ?? [])
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }

  useEffect(() => { load() /* eslint-disable-next-line */ }, [appointmentId])

  async function complete(dutyId: string) {
    if (busyId) return
    setBusyId(dutyId)
    setActionError(null)
    try {
      const res = await fetch('/api/student/leadership/duties', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete', dutyId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setActionError(data.error ?? 'Could not mark this duty complete.')
      } else await load()
    } catch {
      setActionError('Could not reach the server. Please try again.')
    } finally {
      setBusyId(null)
    }
  }

  async function submitEscalation(dutyId: string) {
    if (busyId || !escalationText.trim()) return
    setBusyId(dutyId)
    setActionError(null)
    try {
      const res = await fetch('/api/student/leadership/duties', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'escalate', dutyId, escalationNote: escalationText.trim() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setActionError(data.error ?? 'Could not escalate this duty.')
      } else {
        setEscalatingId(null)
        setEscalationText('')
        await load()
      }
    } catch {
      setActionError('Could not reach the server. Please try again.')
    } finally {
      setBusyId(null)
    }
  }

  const pending = duties.filter(d => d.status === 'pending')
  const done = duties.filter(d => d.status === 'done')
  const escalated = duties.filter(d => d.status === 'escalated')

  return (
    <>
      <ContextSwitcher />
      <main className={styles.main}>
        <div className={styles.topBar}>
          <Link href="/dashboard/student" className={styles.backLink}>
            <ArrowLeftIcon size={18} /> Back to student dashboard
          </Link>
        </div>
        <h1 className={styles.title}>{LABELS[appointmentType] ?? 'Leadership'} duties</h1>
        <p className={styles.subtitle}>
          This is your leadership dashboard. It doesn't show academic, financial, medical, or counseling records.
        </p>

        {appointmentType === 'hostel_prefect' && (
          <Link
            href="/dashboard/student/hostel-roll-call"
            className="glass-card"
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: 14,
              marginBottom: 16, textDecoration: 'none',
            }}
          >
            <CheckCircleIcon size={20} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 14 }}>
                Assist with hostel roll call
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Record attendance in your assigned hostel
              </div>
            </div>
            <ChevronRightIcon size={18} />
          </Link>
        )}

        {status === 'loading' && (
          <div className="glass-card" style={{ padding: 16 }}>
            <span className={motion.shimmer}>Loading duties...</span>
          </div>
        )}

        {status === 'error' && (
          <div className={`glass-card ${styles.errorCard}`}>
            <AlertCircleIcon size={20} />
            <p>Couldn't load your duties. Check your connection and try again.</p>
            <button className="btn btn-secondary btn-sm" onClick={load}>Try again</button>
          </div>
        )}

        {actionError && (
          <div className={`glass-card ${styles.errorCard}`}>
            <AlertCircleIcon size={20} /><p>{actionError}</p>
          </div>
        )}

        {status === 'ready' && duties.length === 0 && (
          <div className="glass-card" style={{ padding: 16 }}>
            <p>No duties assigned yet. Staff will assign duties here as they come up.</p>
          </div>
        )}

        {status === 'ready' && duties.length > 0 && (
          <div className={styles.list}>
            {pending.map(duty => (
              <div key={duty.id} className="glass-card-flat" style={{ padding: 14, borderRadius: 'var(--radius-lg)' }}>
                <div className={styles.dutyTitle}>{duty.title}</div>
                {duty.description && <p className={styles.dutyDesc}>{duty.description}</p>}
                {duty.due_date && <div className={styles.dutyDue}><ClockIcon size={14} /> Due {duty.due_date}</div>}
                <div className={styles.dutyActions}>
                  <button className="btn btn-primary btn-sm" disabled={busyId === duty.id} onClick={() => complete(duty.id)}>
                    {busyId === duty.id ? 'Saving...' : 'Mark done'}
                  </button>
                  {escalatingId === duty.id ? (
                    <div className={styles.escalateBox}>
                      <textarea
                        className={styles.escalateInput}
                        placeholder="What needs staff attention?"
                        value={escalationText}
                        onChange={e => setEscalationText(e.target.value)}
                      />
                      <div className={styles.dutyActions}>
                        <button className="btn btn-secondary btn-sm" onClick={() => { setEscalatingId(null); setEscalationText('') }}>Cancel</button>
                        <button className="btn btn-danger btn-sm" disabled={busyId === duty.id || !escalationText.trim()} onClick={() => submitEscalation(duty.id)}>
                          {busyId === duty.id ? 'Sending...' : 'Send to staff'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button className="btn btn-secondary btn-sm" onClick={() => setEscalatingId(duty.id)}>Escalate to staff</button>
                  )}
                </div>
              </div>
            ))}

            {escalated.length > 0 && (
              <>
                <h2 className={styles.sectionLabel}>Escalated</h2>
                {escalated.map(duty => (
                  <div key={duty.id} className="glass-card-flat" style={{ padding: 14, borderRadius: 'var(--radius-lg)', opacity: 0.85 }}>
                    <div className={styles.dutyTitle}>{duty.title}</div>
                    <div className={styles.dutyEscalated}><AlertCircleIcon size={14} /> Sent to staff: {duty.escalation_note}</div>
                  </div>
                ))}
              </>
            )}

            {done.length > 0 && (
              <>
                <h2 className={styles.sectionLabel}>Completed</h2>
                {done.map(duty => (
                  <div key={duty.id} className="glass-card-flat" style={{ padding: 14, borderRadius: 'var(--radius-lg)', opacity: 0.7 }}>
                    <div className={styles.dutyTitle}><CheckCircleIcon size={14} /> {duty.title}</div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </main>
    </>
  )
}
