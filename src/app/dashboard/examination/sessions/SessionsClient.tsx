'use client'
// src/app/dashboard/examination/sessions/SessionsClient.tsx
// No silent failures: every button here moves through
// idle -> submitting -> success/error, with an explicit message either way.

import { useState } from 'react'
import RolePageWrapper from '@/components/RolePageWrapper'
import { createClient } from '@/lib/supabase/client'
import motion from '@/components/dashboard-motion.module.css'

interface ExamSession {
  id: string; name: string; term: string; academic_year: string
  start_date: string; end_date: string; status: string; created_at: string
}

interface Props {
  userId: string; profile: any; school: any; schoolId: string
  initialSessions: ExamSession[]; canManage: boolean
}

const STATUS_COLOR: Record<string, string> = {
  draft: 'var(--text-muted, #888)',
  scheduled: 'var(--brand)',
  ongoing: 'var(--warning, #E4572E)',
  completed: 'var(--success, #3FA66B)',
  archived: 'var(--text-muted, #888)',
}

export default function SessionsClient({ userId, profile, school, schoolId, initialSessions, canManage }: Props) {
  const supabase = createClient()
  const [sessions, setSessions] = useState(initialSessions)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', term: '', academic_year: '', start_date: '', end_date: '' })
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null)

  async function createSession(e: React.FormEvent) {
    e.preventDefault()
    if (saveState === 'saving') return // duplicate-submit guard
    if (!form.name || !form.term || !form.academic_year || !form.start_date || !form.end_date) {
      setError('Fill in every field before creating a session.')
      setSaveState('error')
      return
    }
    if (form.end_date < form.start_date) {
      setError('End date needs to be on or after the start date.')
      setSaveState('error')
      return
    }
    setSaveState('saving')
    setError(null)
    const { data, error: insertError } = await supabase
      .from('exam_sessions')
      .insert({ school_id: schoolId, created_by: userId, ...form, status: 'draft' })
      .select('id, name, term, academic_year, start_date, end_date, status, created_at')
      .single()

    if (insertError) {
      setError(`Couldn't create the session, ${insertError.message}. Your entries are still here, fix and try again.`)
      setSaveState('error')
      return
    }
    setSessions(prev => [data as ExamSession, ...prev])
    setForm({ name: '', term: '', academic_year: '', start_date: '', end_date: '' })
    setShowForm(false)
    setSaveState('idle')
  }

  async function changeStatus(id: string, status: string) {
    setStatusBusyId(id)
    const { error: updateError } = await supabase.from('exam_sessions').update({ status }).eq('id', id)
    if (updateError) {
      setError(`Couldn't update session status, ${updateError.message}.`)
      setStatusBusyId(null)
      return
    }
    setSessions(prev => prev.map(s => s.id === id ? { ...s, status } : s))
    setStatusBusyId(null)
  }

  return (
    <RolePageWrapper userId={userId} role="examination" profile={profile} school={school} title="Exam Sessions">
      {error && (
        <div className="glass-card-flat" style={{ padding: 12, borderRadius: 'var(--radius-lg)', marginBottom: 12, border: '1px solid var(--danger)' }}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--danger)' }}>{error}</p>
        </div>
      )}

      {canManage && (
        <button
          className="btn btn-primary"
          style={{ marginBottom: 16 }}
          onClick={() => setShowForm(s => !s)}
        >
          {showForm ? 'Cancel' : '+ New exam session'}
        </button>
      )}

      {showForm && canManage && (
        <form onSubmit={createSession} className="glass-card" style={{ padding: 16, borderRadius: 'var(--radius-xl)', marginBottom: 16, display: 'grid', gap: 10 }}>
          <input placeholder="Session name (e.g. First Term Examination)" value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required
            style={inputStyle} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <input placeholder="Term (e.g. First Term)" value={form.term}
              onChange={e => setForm(f => ({ ...f, term: e.target.value }))} required style={inputStyle} />
            <input placeholder="Academic year (e.g. 2025/2026)" value={form.academic_year}
              onChange={e => setForm(f => ({ ...f, academic_year: e.target.value }))} required style={inputStyle} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label style={labelStyle}>Start date
              <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} required style={inputStyle} />
            </label>
            <label style={labelStyle}>End date
              <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} required style={inputStyle} />
            </label>
          </div>
          <button type="submit" className="btn btn-primary" disabled={saveState === 'saving'}>
            {saveState === 'saving' ? 'Creating…' : 'Create session'}
          </button>
        </form>
      )}

      {sessions.length === 0 ? (
        <div className="glass-card-flat" style={{ padding: 20, borderRadius: 'var(--radius-xl)', textAlign: 'center' }}>
          <p style={{ margin: 0, opacity: 0.75 }}>
            No exam sessions yet. {canManage ? 'Create the first one to start scheduling the timetable.' : 'Check back once the Examination Officer schedules one.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {sessions.map(s => (
            <div key={s.id} className={`glass-card ${motion.pressable}`} style={{ padding: 14, borderRadius: 'var(--radius-xl)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 700 }}>{s.name}</p>
                  <p style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>{s.term} · {s.academic_year}</p>
                  <p style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>{s.start_date} → {s.end_date}</p>
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'capitalize', color: STATUS_COLOR[s.status] }}>
                  {s.status}
                </span>
              </div>
              {canManage && (
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  {NEXT_STATUS[s.status]?.map(next => (
                    <button key={next} className="btn" disabled={statusBusyId === s.id}
                      onClick={() => changeStatus(s.id, next)}
                      style={{ fontSize: 12, padding: '6px 10px' }}>
                      {statusBusyId === s.id ? 'Updating…' : `Mark ${next}`}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </RolePageWrapper>
  )
}

const NEXT_STATUS: Record<string, string[]> = {
  draft: ['scheduled'],
  scheduled: ['ongoing'],
  ongoing: ['completed'],
  completed: ['archived'],
  archived: [],
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)',
  background: 'var(--surface)', color: 'inherit', fontSize: 14, width: '100%',
}
const labelStyle: React.CSSProperties = { fontSize: 12, opacity: 0.7, display: 'flex', flexDirection: 'column', gap: 4 }
