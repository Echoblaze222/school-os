'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { CalendarIcon, SearchIcon, XIcon } from '@/components/Icons'
import { SkeletonList } from '@/components/motion/Skeleton'
import EmptyState from '@/components/motion/EmptyState'
import ActionButton from '@/components/motion/ActionButton'
import { Toast, useToast } from '@/components/motion/Toast'
import motion from '@/components/dashboard-motion.module.css'

interface Props { profile: any; school: any; userId: string }

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function AppointmentsClient({ profile, school, userId }: Props) {
  const [scope, setScope] = useState<'upcoming' | 'past'>('upcoming')
  const [sessions, setSessions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const { toast, showToast } = useToast()

  async function load(s: 'upcoming' | 'past') {
    setLoading(true)
    try {
      const res = await fetch(`/api/counselor/appointments?scope=${s}`)
      const json = await res.json()
      setSessions(res.ok ? (json.sessions ?? []) : [])
      if (!res.ok) showToast(json.error ?? 'Could not load appointments.')
    } catch {
      showToast('Network error. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(scope) }, [scope])

  async function markStatus(id: string, status: string) {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, status } : s))
    try {
      const res = await fetch(`/api/counselor/appointments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) { load(scope); showToast('Could not update the appointment.') }
    } catch {
      load(scope)
      showToast('Network error. Please try again.')
    }
  }

  return (
    <RolePageWrapper userId={userId} role="counselor" profile={profile} school={school} title="Appointments">
      <Toast toast={toast} />

      <div className={motion.riseIn} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['upcoming', 'past'] as const).map(s => (
          <button
            key={s}
            onClick={() => setScope(s)}
            className={`${motion.pressable} ${motion.focusable}`}
            style={{
              flex: 1, height: 36, borderRadius: 9, fontSize: '0.8rem', fontWeight: 700,
              textTransform: 'capitalize', cursor: 'pointer',
              border: scope === s ? 'none' : '1px solid var(--glass-border)',
              background: scope === s ? 'var(--brand)' : 'var(--glass-bg)',
              color: scope === s ? '#fff' : 'var(--text-secondary)',
            }}
          >
            {s}
          </button>
        ))}
      </div>

      <ActionButton onClick={() => setShowNew(true)} fullWidth style={{ marginBottom: 16 }}>
        + Schedule appointment
      </ActionButton>

      {showNew && (
        <NewSessionForm
          schoolId={school?.id}
          onClose={() => setShowNew(false)}
          onCreated={() => { setShowNew(false); setScope('upcoming'); load('upcoming'); showToast('Appointment scheduled.') }}
          onError={(msg) => showToast(msg)}
        />
      )}

      {loading ? (
        <SkeletonList count={4} variant="row" />
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={<CalendarIcon size={32} color="var(--text-muted)" />}
          title={scope === 'upcoming' ? 'No upcoming appointments' : 'No past appointments'}
          subtitle={scope === 'upcoming' ? 'Schedule one above to see it here.' : 'Completed and cancelled appointments will show up here.'}
        />
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {sessions.map((s: any, i: number) => (
            <div key={s.id} className={`glass-card ${motion.riseIn}`} style={{ padding: 14, borderRadius: 'var(--radius-lg)', animationDelay: `${i * 40}ms` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <p style={{ fontWeight: 700, fontSize: '0.88rem', margin: 0 }}>{s.student?.full_name ?? 'Student'}</p>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>{formatDate(s.scheduled_at)} · {s.duration_minutes} min</p>
                  {s.location && <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>{s.location}</p>}
                </div>
                <span style={{
                  fontSize: '0.68rem', fontWeight: 700, padding: '3px 9px', borderRadius: 999,
                  background: 'var(--input-bg)', color: 'var(--text-secondary)', textTransform: 'capitalize',
                }}>
                  {s.status.replace('_', ' ')}
                </span>
              </div>
              {s.status === 'scheduled' && (
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <ActionButton onClick={() => markStatus(s.id, 'completed')} variant="ghost" fullWidth>Mark completed</ActionButton>
                  <ActionButton onClick={() => markStatus(s.id, 'no_show')} variant="ghost" fullWidth>No-show</ActionButton>
                  <ActionButton onClick={() => markStatus(s.id, 'cancelled')} variant="danger" fullWidth>Cancel</ActionButton>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </RolePageWrapper>
  )
}

function NewSessionForm({
  schoolId, onClose, onCreated, onError,
}: { schoolId?: string; onClose: () => void; onCreated: () => void; onError: (msg: string) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [selected, setSelected] = useState<any | null>(null)
  const [scheduledAt, setScheduledAt] = useState('')
  const [duration, setDuration] = useState(30)
  const [location, setLocation] = useState('')
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!schoolId || query.trim().length < 2 || selected) { setResults([]); return }
    let cancelled = false
    setSearching(true)
    const supabase = createClient()
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, class_level')
        .eq('school_id', schoolId)
        .eq('role', 'student')
        .ilike('full_name', `%${query.trim()}%`)
        .limit(8)
      if (!cancelled) { setResults(data ?? []); setSearching(false) }
    }, 300)
    return () => { cancelled = true; clearTimeout(t) }
  }, [query, schoolId, selected])

  async function submit() {
    if (!selected || !scheduledAt) { onError('Select a student and a time.'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/counselor/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: selected.id, scheduledAt, durationMinutes: duration, location }),
      })
      const json = await res.json()
      if (!res.ok) { onError(json.error ?? 'Could not schedule the appointment.'); setSaving(false); return }
      onCreated()
    } catch {
      onError('Network error. Please try again.')
      setSaving(false)
    }
  }

  return (
    <div className={`glass-card ${motion.riseIn}`} style={{ padding: 16, borderRadius: 'var(--radius-lg)', marginBottom: 16, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={{ fontWeight: 700, fontSize: '0.9rem', margin: 0 }}>Schedule appointment</p>
        <button onClick={onClose} className={motion.pressable} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
          <XIcon size={18} color="var(--text-muted)" />
        </button>
      </div>

      {selected ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: 9, background: 'var(--input-bg)' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{selected.full_name}</span>
          <button onClick={() => { setSelected(null); setQuery('') }} className={motion.pressable} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.75rem', cursor: 'pointer' }}>
            Change
          </button>
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', height: 40, borderRadius: 9, border: '1px solid var(--input-border)', background: 'var(--input-bg)' }}>
            <SearchIcon size={16} color="var(--text-muted)" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search student by name"
              style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: '0.85rem', color: 'var(--text-primary)' }}
            />
          </div>
          {(searching || results.length > 0) && query.trim().length >= 2 && (
            <div className="glass-card" style={{ marginTop: 6, borderRadius: 9, overflow: 'hidden' }}>
              {searching ? (
                <div style={{ padding: 12, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Searching…</div>
              ) : (
                results.map(r => (
                  <button
                    key={r.id}
                    onClick={() => { setSelected(r); setResults([]) }}
                    className={motion.pressable}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-primary)' }}
                  >
                    {r.full_name} <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{r.class_level}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}

      <input
        type="datetime-local"
        value={scheduledAt}
        onChange={e => setScheduledAt(e.target.value)}
        style={{ height: 38, borderRadius: 8, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', padding: '0 10px', fontSize: '0.8rem' }}
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
        <select value={duration} onChange={e => setDuration(Number(e.target.value))}
          style={{ height: 38, borderRadius: 8, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', padding: '0 8px', fontSize: '0.8rem' }}>
          <option value={15}>15 min</option>
          <option value={30}>30 min</option>
          <option value={45}>45 min</option>
          <option value={60}>60 min</option>
        </select>
        <input
          value={location}
          onChange={e => setLocation(e.target.value)}
          placeholder="Location (optional)"
          style={{ height: 38, borderRadius: 8, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', padding: '0 10px', fontSize: '0.8rem' }}
        />
      </div>

      <ActionButton onClick={submit} loading={saving} loadingLabel="Scheduling…" disabled={!selected || !scheduledAt} fullWidth>
        Schedule
      </ActionButton>
    </div>
  )
}
