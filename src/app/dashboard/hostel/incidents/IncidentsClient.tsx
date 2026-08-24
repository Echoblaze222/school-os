'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import ContextSwitcher from '@/components/ContextSwitcher'
import { ArrowLeftIcon, AlertCircleIcon, CheckCircleIcon } from '@/components/Icons'
import styles from './incidents.module.css'
import { SkeletonCard } from '@/components/motion/Skeleton'

interface Hostel { id: string; name: string }
interface Incident {
  id: string; incident_type: string; description: string; location: string | null
  status: 'open' | 'escalated' | 'resolved'; occurred_at: string
  resolution: string | null; parent_notified_at: string | null
  profiles: { id: string; full_name: string } | null
}

const ISSUE_TYPES = ['altercation', 'property_damage', 'health', 'behavioral', 'other']

export default function IncidentsClient({ hostels }: { hostels: Hostel[] }) {
  const [hostelId, setHostelId] = useState(hostels[0]?.id ?? '')
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [formType, setFormType] = useState(ISSUE_TYPES[0])
  const [formDesc, setFormDesc] = useState('')
  const [formLocation, setFormLocation] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function load() {
    if (!hostelId) { setStatus('ready'); return }
    setStatus('loading')
    try {
      const res = await fetch(`/api/hostel/incidents?hostelId=${hostelId}`)
      if (!res.ok) throw new Error('failed')
      const data = await res.json()
      setIncidents(data.incidents ?? [])
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }

  useEffect(() => { load() /* eslint-disable-next-line */ }, [hostelId])

  async function submitReport() {
    if (submitting || !formDesc.trim()) return
    setSubmitting(true)
    setActionError(null)
    try {
      const res = await fetch('/api/hostel/incidents', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'report', hostelId, incidentType: formType, description: formDesc.trim(), location: formLocation.trim() || undefined }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setActionError(data.error ?? 'Could not save this incident.')
      } else {
        setShowForm(false); setFormDesc(''); setFormLocation('')
        await load()
      }
    } catch {
      setActionError('Could not reach the server. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function act(incidentId: string, action: string, extra?: Record<string, unknown>) {
    if (busyId) return
    setBusyId(incidentId)
    setActionError(null)
    try {
      const res = await fetch('/api/hostel/incidents', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, incidentId, ...extra }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setActionError(data.error ?? 'Could not complete that action.')
      } else {
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
        <div className={styles.headerRow}>
          <h1 className={styles.title}>Incidents</h1>
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm(v => !v)}>
            {showForm ? 'Cancel' : 'Report incident'}
          </button>
        </div>
        <p className={styles.subtitle}>Restricted to hostel staff and school admins. Students and prefects don't have access to this page.</p>

        {hostels.length > 1 && (
          <select className={styles.select} value={hostelId} onChange={e => setHostelId(e.target.value)}>
            {hostels.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        )}

        {showForm && (
          <div className="glass-card" style={{ padding: 14, marginBottom: 16 }}>
            <select className={styles.select} value={formType} onChange={e => setFormType(e.target.value)}>
              {ISSUE_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
            </select>
            <input className={styles.input} placeholder="Location (optional)" value={formLocation} onChange={e => setFormLocation(e.target.value)} />
            <textarea className={styles.textarea} placeholder="What happened?" value={formDesc} onChange={e => setFormDesc(e.target.value)} />
            <button className="btn btn-primary btn-sm" disabled={submitting || !formDesc.trim()} onClick={submitReport}>
              {submitting ? 'Saving...' : 'Submit report'}
            </button>
          </div>
        )}

        {status === 'loading' && (
          <div style={{ display: 'grid', gap: 10 }}>
            <SkeletonCard /><SkeletonCard /><SkeletonCard />
          </div>
        )}
        {status === 'error' && (
          <div className={`glass-card ${styles.errorCard}`}>
            <AlertCircleIcon size={20} /><p>Couldn't load incidents. Try again.</p>
            <button className="btn btn-secondary btn-sm" onClick={load}>Try again</button>
          </div>
        )}
        {actionError && (
          <div className={`glass-card ${styles.errorCard}`}><AlertCircleIcon size={20} /><p>{actionError}</p></div>
        )}

        {status === 'ready' && incidents.length === 0 && (
          <div className="glass-card" style={{ padding: 16 }}><p>No incidents recorded.</p></div>
        )}

        {status === 'ready' && incidents.map(inc => (
          <div key={inc.id} className="glass-card-flat" style={{ padding: 14, borderRadius: 'var(--radius-lg)', marginBottom: 8 }}>
            <div className={styles.incHeader}>
              <span className={styles.incType}>{inc.incident_type.replace('_', ' ')}</span>
              <span className={`${styles.statusPill} ${styles[`status_${inc.status}`]}`}>{inc.status}</span>
            </div>
            {inc.profiles && <p className={styles.incDetail}>Student: {inc.profiles.full_name}</p>}
            {inc.location && <p className={styles.incDetail}>Location: {inc.location}</p>}
            <p className={styles.incDesc}>{inc.description}</p>
            <p className={styles.incDetail}>{new Date(inc.occurred_at).toLocaleString()}</p>
            {inc.resolution && <p className={styles.incDetail}>Resolution: {inc.resolution}</p>}
            {inc.parent_notified_at && (
              <p className={styles.incDetail}><CheckCircleIcon size={12} /> Parent notified</p>
            )}

            {inc.status !== 'resolved' && (
              <div className={styles.incActions}>
                {inc.status === 'open' && (
                  <button className="btn btn-secondary btn-sm" disabled={busyId === inc.id}
                    onClick={() => act(inc.id, 'escalate', { note: 'Escalated for further review' })}>
                    Escalate
                  </button>
                )}
                <ResolveButton busy={busyId === inc.id} onResolve={note => act(inc.id, 'resolve', { resolution: note })} />
                {inc.profiles && !inc.parent_notified_at && (
                  <button className="btn btn-secondary btn-sm" disabled={busyId === inc.id}
                    onClick={() => act(inc.id, 'notify_parent')}>
                    Notify parent
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </main>
    </>
  )
}

function ResolveButton({ busy, onResolve }: { busy: boolean; onResolve: (note: string) => void }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  if (!open) return <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => setOpen(true)}>Resolve</button>
  return (
    <div style={{ width: '100%' }}>
      <textarea className={styles.textarea} placeholder="Resolution note" value={note} onChange={e => setNote(e.target.value)} />
      <button className="btn btn-primary btn-sm" disabled={busy || !note.trim()} onClick={() => onResolve(note.trim())}>
        {busy ? 'Saving...' : 'Confirm resolved'}
      </button>
    </div>
  )
}
