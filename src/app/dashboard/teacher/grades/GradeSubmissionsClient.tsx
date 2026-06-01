'use client'
// src/app/dashboard/teacher/grades/GradeSubmissionsClient.tsx

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Submission, AssignmentGroup } from './page'
import styles from './grades.module.css'

interface Props {
  submissions: Submission[]
  assignmentGroups: AssignmentGroup[]
  teacherId: string
}

type FilterTab = 'pending' | 'graded' | 'all'

function initials(n: string) { return n.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() }
function relTime(iso: string) {
  const d = Date.now() - new Date(iso).getTime()
  const m = Math.floor(d / 60000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h/24)}d ago`
}
function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
function computeGrade(score: number, max: number) {
  const pct = max > 0 ? (score / max) * 100 : 0
  if (pct >= 75) return 'A'; if (pct >= 65) return 'B'; if (pct >= 50) return 'C'; if (pct >= 40) return 'D'; return 'F'
}

const IconSun = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
const IconMoon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z"/></svg>
const IconHome = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
const IconClipboard = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
const IconEdit = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
const IconBarChart = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
const IconCheck = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
const IconExternalLink = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>

function getTimeOfDay() { const h = new Date().getHours(); return h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening' }

export default function GradeSubmissionsClient({ submissions: initialSubs, assignmentGroups, teacherId }: Props) {
  const [isDark, setIsDark] = useState(true)
  const [mounted, setMounted] = useState(false)
  const [selectedAssignment, setSelectedAssignment] = useState<string | null>(assignmentGroups[0]?.assignment_id ?? null)
  const [filterTab, setFilterTab] = useState<FilterTab>('pending')
  const [submissions, setSubmissions] = useState<Submission[]>(initialSubs)

  // Per-submission grade inputs
  const [scoreInputs, setScoreInputs] = useState<Record<string, string>>({})
  const [feedbackInputs, setFeedbackInputs] = useState<Record<string, string>>({})
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    const saved = localStorage.getItem('schoolos_theme')
    const dark = saved !== 'light'
    setIsDark(dark)
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
    setMounted(true)
  }, [])

  const toggleTheme = () => {
    const next = !isDark
    setIsDark(next)
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light')
    localStorage.setItem('schoolos_theme', next ? 'dark' : 'light')
  }

  const selectedGroup = assignmentGroups.find(g => g.assignment_id === selectedAssignment)

  const visibleSubs = useMemo(() => {
    if (!selectedAssignment) return []
    return submissions
      .filter(s => {
        if (s.assignment_id !== selectedAssignment) return false
        if (filterTab === 'pending') return s.status === 'pending'
        if (filterTab === 'graded')  return s.status !== 'pending'
        return true
      })
      .sort((a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime())
  }, [submissions, selectedAssignment, filterTab])

  async function saveGrade(sub: Submission) {
    const scoreStr = scoreInputs[sub.id]
    if (scoreStr === undefined || scoreStr === '') return
    const score = Math.min(Math.max(Number(scoreStr), 0), sub.max_score)
    const feedback = feedbackInputs[sub.id] ?? ''

    setSavingIds(prev => new Set(prev).add(sub.id))
    const supabase = createClient()

    const { error } = await supabase
      .from('assignment_submissions')
      .update({
        score,
        feedback: feedback || null,
        status: 'graded',
        graded_at: new Date().toISOString(),
        graded_by: teacherId,
      })
      .eq('id', sub.id)

    setSavingIds(prev => { const n = new Set(prev); n.delete(sub.id); return n })

    if (!error) {
      setSubmissions(prev => prev.map(s =>
        s.id === sub.id ? { ...s, score, feedback: feedback || null, status: 'graded' } : s
      ))
    }
  }

  if (!mounted) return null

  return (
    <div className={styles.page}>
      <div className={styles.layoutWrap}>
        <nav className={styles.sideNav}>
          <div className={styles.sideNavLogo}>School<span>OS</span></div>
          <Link href="/dashboard/teacher" className={styles.sideNavItem}><IconHome /> Overview</Link>
          <Link href="/dashboard/teacher/results" className={styles.sideNavItem}><IconClipboard /> Post Results</Link>
          <Link href="/dashboard/teacher/grades" className={`${styles.sideNavItem} ${styles.sideNavItemActive}`}><IconEdit /> Grade Submissions</Link>
          <Link href="/dashboard/teacher/classes" className={styles.sideNavItem}><IconBarChart /> My Classes</Link>
        </nav>

        <div className={styles.mainCol}>
          <header className={styles.header}>
            <div>
              <p className={styles.greeting}>Good {getTimeOfDay()}</p>
              <h1 className={styles.pageTitle}>Grade <span>Submissions</span></h1>
            </div>
            <button className={styles.themeBtn} onClick={toggleTheme}>{isDark ? <IconSun /> : <IconMoon />}</button>
          </header>

          <main className={styles.content}>
            {/* Left: assignment list */}
            <div className={styles.assignPanel}>
              <div className={styles.assignPanelHeader}>
                <p className={styles.assignPanelTitle}>Assignments ({assignmentGroups.length})</p>
              </div>
              <div className={styles.assignList}>
                {assignmentGroups.length === 0 ? (
                  <div className={styles.emptyState}>No assignments found.</div>
                ) : (
                  assignmentGroups.map(g => (
                    <div
                      key={g.assignment_id}
                      className={`${styles.assignItem} ${selectedAssignment === g.assignment_id ? styles.assignItemActive : ''}`}
                      onClick={() => setSelectedAssignment(g.assignment_id)}
                    >
                      <p className={styles.assignItemSubject}>{g.subject_name} · {g.class_name}</p>
                      <p className={styles.assignItemTitle}>{g.title}</p>
                      <div className={styles.assignItemMeta}>
                        {g.pending_count > 0 && <span className={styles.pendingChip}>{g.pending_count} pending</span>}
                        {g.graded_count > 0  && <span className={styles.gradedChip}>{g.graded_count} graded</span>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Right: submission grading */}
            <div className={styles.gradePanel}>
              {!selectedGroup ? (
                <div className={styles.emptyState}>Select an assignment to grade submissions.</div>
              ) : (
                <>
                  <div className={styles.gradePanelHeader}>
                    <p className={styles.gradePanelTitle}>{selectedGroup.title}</p>
                    <p className={styles.gradePanelSubtitle}>
                      {selectedGroup.subject_name} · {selectedGroup.class_name} · Due: {fmtDate(selectedGroup.due_date)} · Max: {selectedGroup.max_score}
                    </p>
                  </div>

                  <div className={styles.filterTabs}>
                    {(['pending', 'graded', 'all'] as FilterTab[]).map(t => (
                      <button
                        key={t}
                        className={`${styles.filterTab} ${filterTab === t ? styles.filterTabActive : ''}`}
                        onClick={() => setFilterTab(t)}
                      >
                        {t === 'pending' ? `Pending (${selectedGroup.pending_count})` :
                         t === 'graded'  ? `Graded (${selectedGroup.graded_count})` : 'All'}
                      </button>
                    ))}
                  </div>

                  {visibleSubs.length === 0 ? (
                    <div className={styles.emptyState}>
                      {filterTab === 'pending' ? 'No pending submissions — all graded!' : 'No submissions here.'}
                    </div>
                  ) : (
                    <div className={styles.submissionList}>
                      {visibleSubs.map(sub => {
                        const isGraded = sub.status !== 'pending'
                        const isSaving = savingIds.has(sub.id)
                        const scoreStr = scoreInputs[sub.id] ?? (sub.score !== null ? String(sub.score) : '')
                        const grade = scoreStr !== '' ? computeGrade(Number(scoreStr), sub.max_score) : '—'

                        return (
                          <div key={sub.id} className={styles.submissionRow}>
                            <div className={styles.subAvatar}>{initials(sub.student_name)}</div>
                            <div className={styles.subInfo}>
                              <p className={styles.subName}>{sub.student_name}</p>
                              <p className={styles.subMeta}>
                                {sub.student_number ? `${sub.student_number} · ` : ''}{relTime(sub.submitted_at)}
                              </p>
                              {sub.notes && <p className={styles.subNotes}>{sub.notes}</p>}
                              {sub.file_url && (
                                <a href={sub.file_url} target="_blank" rel="noopener noreferrer" className={styles.fileLink}>
                                  <IconExternalLink /> View Submission
                                </a>
                              )}
                            </div>

                            {isGraded && scoreInputs[sub.id] === undefined ? (
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 'var(--space-2)' }}>
                                <div className={styles.gradedBadge}><IconCheck /> Graded</div>
                                <span className={styles.gradedScore}>{sub.score} / {sub.max_score}</span>
                                <button
                                  style={{ fontSize: '0.68rem', color: 'var(--text-accent)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                                  onClick={() => {
                                    setScoreInputs(p => ({ ...p, [sub.id]: String(sub.score ?? '') }))
                                    setFeedbackInputs(p => ({ ...p, [sub.id]: sub.feedback ?? '' }))
                                  }}
                                >
                                  Edit grade
                                </button>
                              </div>
                            ) : (
                              <div className={styles.gradeForm}>
                                <div className={styles.gradeScoreRow}>
                                  <input
                                    className={styles.gradeScoreInput}
                                    type="number" min="0" max={sub.max_score}
                                    placeholder="Score"
                                    value={scoreStr}
                                    onChange={e => setScoreInputs(p => ({ ...p, [sub.id]: e.target.value }))}
                                  />
                                  <span className={styles.gradeScoreMax}>/ {sub.max_score} ({grade})</span>
                                </div>
                                <textarea
                                  className={styles.gradeFeedback}
                                  placeholder="Feedback (optional)…"
                                  value={feedbackInputs[sub.id] ?? sub.feedback ?? ''}
                                  onChange={e => setFeedbackInputs(p => ({ ...p, [sub.id]: e.target.value }))}
                                  rows={2}
                                />
                                <button
                                  className={styles.saveGradeBtn}
                                  onClick={() => saveGrade(sub)}
                                  disabled={isSaving || scoreStr === ''}
                                >
                                  {isSaving ? 'Saving…' : 'Save Grade'}
                                </button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
