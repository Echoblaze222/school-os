'use client'
// src/components/mentoring/StaffMentoringClient.tsx
// Staff side of Peer Mentoring, shared by the teacher, principal and vice-principal pages:
// Approvals / Active pairs / Reports / Star mentors.
// Every action is a SECURITY DEFINER RPC that re-checks the caller. Approving is limited to the
// principal / vice-principal or a teacher assigned to the student's class (mentoring_review_scope
// tells the UI which rows are actionable); reading, closing a pairing and resolving reports stay
// open to every teacher in the school so nobody is blind to a mentoring chat.

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import RoleSubHeader from '@/components/RoleSubHeader'
import type { FeatureGroup } from '@/components/AllFeaturesSheet'
import { PeopleIcon, MessageIcon, ShieldIcon } from '@/components/Icons'
import motion from '@/components/dashboard-motion.module.css'
import { SkeletonList } from '@/components/motion/Skeleton'
import styles from '@/components/mentoring/mentoring.module.css'
import StarRating from '@/components/mentoring/StarRating'
import LeaderboardCard from '@/components/mentoring/LeaderboardCard'
import { useMentoringRealtime } from '@/components/mentoring/useMentoringRealtime'
import {
  MAX_MENTEES, dayLabel, fmtDateTime,
  type MentorRow, type PairingRow, type ReportRow,
} from '@/components/mentoring/types'

type Tab = 'approvals' | 'pairs' | 'reports' | 'stars'
type Flash = { kind: 'ok' | 'err'; text: string } | null
type Result = PromiseLike<{ error: { message: string } | null }>

// Soft bar shown to the reviewer; the teacher still decides (no hard gate)
const GOOD_AVG = 80

interface Props {
  profile: any
  school: any
  userId: string
  role: 'teacher' | 'principal' | 'vice-principal'
  featureGroups: FeatureGroup[]
  /** where "Read chat" goes for a room (not every role has a /chat/[roomId] page) */
  roomHref: (roomId: string) => string
}

const BADGES: Record<string, [string, string]> = {
  awaiting_teacher: ['Awaiting approval', styles.badgeWait],
  active: ['Active', styles.badgeOk],
  completed: ['Completed', ''],
  closed: ['Ended', ''],
  rejected: ['Not approved', styles.badgeDanger],
  pending: ['Pending', styles.badgeWait],
  approved: ['Approved', styles.badgeOk],
  suspended: ['Paused', styles.badgeDanger],
  open: ['Open', styles.badgeWait],
  resolved: ['Resolved', ''],
}

export default function StaffMentoringClient({ profile, school, userId, role, featureGroups, roomHref }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const schoolColor = school?.primary_color ?? '#800020'

  const [tab, setTab] = useState<Tab>('approvals')
  const [loading, setLoading] = useState(true)
  const [mentors, setMentors] = useState<MentorRow[]>([])
  const [pairings, setPairings] = useState<PairingRow[]>([])
  const [reports, setReports] = useState<ReportRow[]>([])
  const [scope, setScope] = useState<Set<string>>(new Set())
  const [tick, setTick] = useState(0)
  const [flash, setFlash] = useState<Flash>(null)

  const say = useCallback((kind: 'ok' | 'err', text: string) => {
    setFlash({ kind, text })
    window.setTimeout(() => setFlash(null), 5000)
  }, [])

  const load = useCallback(async () => {
    const [m, p, r, s] = await Promise.all([
      supabase.rpc('mentoring_mentors_view'),
      supabase.rpc('mentoring_pairings_view'),
      supabase.rpc('mentoring_reports_view'),
      supabase.rpc('mentoring_review_scope'),
    ])
    const failed = m.error ?? p.error ?? r.error ?? s.error
    if (failed) say('err', failed.message)
    setMentors((m.data ?? []) as MentorRow[])
    setPairings((p.data ?? []) as PairingRow[])
    setReports((r.data ?? []) as ReportRow[])
    setScope(new Set(((s.data ?? []) as { kind: string; id: string }[]).map(x => `${x.kind}:${x.id}`)))
    setTick(t => t + 1)
    setLoading(false)
  }, [supabase, say])

  useEffect(() => { load() }, [load])
  useMentoringRealtime(supabase, load)

  async function act(fn: () => Result, ok: string): Promise<boolean> {
    const { error } = await fn()
    if (error) { say('err', error.message); return false }
    say('ok', ok)
    await load()
    return true
  }

  const reviewMentor = (id: string, decision: 'approved' | 'rejected' | 'suspended', note: string) =>
    act(() => supabase.rpc('review_mentor', { p_mentor_id: id, p_decision: decision, p_note: note || null }),
      decision === 'approved' ? 'Mentor approved.' : decision === 'rejected' ? 'Application declined.' : 'Mentor paused.')

  const reviewPairing = (id: string, approve: boolean, note: string) =>
    act(() => supabase.rpc('review_pairing', { p_pairing_id: id, p_approve: approve, p_note: note || null }),
      approve ? 'Match approved. The chat is open.' : 'Match declined.')

  const closePairing = (id: string, completed: boolean, reason: string) =>
    act(() => supabase.rpc('close_mentoring_pairing', { p_pairing_id: id, p_reason: reason || null, p_completed: completed }),
      completed ? 'Marked as completed.' : 'Pairing closed.')

  const resolveReport = (id: string) =>
    act(() => supabase.rpc('resolve_mentoring_report', { p_report_id: id }), 'Report resolved.')

  const canReview = (kind: 'mentor' | 'pairing', id: string) => scope.has(`${kind}:${id}`)

  const mentorById = useMemo(() => {
    const map: Record<string, MentorRow> = {}
    mentors.forEach(m => { map[m.mentor_id] = m })
    return map
  }, [mentors])

  const pendingMentors = mentors.filter(m => m.status === 'pending')
  const awaiting = pairings.filter(p => p.status === 'awaiting_teacher')
  const active = pairings.filter(p => p.status === 'active')
  const past = pairings.filter(p => !['awaiting_teacher', 'active'].includes(p.status))
  const approvedMentors = mentors.filter(m => m.status === 'approved')
  const openReports = reports.filter(r => r.status === 'open')
  const resolvedReports = reports.filter(r => r.status === 'resolved')

  // what is waiting on THIS person comes first and drives the tab badge
  const mineAwaiting = awaiting.filter(p => canReview('pairing', p.pairing_id))
  const minePending = pendingMentors.filter(m => canReview('mentor', m.mentor_id))
  const sortMine = <T,>(list: T[], isMine: (x: T) => boolean) => [...list].sort((a, b) => Number(isMine(b)) - Number(isMine(a)))

  const notMine = <p className={styles.muted}>Not one of your classes. The class teacher or the principal reviews this.</p>

  return (
    <RoleSubHeader userId={userId} role={role} profile={profile} school={school}
      title="Peer Mentoring" featureGroups={featureGroups}>
      <div className={styles.root} style={{ ['--mc' as any]: schoolColor }}>
        <div className={styles.main}>
          <div className={styles.tabs} role="tablist">
            <TabButton active={tab === 'approvals'} onClick={() => setTab('approvals')} count={minePending.length + mineAwaiting.length}>Approvals</TabButton>
            <TabButton active={tab === 'pairs'} onClick={() => setTab('pairs')} count={active.length}>Pairs</TabButton>
            <TabButton active={tab === 'reports'} onClick={() => setTab('reports')} count={openReports.length}>Reports</TabButton>
            <TabButton active={tab === 'stars'} onClick={() => setTab('stars')}>Stars</TabButton>
          </div>

          {flash && (
            <div className={`${styles.notice} ${flash.kind === 'ok' ? styles.noticeOk : styles.noticeErr}`} role="status">
              {flash.text}
            </div>
          )}

          {loading ? <SkeletonList count={3} variant="row" /> : (
            <>
              {tab === 'approvals' && (
                pendingMentors.length + awaiting.length === 0 ? (
                  <Empty text="Nothing waiting for you. New mentor applications and matches show up here." />
                ) : (
                  <>
                    {awaiting.length > 0 && <h3 className={styles.sectionTitle}>Matches to approve</h3>}
                    {sortMine(awaiting, p => canReview('pairing', p.pairing_id)).map(p => (
                      <div key={p.pairing_id} className={`${styles.card} ${motion.riseIn}`}>
                        <div className={styles.cardHead}>
                          <div>
                            <h3 className={styles.cardTitle}>{p.subject_name}</h3>
                            <p className={styles.cardSub}>
                              {p.mentee_name ?? 'Student'}{p.mentee_level ? ` (${p.mentee_level})` : ''} wants help from {p.mentor_name ?? 'a mentor'}
                            </p>
                          </div>
                          <Badge status={p.status} />
                        </div>
                        {p.topic && <p className={styles.body}>{p.topic}</p>}
                        <MentorFacts m={mentorById[p.mentor_id]} />
                        {canReview('pairing', p.pairing_id) ? (
                          <ReviewButtons approveLabel="Approve and open chat" rejectLabel="Decline"
                            onApprove={() => reviewPairing(p.pairing_id, true, '')}
                            onReject={(note) => reviewPairing(p.pairing_id, false, note)} />
                        ) : notMine}
                      </div>
                    ))}

                    {pendingMentors.length > 0 && <h3 className={styles.sectionTitle}>Mentor applications</h3>}
                    {sortMine(pendingMentors, m => canReview('mentor', m.mentor_id)).map(m => (
                      <div key={m.mentor_id} className={`${styles.card} ${motion.riseIn}`}>
                        <div className={styles.cardHead}>
                          <div>
                            <h3 className={styles.cardTitle}>{m.student_name ?? 'Student'}</h3>
                            <p className={styles.cardSub}>{m.student_level ?? 'Class not set'} wants to mentor {m.subject_name}</p>
                          </div>
                          <Badge status={m.status} />
                        </div>
                        <p className={styles.body}>
                          {m.subject_avg != null
                            ? <><strong>{m.subject_avg}%</strong> average in {m.subject_name} (approved results)</>
                            : <>No approved {m.subject_name} results on record yet.</>}
                        </p>
                        {m.subject_avg != null && m.subject_avg < GOOD_AVG && (
                          <p className={styles.muted}>Below the {GOOD_AVG}% mark we suggest for mentors. Your call.</p>
                        )}
                        <div className={styles.chips}>
                          {m.class_levels.map(l => <span key={l} className={styles.chipStatic}>{l}</span>)}
                          {m.available_days.map(d => <span key={d} className={styles.chipStatic}>{dayLabel(d)}</span>)}
                          {m.available_note && <span className={styles.chipStatic}>{m.available_note}</span>}
                        </div>
                        {m.bio && <p className={styles.quote}>{m.bio}</p>}
                        {canReview('mentor', m.mentor_id) ? (
                          <ReviewButtons approveLabel="Approve mentor" rejectLabel="Decline"
                            onApprove={() => reviewMentor(m.mentor_id, 'approved', '')}
                            onReject={(note) => reviewMentor(m.mentor_id, 'rejected', note)} />
                        ) : notMine}
                      </div>
                    ))}
                  </>
                )
              )}

              {tab === 'pairs' && (
                <>
                  {active.length === 0 && <Empty text="No active pairs yet." />}
                  {active.map(p => (
                    <PairCard key={p.pairing_id} p={p} roomHref={roomHref}
                      onClose={(completed, reason) => closePairing(p.pairing_id, completed, reason)} />
                  ))}

                  {approvedMentors.length > 0 && <h3 className={styles.sectionTitle}>Approved mentors</h3>}
                  {approvedMentors.map(m => (
                    <div key={m.mentor_id} className={styles.card}>
                      <div className={styles.cardHead}>
                        <div>
                          <h3 className={styles.cardTitle}>{m.student_name ?? 'Student'}</h3>
                          <p className={styles.cardSub}>{m.subject_name} for {m.class_levels.join(', ')}</p>
                        </div>
                        <span className={`${styles.badge} ${m.active_mentees >= MAX_MENTEES ? styles.badgeWait : ''}`}>
                          {m.active_mentees}/{MAX_MENTEES} mentees
                        </span>
                      </div>
                      <div className={styles.row}>
                        {m.avg_rating != null && <><StarRating value={m.avg_rating} size={14} /><span className={styles.muted}>{m.avg_rating}</span></>}
                        <span className={styles.muted}>{m.sessions_done} sessions done</span>
                      </div>
                      {canReview('mentor', m.mentor_id) && (
                        <div className={styles.btnRow}>
                          <button className={`${styles.btn} ${styles.btnDanger} ${styles.btnSmall}`}
                            onClick={() => { if (window.confirm(`Pause ${m.student_name ?? 'this mentor'}? Their open pairings will be closed.`)) reviewMentor(m.mentor_id, 'suspended', '') }}>
                            Pause mentor
                          </button>
                        </div>
                      )}
                    </div>
                  ))}

                  {past.length > 0 && <h3 className={styles.sectionTitle}>Past</h3>}
                  {past.map(p => (
                    <div key={p.pairing_id} className={styles.card}>
                      <div className={styles.cardHead}>
                        <div>
                          <h3 className={styles.cardTitle}>{p.subject_name}</h3>
                          <p className={styles.cardSub}>{p.mentor_name} and {p.mentee_name}</p>
                        </div>
                        <Badge status={p.status} />
                      </div>
                      {(p.grade_before != null || p.grade_after != null) && <Progress p={p} />}
                    </div>
                  ))}
                </>
              )}

              {tab === 'reports' && (
                <>
                  {openReports.length === 0 && <Empty text="No open reports. Messages with phone numbers, outside apps or bad language are flagged here automatically." />}
                  {openReports.map(r => (
                    <ReportCard key={r.report_id} r={r} roomHref={roomHref}
                      pairing={pairings.find(p => p.pairing_id === r.pairing_id)}
                      onResolve={() => resolveReport(r.report_id)}
                      onClose={(reason) => closePairing(r.pairing_id, false, reason)} />
                  ))}
                  {resolvedReports.length > 0 && <h3 className={styles.sectionTitle}>Resolved</h3>}
                  {resolvedReports.map(r => <ReportCard key={r.report_id} r={r} roomHref={roomHref} />)}
                </>
              )}

              {tab === 'stars' && (
                <LeaderboardCard supabase={supabase} title="Star mentors" allowLastMonth refreshKey={tick} />
              )}
            </>
          )}
        </div>
      </div>
    </RoleSubHeader>
  )
}

/* ── Pieces ────────────────────────────────────────────────────────────────────── */

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

function Badge({ status }: { status: string }) {
  const [label, cls] = BADGES[status] ?? [status, '']
  return <span className={`${styles.badge} ${cls}`}>{label}</span>
}

function Empty({ text }: { text: string }) {
  return (
    <div className={`${styles.empty} ${motion.riseIn}`}>
      <PeopleIcon size={40} color="var(--text-faint)" strokeWidth={1} />
      <p>{text}</p>
    </div>
  )
}

function MentorFacts({ m }: { m?: MentorRow }) {
  if (!m) return null
  return (
    <div className={styles.row}>
      {m.subject_avg != null
        ? <span className={styles.muted}>Mentor averages {m.subject_avg}% in {m.subject_name}</span>
        : <span className={styles.muted}>No approved {m.subject_name} results for the mentor yet</span>}
      <span className={styles.muted}>{m.active_mentees}/{MAX_MENTEES} mentees</span>
      {m.avg_rating != null && <><StarRating value={m.avg_rating} size={13} /><span className={styles.muted}>{m.avg_rating}</span></>}
    </div>
  )
}

function Progress({ p }: { p: PairingRow }) {
  return (
    <div className={styles.progress}>
      <span>{p.mentee_name ?? 'Mentee'}, {p.subject_name}</span>
      <span>{p.grade_before != null ? `${Math.round(p.grade_before)}%` : '-'}</span>
      <span className={styles.progressArrow}>to</span>
      <span>{p.grade_after != null ? `${Math.round(p.grade_after)}%` : 'in progress'}</span>
    </div>
  )
}

function ReviewButtons({ approveLabel, rejectLabel, onApprove, onReject }: {
  approveLabel: string; rejectLabel: string
  onApprove: () => Promise<boolean>; onReject: (note: string) => Promise<boolean>
}) {
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  async function run(fn: () => Promise<boolean>) {
    setBusy(true)
    try { await fn() } finally { setBusy(false) }
  }

  return (
    <>
      <div className={styles.btnRow}>
        <button className={`${styles.btn} ${styles.btnPrimary}`} disabled={busy} onClick={() => run(onApprove)}>{approveLabel}</button>
        <button className={styles.btn} disabled={busy} onClick={() => setRejecting(v => !v)}>{rejectLabel}</button>
      </div>
      {rejecting && (
        <div className={styles.form}>
          <input className={styles.input} value={note} maxLength={200} onChange={e => setNote(e.target.value)}
            placeholder="Reason the student will see (optional)" />
          <button className={`${styles.btn} ${styles.btnDanger}`} disabled={busy} onClick={() => run(() => onReject(note.trim()))}>
            Confirm decline
          </button>
        </div>
      )}
    </>
  )
}

function PairCard({ p, roomHref, onClose }: {
  p: PairingRow; roomHref: (roomId: string) => string; onClose: (completed: boolean, reason: string) => Promise<boolean>
}) {
  const [busy, setBusy] = useState(false)
  async function run(fn: () => Promise<boolean>) {
    setBusy(true)
    try { await fn() } finally { setBusy(false) }
  }
  return (
    <div className={`${styles.card} ${motion.riseIn}`}>
      <div className={styles.cardHead}>
        <div>
          <h3 className={styles.cardTitle}>{p.subject_name}</h3>
          <p className={styles.cardSub}>{p.mentor_name} mentors {p.mentee_name}{p.mentee_level ? ` (${p.mentee_level})` : ''}</p>
        </div>
        {p.open_reports > 0
          ? <span className={`${styles.badge} ${styles.badgeDanger}`}>{p.open_reports} report{p.open_reports > 1 ? 's' : ''}</span>
          : <Badge status={p.status} />}
      </div>
      {p.topic && <p className={styles.body}>{p.topic}</p>}
      <div className={styles.row}>
        <span className={styles.muted}>{p.done_count}/{p.session_count} sessions done</span>
        {p.avg_rating != null && <><StarRating value={p.avg_rating} size={13} /><span className={styles.muted}>{p.avg_rating}</span></>}
        {p.reviewed_at && <span className={styles.muted}>since {fmtDateTime(p.reviewed_at)}</span>}
      </div>
      {(p.grade_before != null || p.grade_after != null) && <Progress p={p} />}
      <div className={styles.btnRow}>
        {p.chat_room_id && (
          <Link href={roomHref(p.chat_room_id)} className={`${styles.btn} ${styles.btnSmall}`}>
            <MessageIcon size={14} color="currentColor" /> Read chat
          </Link>
        )}
        <button className={`${styles.btn} ${styles.btnSmall}`} disabled={busy}
          onClick={() => { if (window.confirm('Mark this mentoring as completed?')) run(() => onClose(true, '')) }}>
          Mark completed
        </button>
        <button className={`${styles.btn} ${styles.btnDanger} ${styles.btnSmall}`} disabled={busy}
          onClick={() => { const reason = window.prompt('Why are you closing this pairing? (optional)'); if (reason !== null) run(() => onClose(false, reason.trim())) }}>
          Close pairing
        </button>
      </div>
    </div>
  )
}

function ReportCard({ r, roomHref, pairing, onResolve, onClose }: {
  r: ReportRow
  roomHref: (roomId: string) => string
  pairing?: PairingRow
  onResolve?: () => Promise<boolean>
  onClose?: (reason: string) => Promise<boolean>
}) {
  const [busy, setBusy] = useState(false)
  async function run(fn: () => Promise<boolean>) {
    setBusy(true)
    try { await fn() } finally { setBusy(false) }
  }
  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <div>
          <h3 className={styles.cardTitle}>{r.subject_name}: {r.mentor_name} and {r.mentee_name}</h3>
          <p className={styles.cardSub}>
            {r.source === 'auto' ? 'Flagged automatically' : 'Reported by a student'} on {fmtDateTime(r.created_at)}
          </p>
        </div>
        <span className={`${styles.badge} ${r.source === 'auto' ? styles.badgeWait : styles.badgeDanger}`}>
          {r.source === 'auto' ? 'Auto' : 'Student'}
        </span>
      </div>
      <p className={styles.body}>{r.reason}</p>
      {r.message_text && (
        <p className={styles.quote}>
          {r.sender_name ? `${r.sender_name}: ` : ''}{r.message_text}
        </p>
      )}
      {onResolve && (
        <div className={styles.btnRow}>
          {pairing?.chat_room_id && pairing.status === 'active' && (
            <Link href={roomHref(pairing.chat_room_id)} className={`${styles.btn} ${styles.btnSmall}`}>
              <MessageIcon size={14} color="currentColor" /> Read chat
            </Link>
          )}
          <button className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSmall}`} disabled={busy} onClick={() => run(onResolve)}>
            <ShieldIcon size={14} color="currentColor" /> Mark resolved
          </button>
          {onClose && pairing?.status === 'active' && (
            <button className={`${styles.btn} ${styles.btnDanger} ${styles.btnSmall}`} disabled={busy}
              onClick={() => { const reason = window.prompt('Why are you closing this pairing? (optional)'); if (reason !== null) run(() => onClose(reason.trim())) }}>
              Close pairing
            </button>
          )}
        </div>
      )}
    </div>
  )
}
