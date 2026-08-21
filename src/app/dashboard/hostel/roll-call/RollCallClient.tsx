'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeftIcon, AlertCircleIcon, CheckCircleIcon } from '@/components/Icons'
import styles from './rollcall.module.css'
import motion from '@/components/dashboard-motion.module.css'

interface Hostel { id: string; name: string }
interface Entry {
  id: string; student_id: string; status: string; note: string | null
  profiles: { id: string; full_name: string } | null
}
interface Session { id: string; status: string; session_date: string; session_type: string }

const SESSION_TYPES = ['morning', 'afternoon', 'evening', 'night'] as const
const STATUSES = ['present', 'absent', 'excused', 'on_leave', 'late'] as const
const STATUS_LABEL: Record<string, string> = {
  present: 'Present', absent: 'Absent', excused: 'Excused',
  on_leave: 'On leave', late: 'Late', unknown: 'Not yet recorded',
}

export default function RollCallClient({ hostels }: { hostels: Hostel[] }) {
  const [hostelId, setHostelId] = useState(hostels[0]?.id ?? '')
  const [sessionType, setSessionType] = useState<typeof SESSION_TYPES[number]>('evening')
  const [session, setSession] = useState<Session | null>(null)
  const [entries, setEntries] = useState<Entry[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [savingEntryId, setSavingEntryId] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  async function load() {
    if (!hostelId) { setStatus('ready'); return }
    setStatus('loading')
    setActionError(null)
    try {
      const res = await fetch(`/api/hostel/roll-call?hostelId=${hostelId}&sessionType=${sessionType}`)
      if (!res.ok) throw new Error('failed')
      const data = await res.json()
      setSession(data.session)
      setEntries(data.entries ?? [])
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }

  useEffect(() => { load() /* eslint-disable-next-line */ }, [hostelId, sessionType])

  async function record(entryId: string, newStatus: string) {
    if (savingEntryId) return
    setSavingEntryId(entryId)
    setActionError(null)
    // Optimistic update so the tap feels immediate, corrected below if the
    // request actually fails, per "no silent failures."
    setEntries(prev => prev.map(e => e.id === entryId ? { ...e, status: newStatus } : e))
    try {
      const res = await fetch('/api/hostel/roll-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'record', entryId, status: newStatus }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setActionError(data.error ?? 'Could not save that status. Please try again.')
        await load() // revert optimistic update to the real state
      }
    } catch {
      setActionError('Could not reach the server. Your change was not saved.')
      await load()
    } finally {
      setSavingEntryId(null)
    }
  }

  async function closeSession() {
    if (!session || closing) return
    setClosing(true)
    setActionError(null)
    try {
      const res = await fetch('/api/hostel/roll-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'close', sessionId: session.id }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setActionError(data.error ?? 'Could not close the session.')
      } else {
        await load()
      }
    } catch {
      setActionError('Could not reach the server. The session is still open.')
    } finally {
      setClosing(false)
    }
  }

  const unaccountedCount = entries.filter(e => e.status === 'unknown').length

  return (
    <main className={styles.main}>
      <div className={styles.topBar}>
        <Link href="/dashboard/hostel" className={styles.backLink}>
          <ArrowLeftIcon size={18} /> Back to hostel dashboard
        </Link>
      </div>
      <h1 className={styles.title}>Roll call</h1>

      <div className={styles.controls}>
        {hostels.length > 1 && (
          <select className={styles.select} value={hostelId} onChange={e => setHostelId(e.target.value)}>
            {hostels.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        )}
        <div className={styles.sessionTabs}>
          {SESSION_TYPES.map(t => (
            <button
              key={t}
              className={`${styles.sessionTab} ${t === sessionType ? styles.sessionTabActive : ''}`}
              onClick={() => setSessionType(t)}
            >
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {status === 'loading' && (
        <div className="glass-card" style={{ padding: 16 }}>
          <span className={motion.shimmer}>Loading roll call...</span>
        </div>
      )}

      {status === 'error' && (
        <div className={`glass-card ${styles.errorCard}`}>
          <AlertCircleIcon size={20} />
          <p>Couldn't load this session. Check your connection and try again.</p>
          <button className="btn btn-secondary btn-sm" onClick={load}>Try again</button>
        </div>
      )}

      {actionError && (
        <div className={`glass-card ${styles.errorCard}`}>
          <AlertCircleIcon size={20} />
          <p>{actionError}</p>
        </div>
      )}

      {status === 'ready' && !hostelId && (
        <div className="glass-card" style={{ padding: 16 }}><p>No hostels available.</p></div>
      )}

      {status === 'ready' && hostelId && entries.length === 0 && (
        <div className="glass-card" style={{ padding: 16 }}>
          <p>No boarding students are currently assigned to a bed in this hostel.</p>
        </div>
      )}

      {status === 'ready' && entries.length > 0 && (
        <>
          {session?.status === 'closed' && (
            <div className={styles.closedBanner}>
              <CheckCircleIcon size={16} /> This session is closed.
            </div>
          )}
          {unaccountedCount > 0 && session?.status === 'open' && (
            <div className={styles.warningBanner}>
              <AlertCircleIcon size={16} />
              {unaccountedCount} student{unaccountedCount === 1 ? '' : 's'} not yet accounted for.
            </div>
          )}

          <div className={styles.entryList}>
            {entries.map(entry => (
              <div key={entry.id} className="glass-card-flat" style={{ padding: 12, borderRadius: 'var(--radius-lg)' }}>
                <div className={styles.entryName}>{entry.profiles?.full_name ?? 'Student'}</div>
                <div className={styles.entryStatusChips}>
                  {STATUSES.map(s => (
                    <button
                      key={s}
                      disabled={session?.status === 'closed' || savingEntryId === entry.id}
                      className={`${styles.statusChip} ${entry.status === s ? styles[`statusChip_${s}`] : ''}`}
                      onClick={() => record(entry.id, s)}
                    >
                      {STATUS_LABEL[s]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {session?.status === 'open' && (
            <button className="btn btn-primary" style={{ marginTop: 16, width: '100%' }}
              disabled={closing} onClick={closeSession}>
              {closing ? 'Closing session...' : 'Close session'}
            </button>
          )}
        </>
      )}
    </main>
  )
}
