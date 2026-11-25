'use client'
// src/app/dashboard/student/mentoring/MentoringClient.tsx
// Student side of Peer Mentoring: My sessions / Find a mentor / Become a mentor.
// All state changes go through SECURITY DEFINER RPCs (request_mentoring,
// create/update/complete/rate_mentoring_session, close_mentoring_pairing,
// report_mentoring); the only direct table writes are mentor applications.

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import RoleSubHeader from '@/components/RoleSubHeader'
import { STUDENT_FEATURE_GROUPS } from '../featureGroups'
import { PeopleIcon, MessageIcon } from '@/components/Icons'
import motion from '@/components/dashboard-motion.module.css'
import { SkeletonList } from '@/components/motion/Skeleton'
import styles from '@/components/mentoring/mentoring.module.css'
import StarRating from '@/components/mentoring/StarRating'
import LeaderboardCard from '@/components/mentoring/LeaderboardCard'
import { useMentoringRealtime } from '@/components/mentoring/useMentoringRealtime'
import {
  DAYS, FALLBACK_LEVELS, MAX_MENTEES, dayLabel, defaultSessionInput, fmtDateTime,
  type MentorRow, type PairingRow, type RequestRow, type SessionRow,
} from '@/components/mentoring/types'

type Tab = 'sessions' | 'find' | 'mentor'
type Flash = { kind: 'ok' | 'err'; text: string } | null
type Result = PromiseLike<{ error: { message: string } | null }>

interface Props { profile: any; school: any; userId: string }
interface Subject { id: string; name: string }

const levelOrder = (a: string, b: string) => {
  const ia = FALLBACK_LEVELS.indexOf(a)
  const ib = FALLBACK_LEVELS.indexOf(b)
  if (ia === -1 && ib === -1) return a.localeCompare(b)
  return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
}

export default function MentoringClient({ profile, school, userId }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const schoolColor = school?.primary_color ?? '#800020'

  const [tab, setTab] = useState<Tab>('sessions')
  const [loading, setLoading] = useState(true)
  const [pairings, setPairings] = useState<PairingRow[]>([])
  const [mentors, setMentors] = useState<MentorRow[]>([])
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [requests, setRequests] = useState<RequestRow[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [levels, setLevels] = useState<string[]>(FALLBACK_LEVELS)
  const [tick, setTick] = useState(0)
  const [flash, setFlash] = useState<Flash>(null)

  const say = useCallback((kind: 'ok' | 'err', text: string) => {
    setFlash({ kind, text })
    window.setTimeout(() => setFlash(null), 5000)
  }, [])

  const load = useCallback(async () => {
    const [p, m, s, r] = await Promise.all([
      supabase.rpc('mentoring_pairings_view'),
      supabase.rpc('mentoring_mentors_view'),
      supabase.from('mentoring_sessions')
        .select('id, pairing_id, session_date, goals, notes, status, completed_at, rating, rating_comment')
        .order('session_date', { ascending: false }),
      supabase.from('mentoring_requests')
        .select('id, subject_id, topic, preferred_day, preferred_time, status, created_at')
        .eq('mentee_id', userId).eq('status', 'pending')
        .order('created_at', { ascending: false }),
    ])
    if (p.error) say('err', p.error.message)
    setPairings((p.data ?? []) as PairingRow[])
    setMentors((m.data ?? []) as MentorRow[])
    setSessions((s.data ?? []) as SessionRow[])
    setRequests((r.data ?? []) as RequestRow[])
    setTick(t => t + 1)
    setLoading(false)
  }, [supabase, userId, say])

  useEffect(() => {
    load()
    ;(async () => {
      if (!school?.id) return
      const [subs, cls] = await Promise.all([
        supabase.from('subjects').select('id, name').eq('school_id', school.id).order('name'),
        supabase.from('classes').select('class_level').eq('school_id', school.id),
      ])
      setSubjects((subs.data ?? []) as Subject[])
      const found = Array.from(new Set((cls.data ?? []).map((c: any) => c.class_level).filter(Boolean))) as string[]
      if (found.length) setLevels(found.sort(levelOrder))
    })()
  }, [load, school?.id, supabase])

  // a teacher approving a match, a new session or a rating shows up without a refresh
  useMentoringRealtime(supabase, load)

  async function act(fn: () => Result, ok: string): Promise<boolean> {
    const { error } = await fn()
    if (error) { say('err', error.message); return false }
    say('ok', ok)
    await load()
    return true
  }

  async function requestHelp(subjectId: string, topic: string, day: string | null, time: string) {
    const { data, error } = await supabase.rpc('request_mentoring', {
      p_subject_id: subjectId, p_topic: topic, p_preferred_day: day, p_preferred_time: time || null,
    })
    if (error) { say('err', error.message); return false }
    const matched = !!(data as { matched?: boolean } | null)?.matched
    say('ok', matched
      ? 'Matched. A teacher approves it before chat opens.'
      : 'No free mentor yet. Your request is saved, try again later.')
    await load()
    if (matched) setTab('sessions')
    return true
  }

  async function applyMentor(input: {
    subjectId: string; classLevels: string[]; days: string[]; note: string; bio: string
  }) {
    const { error } = await supabase.from('mentors').insert({
      school_id: school.id,
      student_id: userId,
      subject_id: input.subjectId,
      class_levels: input.classLevels,
      available_days: input.days,
      available_note: input.note.trim() || null,
      bio: input.bio.trim() || null,
    })
    if (error) {
      say('err', error.code === '23505' ? 'You already applied for this subject.' : error.message)
      return false
    }
    say('ok', 'Application sent. A teacher will review it.')
    await load()
    return true
  }

  const sessionsByPairing = useMemo(() => {
    const map: Record<string, SessionRow[]> = {}
    sessions.forEach(s => { (map[s.pairing_id] ||= []).push(s) })
    return map
  }, [sessions])

  const subjectName = (id: string) => subjects.find(s => s.id === id)?.name ?? 'Subject'
  const open = pairings.filter(p => p.status === 'awaiting_teacher' || p.status === 'active')
  const past = pairings.filter(p => !(p.status === 'awaiting_teacher' || p.status === 'active'))
  const myApplications = mentors.filter(m => m.student_id === userId)

  const cardHandlers = {
    onSchedule: (pairingId: string, when: string, goals: string) =>
      act(() => supabase.rpc('create_mentoring_session', {
        p_pairing_id: pairingId, p_session_date: new Date(when).toISOString(), p_goals: goals || null,
      }), 'Session scheduled.'),
    onSave: (sessionId: string, goals: string, notes: string) =>
      act(() => supabase.rpc('update_mentoring_session', {
        p_session_id: sessionId, p_goals: goals, p_notes: notes,
      }), 'Saved.'),
    onDone: (sessionId: string) =>
      act(() => supabase.rpc('complete_mentoring_session', { p_session_id: sessionId }), 'Session marked done.'),
    onRate: (sessionId: string, rating: number, comment: string) =>
      act(() => supabase.rpc('rate_mentoring_session', {
        p_session_id: sessionId, p_rating: rating, p_comment: comment || null,
      }), 'Thanks for rating.'),
    onClose: (pairingId: string, completed: boolean) =>
      act(() => supabase.rpc('close_mentoring_pairing', {
        p_pairing_id: pairingId, p_reason: null, p_completed: completed,
      }), completed ? 'Mentoring completed.' : 'Pairing ended.'),
    onReport: (pairingId: string, reason: string) =>
      act(() => supabase.rpc('report_mentoring', {
        p_pairing_id: pairingId, p_reason: reason,
      }), 'Report sent to your teacher.'),
  }

  return (
    <RoleSubHeader userId={userId} role="student" profile={profile} school={school}
      title="Peer Mentoring" featureGroups={STUDENT_FEATURE_GROUPS}>
      <div className={styles.root} style={{ ['--mc' as any]: schoolColor }}>
        <div className={styles.main}>
          <div className={styles.tabs} role="tablist">
            <TabButton active={tab === 'sessions'} onClick={() => setTab('sessions')} count={open.length}>My sessions</TabButton>
            <TabButton active={tab === 'find'} onClick={() => setTab('find')} count={requests.length}>Find a mentor</TabButton>
            <TabButton active={tab === 'mentor'} onClick={() => setTab('mentor')}>Be a mentor</TabButton>
          </div>

          {flash && (
            <div className={`${styles.notice} ${flash.kind === 'ok' ? styles.noticeOk : styles.noticeErr}`} role="status">
              {flash.text}
            </div>
          )}

          {tab === 'sessions' && (
            loading ? <SkeletonList count={3} variant="row" /> :
            pairings.length === 0 ? (
              <div className={`${styles.empty} ${motion.riseIn}`}>
                <PeopleIcon size={40} color="var(--text-faint)" strokeWidth={1} />
                <p>No mentoring yet. Ask for a mentor, or apply to help others.</p>
                <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setTab('find')}>Find a mentor</button>
              </div>
            ) : (
              <>
                {open.map(p => (
                  <PairingCard key={p.pairing_id} p={p} sessions={sessionsByPairing[p.pairing_id] ?? []} {...cardHandlers} />
                ))}
                {past.length > 0 && <h3 className={styles.sectionTitle}>Past</h3>}
                {past.map(p => (
                  <PairingCard key={p.pairing_id} p={p} sessions={sessionsByPairing[p.pairing_id] ?? []} {...cardHandlers} />
                ))}
              </>
            )
          )}

          {tab === 'find' && (
            <FindTab
              subjects={subjects}
              requests={requests}
              subjectName={subjectName}
              onRequest={requestHelp}
              onCancel={(id) => act(() => supabase.rpc('cancel_mentoring_request', { p_request_id: id }), 'Request cancelled.')}
            />
          )}

          {tab === 'mentor' && (
            <>
              <LeaderboardCard supabase={supabase} title="Star mentors" myStudentId={userId} refreshKey={tick} />
              <MentorTab
                subjects={subjects}
                levels={levels}
                applications={myApplications}
                onApply={applyMentor}
                onWithdraw={(id) => act(() => supabase.from('mentors').delete().eq('id', id), 'Application withdrawn.')}
              />
            </>
          )}
        </div>
      </div>
    </RoleSubHeader>
  )
}

/* ── Small pieces ────────────────────────────────────────────────────────── */

function TabButton({ active, onClick, count, children }: {
  active: boolean; onClick: () => void; count?: number; children: React.ReactNode
}) {
  return (
    <button role="tab" aria-selected={active} onClick={onClick}
      className={`${styles.tab} ${active ? styles.tabActive : ''}`}>
      {children}
      {!!count && <span className={styles.count}>{count}</span>}
    </button>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    awaiting_teacher: ['Awaiting teacher', styles.badgeWait],
    active: ['Active', styles.badgeOk],
    completed: ['Completed', ''],
    closed: ['Ended', ''],
    rejected: ['Not approved', styles.badgeDanger],
    pending: ['Pending', styles.badgeWait],
    approved: ['Approved', styles.badgeOk],
    suspended: ['Paused', styles.badgeDanger],
    scheduled: ['Scheduled', styles.badgeWait],
    done: ['Done', styles.badgeOk],
    cancelled: ['Cancelled', ''],
  }
  const [label, cls] = map[status] ?? [status, '']
  return <span className={`${styles.badge} ${cls}`}>{label}</span>
}

function DayChips({ value, onChange, single }: {
  value: string[]; onChange: (v: string[]) => void; single?: boolean
}) {
  return (
    <div className={styles.chips}>
      {DAYS.map(d => {
        const on = value.includes(d.key)
        return (
          <button key={d.key} type="button" aria-pressed={on}
            className={`${styles.chip} ${on ? styles.chipOn : ''}`}
            onClick={() => onChange(single ? (on ? [] : [d.key]) : (on ? value.filter(x => x !== d.key) : [...value, d.key]))}>
            {d.label}
          </button>
        )
      })}
    </div>
  )
}

/* ── Pairing card + session page ────────────────────────────────────── */

interface CardProps {
  p: PairingRow
  sessions: SessionRow[]
  onSchedule: (pairingId: string, when: string, goals: string) => Promise<boolean>
  onSave: (sessionId: string, goals: string, notes: string) => Promise<boolean>
  onDone: (sessionId: string) => Promise<boolean>
  onRate: (sessionId: string, rating: number, comment: string) => Promise<boolean>
  onClose: (pairingId: string, completed: boolean) => Promise<boolean>
  onReport: (pairingId: string, reason: string) => Promise<boolean>
}

function PairingCard({ p, sessions, onSchedule, onSave, onDone, onRate, onClose, onReport }: CardProps) {
  const isMentor = p.my_role === 'mentor'
  const partner = isMentor ? p.mentee_name : p.mentor_name
  const isActive = p.status === 'active'
  const [scheduling, setScheduling] = useState(false)
  const [reporting, setReporting] = useState(false)
  const [when, setWhen] = useState(defaultSessionInput())
  const [goals, setGoals] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  async function guard(fn: () => Promise<boolean>) {
    setBusy(true)
    try { return await fn() } finally { setBusy(false) }
  }

  return (
    <div className={`${styles.card} ${motion.riseIn}`}>
      <div className={styles.cardHead}>
        <div>
          <h3 className={styles.cardTitle}>{p.subject_name}</h3>
          <p className={styles.cardSub}>
            {isMentor ? 'You mentor ' : 'Your mentor is '}{partner ?? 'a student'}
            {isMentor && p.mentee_level ? ` (${p.mentee_level})` : ''}
          </p>
        </div>
        <StatusBadge status={p.status} />
      </div>

      {p.topic && <p className={styles.body}>{p.topic}</p>}

      {p.status === 'awaiting_teacher' && (
        <p className={styles.muted}>A teacher has to approve this match before chat opens.</p>
      )}

      {(p.grade_before != null || p.grade_after != null) && (
        <div className={styles.progress}>
          <span>{p.subject_name}</span>
          <span>{p.grade_before != null ? `${Math.round(p.grade_before)}%` : '-'}</span>
          <span className={styles.progressArrow}>to</span>
          <span>{p.grade_after != null ? `${Math.round(p.grade_after)}%` : 'in progress'}</span>
        </div>
      )}

      {isActive && (
        <div className={styles.btnRow}>
          {p.chat_room_id && (
            <Link href={`/dashboard/student/chat/${p.chat_room_id}`} className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSmall}`}>
              <MessageIcon size={14} color="currentColor" /> Open chat
            </Link>
          )}
          <button className={`${styles.btn} ${styles.btnSmall}`} onClick={() => setScheduling(v => !v)}>Plan a session</button>
          <button className={`${styles.btn} ${styles.btnSmall}`} onClick={() => setReporting(v => !v)}>Report</button>
        </div>
      )}

      {scheduling && isActive && (
        <form className={styles.form} onSubmit={async (e) => {
          e.preventDefault()
          const ok = await guard(() => onSchedule(p.pairing_id, when, goals.trim()))
          if (ok) { setScheduling(false); setGoals('') }
        }}>
          <div className={styles.field}>
            <label className={styles.label}>When</label>
            <input type="datetime-local" className={styles.input} value={when} onChange={e => setWhen(e.target.value)} required />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Goals for this session</label>
            <textarea className={styles.textarea} value={goals} onChange={e => setGoals(e.target.value)} placeholder="What should we get done?" />
          </div>
          <button className={`${styles.btn} ${styles.btnPrimary}`} disabled={busy}>Schedule</button>
        </form>
      )}

      {reporting && isActive && (
        <form className={styles.form} onSubmit={async (e) => {
          e.preventDefault()
          if (!reason.trim()) return
          const ok = await guard(() => onReport(p.pairing_id, reason.trim()))
          if (ok) { setReporting(false); setReason('') }
        }}>
          <div className={styles.field}>
            <label className={styles.label}>What happened?</label>
            <textarea className={styles.textarea} value={reason} onChange={e => setReason(e.target.value)} placeholder="Your teacher will see this." required />
          </div>
          <button className={`${styles.btn} ${styles.btnDanger}`} disabled={busy}>Send report</button>
        </form>
      )}

      {sessions.length > 0 && (
        <div className={styles.sessionList}>
          {sessions.map(s => (
            <SessionItem key={s.id} s={s} canEdit={isActive} isMentor={isMentor}
              onSave={onSave} onDone={onDone} onRate={onRate} />
          ))}
        </div>
      )}

      {isActive && (
        <div className={styles.btnRow}>
          {isMentor && p.done_count > 0 && (
            <button className={`${styles.btn} ${styles.btnSmall}`} disabled={busy}
              onClick={() => { if (window.confirm('Mark this mentoring as completed?')) guard(() => onClose(p.pairing_id, true)) }}>
              Mark completed
            </button>
          )}
          <button className={`${styles.btn} ${styles.btnDanger} ${styles.btnSmall}`} disabled={busy}
            onClick={() => { if (window.confirm('End this mentoring pairing? The chat will close.')) guard(() => onClose(p.pairing_id, false)) }}>
            End pairing
          </button>
        </div>
      )}
    </div>
  )
}

function SessionItem({ s, canEdit, isMentor, onSave, onDone, onRate }: {
  s: SessionRow; canEdit: boolean; isMentor: boolean
  onSave: CardProps['onSave']; onDone: CardProps['onDone']; onRate: CardProps['onRate']
}) {
  const [goals, setGoals] = useState(s.goals ?? '')
  const [notes, setNotes] = useState(s.notes ?? '')
  const [stars, setStars] = useState(0)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const editable = canEdit && s.status !== 'cancelled'
  const dirty = goals !== (s.goals ?? '') || notes !== (s.notes ?? '')

  async function run(fn: () => Promise<boolean>) {
    setBusy(true)
    try { await fn() } finally { setBusy(false) }
  }

  return (
    <div className={styles.session}>
      <div className={styles.spread}>
        <strong className={styles.cardTitle}>{fmtDateTime(s.session_date)}</strong>
        <StatusBadge status={s.status} />
      </div>

      {editable ? (
        <>
          <div className={styles.field}>
            <label className={styles.label}>Goals</label>
            <textarea className={styles.textarea} value={goals} onChange={e => setGoals(e.target.value)} />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Notes</label>
            <textarea className={styles.textarea} value={notes} onChange={e => setNotes(e.target.value)} placeholder="What did you cover?" />
          </div>
          <div className={styles.btnRow}>
            {dirty && <button className={`${styles.btn} ${styles.btnSmall}`} disabled={busy} onClick={() => run(() => onSave(s.id, goals, notes))}>Save notes</button>}
            {isMentor && s.status === 'scheduled' && (
              <button className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSmall}`} disabled={busy} onClick={() => run(() => onDone(s.id))}>Session done</button>
            )}
          </div>
        </>
      ) : (
        <>
          {s.goals && <p className={styles.body}><strong>Goals:</strong> {s.goals}</p>}
          {s.notes && <p className={styles.body}><strong>Notes:</strong> {s.notes}</p>}
        </>
      )}

      {s.status === 'done' && s.rating != null && (
        <div className={styles.row}>
          <StarRating value={s.rating} size={16} />
          {s.rating_comment && <span className={styles.muted}>{s.rating_comment}</span>}
        </div>
      )}

      {s.status === 'done' && s.rating == null && !isMentor && (
        <div className={styles.form}>
          <label className={styles.label}>Did it help you?</label>
          <StarRating value={stars} onChange={setStars} size={26} />
          <input className={styles.input} value={comment} maxLength={200} onChange={e => setComment(e.target.value)} placeholder="A short comment (optional)" />
          <button className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSmall}`} disabled={busy || stars === 0}
            onClick={() => run(() => onRate(s.id, stars, comment.trim()))}>Send rating</button>
        </div>
      )}
    </div>
  )
}

/* ── Find a mentor ──────────────────────────────────────────────── */

function FindTab({ subjects, requests, subjectName, onRequest, onCancel }: {
  subjects: Subject[]
  requests: RequestRow[]
  subjectName: (id: string) => string
  onRequest: (subjectId: string, topic: string, day: string | null, time: string) => Promise<boolean>
  onCancel: (id: string) => Promise<boolean>
}) {
  const [subjectId, setSubjectId] = useState('')
  const [topic, setTopic] = useState('')
  const [day, setDay] = useState<string[]>([])
  const [time, setTime] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!subjectId || !topic.trim()) return
    setBusy(true)
    try {
      const ok = await onRequest(subjectId, topic.trim(), day[0] ?? null, time.trim())
      if (ok) { setTopic(''); setTime(''); setDay([]) }
    } finally { setBusy(false) }
  }

  return (
    <>
      <form className={`${styles.card} ${styles.form}`} onSubmit={submit}>
        <div>
          <h3 className={styles.cardTitle}>Ask for help</h3>
          <p className={styles.cardSub}>We match you with a mentor from your school. A teacher approves every match.</p>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Subject</label>
          <select className={styles.select} value={subjectId} onChange={e => setSubjectId(e.target.value)} required>
            <option value="">Choose a subject</option>
            {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>What do you need help with?</label>
          <textarea className={styles.textarea} value={topic} onChange={e => setTopic(e.target.value)} placeholder="e.g. Quadratic equations" required />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Best day (optional)</label>
          <DayChips value={day} onChange={setDay} single />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Best time (optional)</label>
          <input className={styles.input} value={time} maxLength={40} onChange={e => setTime(e.target.value)} placeholder="e.g. 4pm after school" />
        </div>
        <button className={`${styles.btn} ${styles.btnPrimary}`} disabled={busy || !subjectId || !topic.trim()}>
          {busy ? 'Matching...' : 'Find a mentor'}
        </button>
      </form>

      {requests.length > 0 && <h3 className={styles.sectionTitle}>Waiting for a mentor</h3>}
      {requests.map(r => (
        <div key={r.id} className={styles.card}>
          <div className={styles.cardHead}>
            <div>
              <h3 className={styles.cardTitle}>{subjectName(r.subject_id)}</h3>
              <p className={styles.cardSub}>{r.topic}</p>
            </div>
            <StatusBadge status="pending" />
          </div>
          <p className={styles.muted}>
            {[dayLabel(r.preferred_day), r.preferred_time].filter(Boolean).join(' ') || 'Any day'}
          </p>
          <div className={styles.btnRow}>
            <button className={`${styles.btn} ${styles.btnSmall}`} disabled={busy}
              onClick={async () => {
                setBusy(true)
                try { await onRequest(r.subject_id, r.topic, r.preferred_day, r.preferred_time ?? '') } finally { setBusy(false) }
              }}>Try again</button>
            <button className={`${styles.btn} ${styles.btnDanger} ${styles.btnSmall}`} onClick={() => onCancel(r.id)}>Cancel</button>
          </div>
        </div>
      ))}
    </>
  )
}

/* ── Become a mentor ─────────────────────────────────────────────── */

function MentorTab({ subjects, levels, applications, onApply, onWithdraw }: {
  subjects: Subject[]
  levels: string[]
  applications: MentorRow[]
  onApply: (i: { subjectId: string; classLevels: string[]; days: string[]; note: string; bio: string }) => Promise<boolean>
  onWithdraw: (id: string) => Promise<boolean>
}) {
  const [subjectId, setSubjectId] = useState('')
  const [classLevels, setClassLevels] = useState<string[]>([])
  const [days, setDays] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [bio, setBio] = useState('')
  const [busy, setBusy] = useState(false)

  const toggleLevel = (l: string) =>
    setClassLevels(v => v.includes(l) ? v.filter(x => x !== l) : [...v, l])
  const ready = !!subjectId && classLevels.length > 0 && days.length > 0

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    try {
      const ok = await onApply({ subjectId, classLevels, days, note, bio })
      if (ok) { setSubjectId(''); setClassLevels([]); setDays([]); setNote(''); setBio('') }
    } finally { setBusy(false) }
  }

  return (
    <>
      <form className={`${styles.card} ${styles.form}`} onSubmit={submit}>
        <div>
          <h3 className={styles.cardTitle}>Become a mentor</h3>
          <p className={styles.cardSub}>
            Good at a subject? Help a junior. A teacher reviews your application, and you can have at most {MAX_MENTEES} mentees at a time.
          </p>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Subject you are strong in</label>
          <select className={styles.select} value={subjectId} onChange={e => setSubjectId(e.target.value)} required>
            <option value="">Choose a subject</option>
            {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Classes you can help</label>
          <div className={styles.chips}>
            {levels.map(l => (
              <button key={l} type="button" aria-pressed={classLevels.includes(l)}
                className={`${styles.chip} ${classLevels.includes(l) ? styles.chipOn : ''}`}
                onClick={() => toggleLevel(l)}>{l}</button>
            ))}
          </div>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Days you are free</label>
          <DayChips value={days} onChange={setDays} />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Time (optional)</label>
          <input className={styles.input} value={note} maxLength={60} onChange={e => setNote(e.target.value)} placeholder="e.g. after 3:30pm" />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Why you would be a good mentor (optional)</label>
          <textarea className={styles.textarea} value={bio} maxLength={300} onChange={e => setBio(e.target.value)} />
        </div>
        <button className={`${styles.btn} ${styles.btnPrimary}`} disabled={busy || !ready}>Apply</button>
      </form>

      {applications.length > 0 && <h3 className={styles.sectionTitle}>My applications</h3>}
      {applications.map(m => (
        <div key={m.mentor_id} className={styles.card}>
          <div className={styles.cardHead}>
            <div>
              <h3 className={styles.cardTitle}>{m.subject_name}</h3>
              <p className={styles.cardSub}>{m.class_levels.join(', ')}</p>
            </div>
            <StatusBadge status={m.status} />
          </div>
          <div className={styles.chips}>
            {m.available_days.map(d => <span key={d} className={styles.chipStatic}>{dayLabel(d)}</span>)}
          </div>
          {m.status === 'approved' && (
            <div className={styles.row}>
              <span className={styles.muted}>{m.active_mentees}/{MAX_MENTEES} mentees</span>
              {m.avg_rating != null && <><StarRating value={m.avg_rating} size={14} /><span className={styles.muted}>{m.avg_rating}</span></>}
              <span className={styles.muted}>{m.sessions_done} sessions</span>
            </div>
          )}
          {m.review_note && <p className={styles.quote}>{m.review_note}</p>}
          {m.status === 'pending' && (
            <div className={styles.btnRow}>
              <button className={`${styles.btn} ${styles.btnDanger} ${styles.btnSmall}`} onClick={() => onWithdraw(m.mentor_id)}>Withdraw</button>
            </div>
          )}
        </div>
      ))}
    </>
  )
}
