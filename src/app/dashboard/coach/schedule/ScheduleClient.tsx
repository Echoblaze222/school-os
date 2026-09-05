'use client'

import { useEffect, useState } from 'react'
import RolePageWrapper from '@/components/RolePageWrapper'
import { CalendarIcon, PlusIcon, XIcon, CheckIcon } from '@/components/Icons'
import { SkeletonList } from '@/components/motion/Skeleton'
import EmptyState from '@/components/motion/EmptyState'
import ActionButton from '@/components/motion/ActionButton'
import { Toast, useToast } from '@/components/motion/Toast'
import styles from '../coach.module.css'
import motion from '@/components/dashboard-motion.module.css'
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh'

interface Props { profile: any; school: any; userId: string }

const ATTENDANCE_STATUSES = ['present', 'absent', 'excused', 'injured'] as const
const STATUS_COLOR: Record<string, string> = {
  present: 'var(--status-ok, #10B981)', absent: '#EF4444',
  excused: 'var(--status-warn, #E4572E)', injured: '#EF4444',
}

function one<T>(v: T | T[] | null): T | null { return Array.isArray(v) ? (v[0] ?? null) : v }
function formatDateTime(iso: string) { return new Date(iso).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }) }

export default function ScheduleClient({ profile, school, userId }: Props) {
  const { toast, showToast } = useToast()
  const [sessions, setSessions] = useState<any[]>([])
  const [teams, setTeams] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [attendanceSession, setAttendanceSession] = useState<any | null>(null)
  const [markingStudentId, setMarkingStudentId] = useState<string | null>(null)

  const [teamId, setTeamId] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [location, setLocation] = useState('')
  const [focus, setFocus] = useState('')

  async function loadAll() {
    setLoading(true)
    try {
      const [sessionsRes, teamsRes] = await Promise.all([
        fetch('/api/coach/sessions'), fetch('/api/coach/teams'),
      ])
      const sessionsJson = await sessionsRes.json()
      const teamsJson = await teamsRes.json()
      setSessions(sessionsJson.ok ? sessionsJson.sessions : [])
      setTeams(teamsJson.ok ? teamsJson.teams : [])
    } finally { setLoading(false) }
  }

  useEffect(() => { loadAll() }, [])

  useRealtimeRefresh({ tables: ['training_sessions', 'training_attendance'], onChange: loadAll })

  async function createSession() {
    if (!teamId || !scheduledAt) { showToast('Pick a team and a time.'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/coach/sessions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, scheduledAt: new Date(scheduledAt).toISOString(), location, focus }),
      })
      const json = await res.json()
      if (!json.ok) { showToast(json.error ?? 'Could not create session.'); return }
      showToast('Training session scheduled.')
      setShowForm(false); setTeamId(''); setScheduledAt(''); setLocation(''); setFocus('')
      loadAll()
    } finally { setSaving(false) }
  }

  async function markAttendance(sessionId: string, studentId: string, status: string) {
    setMarkingStudentId(studentId)
    try {
      const res = await fetch(`/api/coach/sessions/${sessionId}/attendance`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, status }),
      })
      const json = await res.json()
      if (!json.ok) { showToast(json.error ?? 'Could not mark attendance.'); return }
      loadAll()
      // keep the modal's local view in sync without a full reload
      setAttendanceSession((prev: any) => prev ? {
        ...prev,
        attendance: [...(prev.attendance ?? []).filter((a: any) => a.student_id !== studentId), { student_id: studentId, status }],
      } : prev)
    } finally { setMarkingStudentId(null) }
  }

  function statusFor(session: any, studentId: string) {
    return (session.attendance ?? []).find((a: any) => a.student_id === studentId)?.status ?? null
  }

  return (
    <RolePageWrapper userId={userId} role="coach" profile={profile} school={school} title="Schedule">
      <main className={styles.main}>
        <ActionButton onClick={() => setShowForm(true)} icon={<PlusIcon size={16} />} fullWidth disabled={teams.length === 0}>
          {teams.length === 0 ? 'Create a team first' : 'Schedule a Session'}
        </ActionButton>

        <p className={styles.sectionLabel} style={{ marginTop: 'var(--space-5)' }}>Sessions</p>
        {loading ? <SkeletonList count={4} variant="card" /> : sessions.length === 0 ? (
          <EmptyState icon={<CalendarIcon size={28} />} title="No training sessions yet" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sessions.map(s => {
              const team = one(s.team)
              const upcoming = new Date(s.scheduled_at) > new Date()
              return (
                <button key={s.id} onClick={() => setAttendanceSession(s)}
                  className={`glass-card ${motion.pressable}`}
                  style={{ padding: 14, borderRadius: 'var(--radius-lg)', border: 'none', textAlign: 'left', cursor: 'pointer', width: '100%' }}>
                  <p style={{ fontWeight: 700, fontSize: '0.86rem', margin: 0 }}>{team?.name ?? 'Team'}</p>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '2px 0 0' }}>
                    {formatDateTime(s.scheduled_at)}{s.location ? ` · ${s.location}` : ''}
                  </p>
                  {s.focus && <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>{s.focus}</p>}
                  <p style={{ fontSize: '0.7rem', color: upcoming ? 'var(--brand)' : 'var(--text-muted)', margin: '6px 0 0' }}>
                    {(s.attendance ?? []).length} marked · Tap to take attendance
                  </p>
                </button>
              )
            })}
          </div>
        )}
        <div style={{ height: 100 }} />
      </main>

      {showForm && (
        <div onClick={() => setShowForm(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', zIndex: 100 }}>
          <div onClick={e => e.stopPropagation()} className="glass-card" style={{ width: '100%', maxHeight: '88vh', overflowY: 'auto', padding: 20, borderRadius: '20px 20px 0 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <p style={{ fontWeight: 800, fontSize: '1rem', margin: 0 }}>Schedule a Session</p>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><XIcon size={18} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <select value={teamId} onChange={e => setTeamId(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)' }}>
                <option value="">Select team</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)' }} />
              <input placeholder="Location" value={location} onChange={e => setLocation(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)' }} />
              <input placeholder="Focus (e.g. Set pieces)" value={focus} onChange={e => setFocus(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)' }} />
              <ActionButton onClick={createSession} loading={saving} loadingLabel="Scheduling…" fullWidth>Schedule</ActionButton>
            </div>
          </div>
        </div>
      )}

      {attendanceSession && (() => {
        const team = one(attendanceSession.team)
        const members = teams.find(t => t.id === team?.id)?.members ?? []
        return (
          <div onClick={() => setAttendanceSession(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', zIndex: 100 }}>
            <div onClick={e => e.stopPropagation()} className="glass-card" style={{ width: '100%', maxHeight: '88vh', overflowY: 'auto', padding: 20, borderRadius: '20px 20px 0 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <p style={{ fontWeight: 800, fontSize: '1rem', margin: 0 }}>Attendance - {team?.name}</p>
                <button onClick={() => setAttendanceSession(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><XIcon size={18} /></button>
              </div>
              {members.length === 0 ? (
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>No players on this team's roster yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {members.map((m: any) => {
                    const student = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
                    const current = statusFor(attendanceSession, m.student_id)
                    return (
                      <div key={m.id} style={{ padding: 10, borderRadius: 10, background: 'var(--glass-bg)' }}>
                        <p style={{ fontSize: '0.84rem', fontWeight: 700, margin: '0 0 6px' }}>{student?.full_name}</p>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {ATTENDANCE_STATUSES.map(st => (
                            <button key={st} onClick={() => markAttendance(attendanceSession.id, m.student_id, st)}
                              disabled={markingStudentId === m.student_id}
                              style={{
                                flex: 1, padding: '6px 4px', borderRadius: 8, fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer', textTransform: 'capitalize',
                                border: current === st ? 'none' : '1px solid var(--glass-border)',
                                background: current === st ? STATUS_COLOR[st] : 'transparent',
                                color: current === st ? '#fff' : 'var(--text-secondary)',
                              }}>
                              {st}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )
      })()}

      <Toast toast={toast} />
    </RolePageWrapper>
  )
}
