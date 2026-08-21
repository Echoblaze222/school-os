'use client'

import { useEffect, useState } from 'react'
import RolePageWrapper from '@/components/RolePageWrapper'
import { ClockIcon, CheckCircleIcon, PlusIcon, AlertIcon, CalendarIcon } from '@/components/Icons'
import { SkeletonList } from '@/components/motion/Skeleton'
import EmptyState from '@/components/motion/EmptyState'
import ActionButton from '@/components/motion/ActionButton'
import { Toast, useToast } from '@/components/motion/Toast'
import motion from '@/components/dashboard-motion.module.css'

interface Props { profile: any; school: any; userId: string; caseId: string }

const RISK_COLOR: Record<string, string> = {
  low: 'var(--status-ok, #10B981)',
  moderate: 'var(--status-warn, #E4572E)',
  high: '#EF4444',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function CaseDetailClient({ profile, school, userId, caseId }: Props) {
  const [data, setData] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [noteText, setNoteText] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [showFollowUp, setShowFollowUp] = useState(false)
  const [followUpDue, setFollowUpDue] = useState('')
  const [followUpNote, setFollowUpNote] = useState('')
  const [savingFollowUp, setSavingFollowUp] = useState(false)
  const [closing, setClosing] = useState(false)
  const { toast, showToast } = useToast()

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/api/counselor/cases/${caseId}`)
      const json = await res.json()
      if (!res.ok) { showToast(json.error ?? 'Could not load this case.'); setData(null) }
      else setData(json)
    } catch {
      showToast('Network error. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [caseId])

  async function addNote() {
    if (!noteText.trim()) return
    setSavingNote(true)
    try {
      const res = await fetch(`/api/counselor/cases/${caseId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: noteText }),
      })
      const json = await res.json()
      if (!res.ok) { showToast(json.error ?? 'Could not save the note.'); return }
      setNoteText('')
      setData((d: any) => d ? { ...d, notes: [json.note, ...d.notes] } : d)
      showToast('Note saved.')
    } catch {
      showToast('Network error. Please try again.')
    } finally {
      setSavingNote(false)
    }
  }

  async function addFollowUp() {
    if (!followUpDue || !followUpNote.trim()) { showToast('Set a due date and a note.'); return }
    setSavingFollowUp(true)
    try {
      const res = await fetch('/api/counselor/follow-ups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId, dueAt: followUpDue, note: followUpNote }),
      })
      const json = await res.json()
      if (!res.ok) { showToast(json.error ?? 'Could not create the follow-up.'); return }
      setFollowUpDue(''); setFollowUpNote(''); setShowFollowUp(false)
      setData((d: any) => d ? { ...d, followUps: [...d.followUps, json.followUp] } : d)
      showToast('Follow-up scheduled.')
    } catch {
      showToast('Network error. Please try again.')
    } finally {
      setSavingFollowUp(false)
    }
  }

  async function markFollowUpDone(id: string) {
    setData((d: any) => d ? { ...d, followUps: d.followUps.map((f: any) => f.id === id ? { ...f, status: 'done' } : f) } : d)
    try {
      const res = await fetch(`/api/counselor/follow-ups/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done' }),
      })
      if (!res.ok) { load(); showToast('Could not update the follow-up.') }
    } catch {
      load()
      showToast('Network error. Please try again.')
    }
  }

  async function setRisk(riskLevel: string) {
    setData((d: any) => d ? { ...d, case: { ...d.case, risk_level: riskLevel } } : d)
    try {
      const res = await fetch(`/api/counselor/cases/${caseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ riskLevel }),
      })
      if (!res.ok) { load(); showToast('Could not update risk level.') }
    } catch {
      load()
      showToast('Network error. Please try again.')
    }
  }

  async function setStatus(status: 'open' | 'monitoring' | 'closed') {
    setClosing(true)
    try {
      const res = await fetch(`/api/counselor/cases/${caseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const json = await res.json()
      if (!res.ok) { showToast(json.error ?? 'Could not update the case.'); return }
      showToast(status === 'closed' ? 'Case closed.' : 'Case updated.')
      load()
    } catch {
      showToast('Network error. Please try again.')
    } finally {
      setClosing(false)
    }
  }

  if (loading) {
    return (
      <RolePageWrapper userId={userId} role="counselor" profile={profile} school={school} title="Case">
        <SkeletonList count={3} variant="card" />
      </RolePageWrapper>
    )
  }

  if (!data) {
    return (
      <RolePageWrapper userId={userId} role="counselor" profile={profile} school={school} title="Case">
        <Toast toast={toast} />
        <EmptyState
          icon={<AlertIcon size={32} color="var(--text-muted)" />}
          title="Case not found"
          subtitle="This case may have been closed or the link may be incorrect."
        />
      </RolePageWrapper>
    )
  }

  const { case: c, notes, followUps, sessions } = data
  const pendingFollowUps = followUps.filter((f: any) => f.status === 'pending')

  return (
    <RolePageWrapper userId={userId} role="counselor" profile={profile} school={school} title={c.student?.full_name ?? 'Case'}>
      <Toast toast={toast} />

      <div className={`glass-card ${motion.riseIn}`} style={{ padding: 16, borderRadius: 'var(--radius-lg)', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div>
            <p style={{ fontWeight: 700, fontSize: '1rem', margin: 0 }}>{c.student?.full_name}</p>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>{c.student?.class_level}</p>
          </div>
          <span style={{
            fontSize: '0.7rem', fontWeight: 700, padding: '4px 10px', borderRadius: 999,
            textTransform: 'capitalize', background: 'var(--input-bg)', color: 'var(--text-secondary)',
          }}>
            {c.status}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {(['low', 'moderate', 'high'] as const).map(r => (
            <button
              key={r}
              onClick={() => setRisk(r)}
              className={motion.pressable}
              style={{
                flex: 1, height: 30, borderRadius: 7, fontSize: '0.72rem', fontWeight: 700,
                textTransform: 'capitalize', cursor: 'pointer',
                border: c.risk_level === r ? 'none' : `1px solid ${RISK_COLOR[r]}40`,
                background: c.risk_level === r ? RISK_COLOR[r] : 'transparent',
                color: c.risk_level === r ? '#fff' : RISK_COLOR[r],
              }}
            >
              {r} risk
            </button>
          ))}
        </div>

        {c.status !== 'closed' && (
          <div style={{ display: 'flex', gap: 8 }}>
            {c.status === 'open' && (
              <ActionButton onClick={() => setStatus('monitoring')} variant="ghost" fullWidth>Move to monitoring</ActionButton>
            )}
            {c.status === 'monitoring' && (
              <ActionButton onClick={() => setStatus('open')} variant="ghost" fullWidth>Reopen actively</ActionButton>
            )}
            <ActionButton onClick={() => setStatus('closed')} loading={closing} variant="danger" fullWidth>Close case</ActionButton>
          </div>
        )}
      </div>

      <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', margin: '20px 0 8px' }}>
        Follow-ups
      </p>
      {pendingFollowUps.length === 0 ? (
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 10px' }}>No pending follow-ups.</p>
      ) : (
        <div style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
          {pendingFollowUps.map((f: any) => (
            <div key={f.id} className="glass-card" style={{ padding: 12, borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <div>
                <p style={{ fontSize: '0.82rem', margin: 0 }}>{f.note}</p>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '3px 0 0' }}>Due {formatDate(f.due_at)}</p>
              </div>
              <button onClick={() => markFollowUpDone(f.id)} className={motion.pressable} style={{ background: 'none', border: 'none', cursor: 'pointer' }} title="Mark done">
                <CheckCircleIcon size={20} color="var(--status-ok, #10B981)" />
              </button>
            </div>
          ))}
        </div>
      )}

      {showFollowUp ? (
        <div className={`glass-card ${motion.riseIn}`} style={{ padding: 12, borderRadius: 10, display: 'grid', gap: 8, marginBottom: 16 }}>
          <input
            type="datetime-local"
            value={followUpDue}
            onChange={e => setFollowUpDue(e.target.value)}
            style={{ height: 36, borderRadius: 7, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', padding: '0 10px', fontSize: '0.8rem' }}
          />
          <textarea
            value={followUpNote}
            onChange={e => setFollowUpNote(e.target.value)}
            placeholder="What to check in on"
            rows={2}
            style={{ borderRadius: 7, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', padding: 10, fontSize: '0.8rem', resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <ActionButton onClick={() => setShowFollowUp(false)} variant="ghost" fullWidth>Cancel</ActionButton>
            <ActionButton onClick={addFollowUp} loading={savingFollowUp} loadingLabel="Saving…" fullWidth>Save</ActionButton>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowFollowUp(true)} className={motion.pressable}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--brand)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', marginBottom: 16 }}>
          <PlusIcon size={16} /> Add follow-up
        </button>
      )}

      {sessions.length > 0 && (
        <>
          <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', margin: '4px 0 8px' }}>
            Appointments
          </p>
          <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
            {sessions.map((s: any) => (
              <div key={s.id} className="glass-card" style={{ padding: 12, borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                <CalendarIcon size={16} color="var(--text-muted)" />
                <div>
                  <p style={{ fontSize: '0.82rem', margin: 0 }}>{formatDate(s.scheduled_at)}</p>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '2px 0 0', textTransform: 'capitalize' }}>{s.status}{s.location ? ` · ${s.location}` : ''}</p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', margin: '4px 0 8px' }}>
        Confidential notes
      </p>
      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '0 0 10px' }}>
        Visible only to you. Notes cannot be edited or deleted once saved.
      </p>

      <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
        <textarea
          value={noteText}
          onChange={e => setNoteText(e.target.value)}
          placeholder="Add a confidential note about this session or observation"
          rows={3}
          style={{ borderRadius: 9, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', padding: 10, fontSize: '0.82rem', resize: 'vertical' }}
        />
        <ActionButton onClick={addNote} loading={savingNote} loadingLabel="Saving…" disabled={!noteText.trim()}>
          Save note
        </ActionButton>
      </div>

      {notes.length === 0 ? (
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No notes yet.</p>
      ) : (
        <div style={{ display: 'grid', gap: 10, marginBottom: 40 }}>
          {notes.map((n: any) => (
            <div key={n.id} className="glass-card" style={{ padding: 12, borderRadius: 10 }}>
              <p style={{ fontSize: '0.82rem', margin: 0, whiteSpace: 'pre-wrap' }}>{n.note}</p>
              <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '8px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}>
                <ClockIcon size={12} /> {formatDate(n.created_at)}
              </p>
            </div>
          ))}
        </div>
      )}
    </RolePageWrapper>
  )
}
