'use client'
// src/app/dashboard/examination/results/ResultsWorkflowClient.tsx
// Verify/publish are NOT client+RLS calls, they go through the API
// routes (see /api/examination/results/verify and /publish) since both
// need bulk-safety and column-scoped writes beyond what RLS alone
// enforces. Every action here is idle -> processing -> success/failure.

import { useState } from 'react'
import RolePageWrapper from '@/components/RolePageWrapper'
import motion from '@/components/dashboard-motion.module.css'

interface ResultRow {
  id: string; term: string; academic_year: string; result_type: string
  score: number | null; max_score: number; grade: string | null
  student_name: string; class_name: string; subject_name: string
}

interface Props {
  userId: string; profile: any; school: any
  initialAwaitingVerification: ResultRow[]
  initialAwaitingPublication: ResultRow[]
  canVerify: boolean; canPublish: boolean
}

export default function ResultsWorkflowClient({
  userId, profile, school, initialAwaitingVerification, initialAwaitingPublication, canVerify, canPublish,
}: Props) {
  const [tab, setTab] = useState<'verify' | 'publish'>(canVerify ? 'verify' : 'publish')
  const [awaitingVerification, setAwaitingVerification] = useState(initialAwaitingVerification)
  const [awaitingPublication, setAwaitingPublication] = useState(initialAwaitingPublication)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  const rows = tab === 'verify' ? awaitingVerification : awaitingPublication

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected(prev => prev.size === rows.length ? new Set() : new Set(rows.map(r => r.id)))
  }

  async function submit() {
    if (busy || selected.size === 0) return
    setBusy(true)
    setMessage(null)
    const endpoint = tab === 'verify' ? '/api/examination/results/verify' : '/api/examination/results/publish'
    try {
      const res = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resultIds: [...selected] }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setMessage({ kind: 'error', text: json.error ?? `Request failed (${res.status}). Nothing changed, try again.` })
        return
      }
      const count = tab === 'verify' ? json.verifiedCount : json.publishedCount
      if (count === 0) {
        setMessage({ kind: 'error', text: json.message ?? 'Nothing was eligible to update.' })
        return
      }
      if (tab === 'verify') {
        setAwaitingVerification(prev => prev.filter(r => !selected.has(r.id)))
      } else {
        setAwaitingPublication(prev => prev.filter(r => !selected.has(r.id)))
      }
      setMessage({ kind: 'success', text: `${count} result${count === 1 ? '' : 's'} ${tab === 'verify' ? 'verified' : 'published'}.` })
      setSelected(new Set())
    } catch {
      setMessage({ kind: 'error', text: 'Network error. Nothing changed, check your connection and try again.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <RolePageWrapper userId={userId} role="examination" profile={profile} school={school} title="Verify & Publish Results">
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {canVerify && (
          <button className="btn" onClick={() => { setTab('verify'); setSelected(new Set()); setMessage(null) }}
            style={{ fontWeight: tab === 'verify' ? 700 : 400, opacity: tab === 'verify' ? 1 : 0.6 }}>
            Awaiting verification ({awaitingVerification.length})
          </button>
        )}
        {canPublish && (
          <button className="btn" onClick={() => { setTab('publish'); setSelected(new Set()); setMessage(null) }}
            style={{ fontWeight: tab === 'publish' ? 700 : 400, opacity: tab === 'publish' ? 1 : 0.6 }}>
            Awaiting publication ({awaitingPublication.length})
          </button>
        )}
      </div>

      {message && (
        <div className="glass-card-flat" style={{
          padding: 12, borderRadius: 'var(--radius-lg)', marginBottom: 12,
          border: `1px solid ${message.kind === 'error' ? 'var(--danger)' : 'var(--success, #3FA66B)'}`,
        }}>
          <p style={{ margin: 0, fontSize: 13, color: message.kind === 'error' ? 'var(--danger)' : 'var(--success, #3FA66B)' }}>{message.text}</p>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="glass-card-flat" style={{ padding: 20, borderRadius: 'var(--radius-xl)', textAlign: 'center' }}>
          <p style={{ margin: 0, opacity: 0.75 }}>
            {tab === 'verify' ? 'Nothing waiting on verification right now.' : 'Nothing waiting on publication right now.'}
          </p>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <button className="btn" style={{ fontSize: 13 }} onClick={toggleAll}>
              {selected.size === rows.length ? 'Deselect all' : `Select all ${rows.length}`}
            </button>
            <button className="btn btn-primary" disabled={selected.size === 0 || busy} onClick={submit}>
              {busy ? (tab === 'verify' ? 'Verifying…' : 'Publishing…') : `${tab === 'verify' ? 'Verify' : 'Publish'} ${selected.size || ''}`.trim()}
            </button>
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            {rows.map(r => (
              <label key={r.id} className={`glass-card ${motion.pressable}`}
                style={{ padding: 12, borderRadius: 'var(--radius-lg)', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontWeight: 600 }}>{r.student_name}</p>
                  <p style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>
                    {r.subject_name}, {r.class_name} · {r.term} {r.academic_year} · {r.result_type}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ margin: 0, fontWeight: 700 }}>{r.score ?? 'N/A'}/{r.max_score}</p>
                  {r.grade && <p style={{ margin: 0, fontSize: 12, opacity: 0.7 }}>{r.grade}</p>}
                </div>
              </label>
            ))}
          </div>
        </>
      )}
    </RolePageWrapper>
  )
}
