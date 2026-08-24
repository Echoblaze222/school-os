'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import ContextSwitcher from '@/components/ContextSwitcher'
import { ArrowLeftIcon, AlertCircleIcon, CheckCircleIcon } from '@/components/Icons'
import styles from './maintenance.module.css'
import { SkeletonCard } from '@/components/motion/Skeleton'

interface Hostel { id: string; name: string }
interface MaintenanceRequest {
  id: string; issue_type: string; description: string; status: 'open' | 'in_progress' | 'resolved'
  created_at: string; resolution_note: string | null
  hostel_rooms: { name: string } | null
}

const ISSUE_TYPES = [
  'broken_fan', 'damaged_bed', 'leaking_pipe', 'electrical',
  'broken_light', 'damaged_door', 'plumbing', 'other',
]

export default function MaintenanceClient({ hostels }: { hostels: Hostel[] }) {
  const [hostelId, setHostelId] = useState(hostels[0]?.id ?? '')
  const [requests, setRequests] = useState<MaintenanceRequest[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [formType, setFormType] = useState(ISSUE_TYPES[0])
  const [formDesc, setFormDesc] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function load() {
    if (!hostelId) { setStatus('ready'); return }
    setStatus('loading')
    try {
      const res = await fetch(`/api/hostel/maintenance?hostelId=${hostelId}`)
      if (!res.ok) throw new Error('failed')
      const data = await res.json()
      setRequests(data.requests ?? [])
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
      const res = await fetch('/api/hostel/maintenance', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'report', hostelId, issueType: formType, description: formDesc.trim() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setActionError(data.error ?? 'Could not save this request.')
      } else {
        setShowForm(false); setFormDesc('')
        await load()
      }
    } catch {
      setActionError('Could not reach the server. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function resolve(requestId: string, note: string) {
    if (busyId) return
    setBusyId(requestId)
    setActionError(null)
    try {
      const res = await fetch('/api/hostel/maintenance', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resolve', requestId, resolutionNote: note }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setActionError(data.error ?? 'Could not resolve this request.')
      } else await load()
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
          <h1 className={styles.title}>Maintenance</h1>
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm(v => !v)}>
            {showForm ? 'Cancel' : 'Report issue'}
          </button>
        </div>

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
            <textarea className={styles.textarea} placeholder="Describe the issue" value={formDesc} onChange={e => setFormDesc(e.target.value)} />
            <button className="btn btn-primary btn-sm" disabled={submitting || !formDesc.trim()} onClick={submitReport}>
              {submitting ? 'Saving...' : 'Submit'}
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
            <AlertCircleIcon size={20} /><p>Couldn't load requests. Try again.</p>
            <button className="btn btn-secondary btn-sm" onClick={load}>Try again</button>
          </div>
        )}
        {actionError && (
          <div className={`glass-card ${styles.errorCard}`}><AlertCircleIcon size={20} /><p>{actionError}</p></div>
        )}

        {status === 'ready' && requests.length === 0 && (
          <div className="glass-card" style={{ padding: 16 }}><p>No maintenance requests.</p></div>
        )}

        {status === 'ready' && requests.map(r => (
          <div key={r.id} className="glass-card-flat" style={{ padding: 14, borderRadius: 'var(--radius-lg)', marginBottom: 8 }}>
            <div className={styles.reqHeader}>
              <span className={styles.reqType}>{r.issue_type.replace('_', ' ')}</span>
              <span className={`${styles.statusPill} ${styles[`status_${r.status}`]}`}>{r.status.replace('_', ' ')}</span>
            </div>
            {r.hostel_rooms && <p className={styles.reqDetail}>Room: {r.hostel_rooms.name}</p>}
            <p className={styles.reqDesc}>{r.description}</p>
            <p className={styles.reqDetail}>{new Date(r.created_at).toLocaleString()}</p>
            {r.resolution_note && <p className={styles.reqDetail}>Resolved: {r.resolution_note}</p>}

            {r.status !== 'resolved' && (
              <ResolveInline busy={busyId === r.id} onResolve={note => resolve(r.id, note)} />
            )}
          </div>
        ))}
      </main>
    </>
  )
}

function ResolveInline({ busy, onResolve }: { busy: boolean; onResolve: (note: string) => void }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  if (!open) return <button className="btn btn-primary btn-sm" style={{ marginTop: 8 }} disabled={busy} onClick={() => setOpen(true)}>Mark resolved</button>
  return (
    <div style={{ marginTop: 8 }}>
      <textarea className={styles.textarea} placeholder="What was done" value={note} onChange={e => setNote(e.target.value)} />
      <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => onResolve(note.trim())}>
        {busy ? 'Saving...' : 'Confirm resolved'}
      </button>
    </div>
  )
}
