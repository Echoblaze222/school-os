'use client'
// src/app/dashboard/teacher/assignments/[id]/submissions/SubmissionsClient.tsx

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { AssignmentMeta, SubmissionRow } from './page'

interface Props {
  assignment: AssignmentMeta
  submissions: SubmissionRow[]
  teacherId: string
}

type Filter = 'all' | 'pending' | 'submitted' | 'graded'

/* ── tiny inline styles — no separate CSS file needed here ── */
const c = {
  page: { minHeight: '100dvh', background: 'var(--bg-base)', fontFamily: 'var(--font-body)', paddingBottom: 60 } as React.CSSProperties,
  header: { position: 'sticky' as const, top: 0, zIndex: 50, padding: '20px 24px 16px', background: 'var(--bg-overlay)', backdropFilter: 'blur(24px) saturate(160%)', borderBottom: '1px solid var(--glass-border)' },
  backBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', fontSize: '0.82rem', fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase' as const, textDecoration: 'none', padding: '6px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)', background: 'var(--glass-bg)', transition: 'all var(--transition-fast)', marginBottom: 12 },
  title: { fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1 },
  titleSpan: { color: 'var(--text-accent)' },
  sub: { fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 },
  content: { padding: '20px 24px', display: 'flex', flexDirection: 'column' as const, gap: 16, maxWidth: 900 },
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 },
  statCard: { background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-xl)', padding: '14px 18px', display: 'flex', flexDirection: 'column' as const, gap: 3 },
  statVal: { fontFamily: 'var(--font-display)', fontSize: '1.8rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1, letterSpacing: '-0.02em' },
  statLbl: { fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: 'var(--text-muted)' },
  filterBar: { display: 'flex', gap: 6 },
  fBtn: (active: boolean) => ({ padding: '6px 16px', borderRadius: 99999, border: 'none', background: active ? 'linear-gradient(135deg, var(--burgundy), var(--burgundy-light))' : 'var(--glass-bg)', color: active ? '#fff' : 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.76rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' as const, cursor: 'pointer', boxShadow: active ? '0 3px 12px var(--burgundy-glow)' : 'none', border2: '1px solid var(--glass-border)' }),
  card: { background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', boxShadow: 'var(--glass-shadow)', backdropFilter: 'blur(20px)', borderRadius: 'var(--radius-xl)', overflow: 'hidden' },
  tableHead: { display: 'grid', gridTemplateColumns: '1fr 110px 110px 160px 1fr 120px', gap: 0, padding: '10px 20px', borderBottom: '1px solid var(--glass-border)', background: 'var(--glass-bg)' },
  thCell: { fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase' as const, color: 'var(--text-muted)', whiteSpace: 'nowrap' as const },
  row: { display: 'grid', gridTemplateColumns: '1fr 110px 110px 160px 1fr 120px', gap: 0, padding: '14px 20px', borderBottom: '1px solid var(--glass-border)', alignItems: 'center', transition: 'background var(--transition-fast)' },
  avatar: { width: 32, height: 32, borderRadius: 99999, background: 'var(--burgundy-subtle)', border: '1px solid rgba(128,0,32,0.2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.66rem', fontWeight: 700, color: 'var(--text-accent)', flexShrink: 0, marginRight: 10 },
  name: { fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)' },
  num:  { fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 1 },
  badge: (type: string) => {
    const map: Record<string, [string, string, string]> = {
      submitted: ['var(--info-bg)', 'var(--info)', 'rgba(36,113,163,0.2)'],
      late:      ['var(--error-bg)', 'var(--error)', 'rgba(192,57,43,0.2)'],
      pending:   ['var(--glass-bg)', 'var(--text-muted)', 'var(--glass-border)'],
      graded:    ['var(--success-bg)', 'var(--success)', 'rgba(45,139,85,0.2)'],
    }
    const [bg, color, border] = map[type] ?? map.pending
    return { display: 'inline-flex', alignItems: 'center', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase' as const, padding: '3px 9px', borderRadius: 99999, background: bg, color, border: `1px solid ${border}`, whiteSpace: 'nowrap' as const }
  },
  fileBtn: { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', fontWeight: 600, color: 'var(--info)', textDecoration: 'none', padding: '2px 8px', borderRadius: 6, background: 'var(--info-bg)', border: '1px solid rgba(36,113,163,0.2)' },
  scoreInput: { width: 68, background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, padding: '6px 8px', fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, color: 'var(--input-text)', textAlign: 'center' as const, outline: 'none' },
  feedbackInput: { width: '100%', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, padding: '6px 10px', fontFamily: 'var(--font-body)', fontSize: '0.80rem', color: 'var(--input-text)', outline: 'none', resize: 'none' as const },
  saveBtn: (disabled: boolean) => ({ padding: '6px 14px', borderRadius: 99999, background: disabled ? 'var(--glass-bg)' : 'linear-gradient(135deg, var(--burgundy), var(--burgundy-light))', color: disabled ? 'var(--text-muted)' : '#fff', border: 'none', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' as const, cursor: disabled ? 'not-allowed' : 'pointer', boxShadow: disabled ? 'none' : '0 3px 10px var(--burgundy-glow)', transition: 'all var(--transition-fast)' }),
  toast: { position: 'fixed' as const, bottom: 28, left: '50%', transform: 'translateX(-50%)', background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)', borderRadius: 99999, padding: '10px 24px', fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)', zIndex: 300, boxShadow: '0 8px 32px rgba(0,0,0,.5)', whiteSpace: 'nowrap' as const },
  empty: { padding: '48px 24px', textAlign: 'center' as const, color: 'var(--text-muted)', fontSize: '0.84rem' },
}

function initials(n: string) { return n.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase() }

function fmtDateTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })
}

const IconChevronLeft = () => <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
const IconExternalLink = () => <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>

export default function SubmissionsClient({ assignment, submissions: initialSubs, teacherId }: Props) {
  const [mounted, setMounted] = useState(false)
  const [subs, setSubs] = useState<SubmissionRow[]>(initialSubs)
  const [filter, setFilter] = useState<Filter>('all')
  const [scores, setScores] = useState<Record<string, string>>({})
  const [feedbacks, setFeedbacks] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => { setMounted(true) }, [])

  const visible = useMemo(() => subs.filter(s => filter === 'all' || s.status === filter), [subs, filter])

  const counts = useMemo(() => ({
    all: subs.length,
    submitted: subs.filter(s => s.status === 'submitted' || s.status === 'late').length,
    graded: subs.filter(s => s.status === 'graded').length,
    pending: subs.filter(s => s.status === 'pending').length,
  }), [subs])

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000) }

  async function saveGrade(sub: SubmissionRow) {
    const scoreStr = scores[sub.student_id]
    if (!scoreStr || sub.status === 'pending') return
    const scoreNum = Math.min(Math.max(Number(scoreStr), 0), assignment.max_score)
    const feedback = feedbacks[sub.student_id] ?? sub.feedback ?? ''

    setSaving(prev => new Set(prev).add(sub.student_id))
    const supabase = createClient()
    const now = new Date().toISOString()

    const { error } = await supabase
      .from('assignment_submissions')
      .update({ score: scoreNum, feedback: feedback || null, status: 'graded', graded_at: now, graded_by: teacherId })
      .eq('id', sub.id)

    if (!error) {
      // Create student notification
      await supabase.from('notifications').insert({
        user_id: sub.student_id,
        title: 'Assignment Graded',
        body: `Your assignment "${assignment.title}" has been graded. Score: ${scoreNum}/${assignment.max_score}`,
        type: 'grade',
        read: false,
        created_at: now,
      })

      setSubs(prev => prev.map(s => s.student_id === sub.student_id
        ? { ...s, score: scoreNum, feedback: feedback || null, status: 'graded' }
        : s))
      showToast(`Grade saved for ${sub.student_name}`)
    } else {
      showToast(`Error: ${error.message}`)
    }

    setSaving(prev => { const n = new Set(prev); n.delete(sub.student_id); return n })
  }

  if (!mounted) return null

  const submittedPct = subs.length > 0 ? Math.round((counts.submitted + counts.graded) / subs.length * 100) : 0
  const gradedPct    = subs.length > 0 ? Math.round(counts.graded / subs.length * 100) : 0

  return (
    <div style={c.page}>
      <header style={c.header}>
        <Link href="/dashboard/teacher" style={c.backBtn}><IconChevronLeft /> Teacher Dashboard</Link>
        <h1 style={c.title}>
          <span style={c.titleSpan}>{assignment.subject_name}</span> — {assignment.title}
        </h1>
        <p style={c.sub}>
          {assignment.class_name} · Due: {assignment.due_date ? new Date(assignment.due_date).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : 'No deadline'} · Max score: {assignment.max_score}
        </p>
      </header>

      <div style={c.content}>
        {/* Stats */}
        <div style={c.statsRow}>
          <div style={c.statCard}><span style={c.statVal}>{subs.length}</span><span style={c.statLbl}>Students</span></div>
          <div style={c.statCard}><span style={c.statVal}>{counts.submitted}</span><span style={c.statLbl}>Submitted</span></div>
          <div style={c.statCard}><span style={c.statVal}>{counts.graded}</span><span style={c.statLbl}>Graded</span></div>
          <div style={c.statCard}><span style={{ ...c.statVal, color: 'var(--text-accent)' }}>{gradedPct}%</span><span style={c.statLbl}>Graded Rate</span></div>
        </div>

        {/* Progress bar */}
        <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-xl)', padding: '16px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Submission Progress</span>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-primary)' }}>{submittedPct}% submitted</span>
          </div>
          <div style={{ width: '100%', height: 6, background: 'var(--glass-border)', borderRadius: 99999, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${submittedPct}%`, background: 'linear-gradient(90deg, var(--burgundy), #e05070)', borderRadius: 99999, transition: 'width 1s ease' }} />
          </div>
        </div>

        {/* Filter bar */}
        <div style={c.filterBar}>
          {(['all','submitted','graded','pending'] as Filter[]).map(f => (
            <button key={f} style={c.fBtn(filter === f) as any} onClick={() => setFilter(f)}>
              {f === 'all' ? `All (${counts.all})` : f === 'submitted' ? `Submitted (${counts.submitted})` : f === 'graded' ? `Graded (${counts.graded})` : `Pending (${counts.pending})`}
            </button>
          ))}
        </div>

        {/* Table */}
        <div style={c.card}>
          <div style={c.tableHead}>
            <span style={c.thCell}>Student</span>
            <span style={c.thCell}>Submitted</span>
            <span style={c.thCell}>Status</span>
            <span style={c.thCell}>File / Notes</span>
            <span style={c.thCell}>Feedback</span>
            <span style={c.thCell}>Score & Action</span>
          </div>

          {visible.length === 0 ? (
            <div style={c.empty}>No {filter === 'all' ? '' : filter} submissions.</div>
          ) : (
            visible.map((sub, idx) => {
              const isSaving = saving.has(sub.student_id)
              const scoreStr = scores[sub.student_id] ?? (sub.score !== null ? String(sub.score) : '')
              const hasSub = sub.status !== 'pending'
              const isGraded = sub.status === 'graded' && scores[sub.student_id] === undefined

              return (
                <div
                  key={sub.student_id}
                  style={{ ...c.row, background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)', borderBottom: idx === visible.length - 1 ? 'none' : '1px solid var(--glass-border)' }}
                >
                  {/* Student */}
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <div style={c.avatar}>{initials(sub.student_name)}</div>
                    <div>
                      <p style={c.name}>{sub.student_name}</p>
                      <p style={c.num}>{sub.student_number ?? '—'}</p>
                    </div>
                  </div>

                  {/* Submitted at */}
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{fmtDateTime(sub.submitted_at)}</span>

                  {/* Status badge */}
                  <span style={c.badge(sub.status)}>{sub.status}</span>

                  {/* File / Notes */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {sub.file_url && (
                      <a href={sub.file_url} target="_blank" rel="noopener noreferrer" style={c.fileBtn}>
                        <IconExternalLink /> View File
                      </a>
                    )}
                    {sub.notes && (
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any, overflow: 'hidden' }}>
                        {sub.notes}
                      </span>
                    )}
                    {!sub.file_url && !sub.notes && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>—</span>}
                  </div>

                  {/* Feedback */}
                  <div>
                    {hasSub ? (
                      <textarea
                        style={c.feedbackInput}
                        rows={2}
                        placeholder="Optional feedback…"
                        defaultValue={sub.feedback ?? ''}
                        onChange={e => setFeedbacks(p => ({ ...p, [sub.student_id]: e.target.value }))}
                        disabled={isSaving}
                      />
                    ) : (
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Not submitted</span>
                    )}
                  </div>

                  {/* Score + save */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
                    {isGraded && scores[sub.student_id] === undefined ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--success)' }}>
                          {sub.score} / {assignment.max_score}
                        </span>
                        <button
                          style={{ fontSize: '0.68rem', color: 'var(--text-accent)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                          onClick={() => setScores(p => ({ ...p, [sub.student_id]: String(sub.score ?? '') }))}
                        >Edit</button>
                      </div>
                    ) : hasSub ? (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <input
                            style={c.scoreInput}
                            type="number" min={0} max={assignment.max_score}
                            placeholder="Score"
                            value={scoreStr}
                            onChange={e => setScores(p => ({ ...p, [sub.student_id]: e.target.value }))}
                            disabled={isSaving}
                          />
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>/ {assignment.max_score}</span>
                        </div>
                        <button
                          style={c.saveBtn(isSaving || !scoreStr)}
                          onClick={() => saveGrade(sub)}
                          disabled={isSaving || !scoreStr}
                        >
                          {isSaving ? 'Saving…' : 'Save Grade'}
                        </button>
                      </>
                    ) : (
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>—</span>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {toast && <div style={c.toast}>{toast}</div>}
    </div>
  )
}
