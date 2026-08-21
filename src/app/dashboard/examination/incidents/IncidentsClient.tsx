'use client'
// src/app/dashboard/examination/incidents/IncidentsClient.tsx

import { useState } from 'react'
import RolePageWrapper from '@/components/RolePageWrapper'
import { createClient } from '@/lib/supabase/client'
import motion from '@/components/dashboard-motion.module.css'

interface TimetableOption { id: string; exam_date: string; class_subjects?: { classes: { name: string }; subjects: { name: string } } | null }
interface Incident {
  id: string; exam_timetable_id: string | null; student_id: string | null
  incident_type: string; severity: string; description: string; status: string
  resolution_notes: string | null; resolved_at: string | null; created_at: string
  student_name: string | null; reporter_name: string
}

interface Props {
  userId: string; profile: any; school: any; schoolId: string
  timetable: TimetableOption[]; initialIncidents: Incident[]; canResolve: boolean
}

const SEVERITY_COLOR: Record<string, string> = {
  low: 'var(--text-muted, #888)', medium: 'var(--warning, #E4572E)',
  high: 'var(--danger, #E53E3E)', critical: 'var(--danger, #C53030)',
}

export default function IncidentsClient({ userId, profile, school, schoolId, timetable, initialIncidents, canResolve }: Props) {
  const supabase = createClient()
  const [incidents, setIncidents] = useState(initialIncidents)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ exam_timetable_id: '', incident_type: 'malpractice', severity: 'medium', description: '' })
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [resolutionNotes, setResolutionNotes] = useState('')

  async function report(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    if (!form.description.trim()) {
      setError('Describe what happened before submitting.')
      return
    }
    setSaving(true)
    setError(null)
    const { data, error: insertError } = await supabase
      .from('exam_incidents')
      .insert({
        school_id: schoolId, reported_by: userId,
        exam_timetable_id: form.exam_timetable_id || null,
        incident_type: form.incident_type, severity: form.severity, description: form.description.trim(),
      })
      .select('id, exam_timetable_id, student_id, incident_type, severity, description, status, resolution_notes, resolved_at, created_at')
      .single()
    setSaving(false)
    if (insertError) {
      setError(`Couldn't submit that report, ${insertError.message}. Your text is still below, try again.`)
      return
    }
    setIncidents(prev => [{ ...(data as any), student_name: null, reporter_name: profile?.full_name ?? 'You' }, ...prev])
    setForm({ exam_timetable_id: '', incident_type: 'malpractice', severity: 'medium', description: '' })
    setShowForm(false)
  }

  async function resolve(id: string) {
    setResolvingId(id)
    const { error: updateError } = await supabase
      .from('exam_incidents')
      .update({ status: 'resolved', resolution_notes: resolutionNotes || null, resolved_by: userId, resolved_at: new Date().toISOString() })
      .eq('id', id)
    if (updateError) {
      setError(`Couldn't resolve this incident, ${updateError.message}.`)
      setResolvingId(null)
      return
    }
    setIncidents(prev => prev.map(i => i.id === id ? { ...i, status: 'resolved', resolution_notes: resolutionNotes || null, resolved_at: new Date().toISOString() } : i))
    setResolvingId(null)
    setResolutionNotes('')
  }

  return (
    <RolePageWrapper userId={userId} role="examination" profile={profile} school={school} title="Incidents">
      {error && (
        <div className="glass-card-flat" style={{ padding: 12, borderRadius: 'var(--radius-lg)', marginBottom: 12, border: '1px solid var(--danger)' }}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--danger)' }}>{error}</p>
        </div>
      )}

      <button className="btn btn-primary" style={{ marginBottom: 16 }} onClick={() => setShowForm(s => !s)}>
        {showForm ? 'Cancel' : '+ Report an incident'}
      </button>

      {showForm && (
        <form onSubmit={report} className="glass-card" style={{ padding: 16, borderRadius: 'var(--radius-xl)', marginBottom: 16, display: 'grid', gap: 10 }}>
          <select value={form.exam_timetable_id} onChange={e => setForm(f => ({ ...f, exam_timetable_id: e.target.value }))} style={inputStyle}>
            <option value="">Not tied to a specific sitting</option>
            {timetable.map(t => (
              <option key={t.id} value={t.id}>{t.exam_date} · {t.class_subjects?.subjects?.name}, {t.class_subjects?.classes?.name}</option>
            ))}
          </select>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <select value={form.incident_type} onChange={e => setForm(f => ({ ...f, incident_type: e.target.value }))} style={inputStyle}>
              <option value="malpractice">Malpractice</option>
              <option value="technical">Technical</option>
              <option value="conduct">Conduct</option>
              <option value="other">Other</option>
            </select>
            <select value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value }))} style={inputStyle}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <textarea placeholder="What happened, exactly: who, what, when" value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={4} required
            style={{ ...inputStyle, resize: 'vertical' }} />
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Submitting…' : 'Submit report'}</button>
        </form>
      )}

      {incidents.length === 0 ? (
        <div className="glass-card-flat" style={{ padding: 20, borderRadius: 'var(--radius-xl)', textAlign: 'center' }}>
          <p style={{ margin: 0, opacity: 0.75 }}>No incidents reported.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {incidents.map(i => (
            <div key={i.id} className={`glass-card ${motion.pressable}`} style={{ padding: 14, borderRadius: 'var(--radius-xl)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <p style={{ margin: 0, fontWeight: 700, textTransform: 'capitalize' }}>{i.incident_type}</p>
                <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'capitalize', color: SEVERITY_COLOR[i.severity] }}>{i.severity}</span>
              </div>
              <p style={{ margin: '4px 0', fontSize: 14 }}>{i.description}</p>
              <p style={{ margin: 0, fontSize: 12, opacity: 0.6 }}>
                Reported by {i.reporter_name} · {new Date(i.created_at).toLocaleDateString()} · Status: <strong style={{ textTransform: 'capitalize' }}>{i.status.replace('_', ' ')}</strong>
              </p>
              {i.resolution_notes && (
                <p style={{ margin: '6px 0 0', fontSize: 13, opacity: 0.8, fontStyle: 'italic' }}>Resolution: {i.resolution_notes}</p>
              )}
              {canResolve && i.status !== 'resolved' && (
                <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                  <input placeholder="Resolution notes (optional)" value={resolvingId === i.id ? resolutionNotes : ''}
                    onFocus={() => setResolvingId(i.id)}
                    onChange={e => { setResolvingId(i.id); setResolutionNotes(e.target.value) }}
                    style={{ ...inputStyle, flex: 1, fontSize: 13 }} />
                  <button className="btn btn-primary" style={{ fontSize: 13, whiteSpace: 'nowrap' }}
                    onClick={() => resolve(i.id)}>
                    Mark resolved
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </RolePageWrapper>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)',
  background: 'var(--surface)', color: 'inherit', fontSize: 14, width: '100%',
}
