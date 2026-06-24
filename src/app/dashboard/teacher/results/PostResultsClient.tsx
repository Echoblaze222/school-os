'use client'
// src/app/dashboard/teacher/results/PostResultsClient.tsx
// Step-by-step: 1) Pick class+subject  2) Pick term+type  3) Enter scores  4) Save
//
// FIX: Replaced broken upsert (which required a DB unique constraint that didn't exist)
//      with a safe insert-or-update pattern:
//        - Check which student_ids already have a row for this combo
//        - UPDATE existing rows
//        - INSERT new rows
//      This works without any schema migration.
//
// FIX: academic_year now computed from school_settings current_year if available,
//      falling back to a reliable calendar computation.
// FIX: scores state is cleared when term/resultType/selectedCS changes so stale
//      pre-fills don't carry over.

import { useEffect, useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { TeacherClass, StudentForResult, ExistingResult } from './types'
import styles from './teacher.module.css'

interface Props {
  teacherClasses:  TeacherClass[]
  allStudents:     (StudentForResult & { class_id: string })[]
  existingResults: ExistingResult[]
  teacherId:       string
  teacherName:     string
  schoolId:        string
  academicYear?:   string   // pass from page.tsx (school_settings.current_year)
}

type ResultType = 'day_test' | 'mid_term' | 'exam'
type Term       = 'first' | 'second' | 'third'

const RESULT_TYPE_LABELS: Record<ResultType, string> = {
  day_test: 'Day Test',
  mid_term: 'Mid-Term',
  exam:     'Exam',
}

const TERM_LABELS: Record<Term, string> = {
  first:  'First Term',
  second: 'Second Term',
  third:  'Third Term',
}

// These are the exact values stored in results.term (enum/text in DB)
const TERM_TO_DB: Record<Term, string> = {
  first:  'First Term',
  second: 'Second Term',
  third:  'Third Term',
}

function getAcademicYear(override?: string): string {
  if (override) return override
  const now = new Date()
  const y   = now.getFullYear()
  // Nigerian schools: new academic year starts in September
  return now.getMonth() >= 8 ? `${y}/${y + 1}` : `${y - 1}/${y}`
}

function computeGrade(score: number, maxScore: number): string {
  if (maxScore === 0) return '—'
  const pct = (score / maxScore) * 100
  if (pct >= 75) return 'A'
  if (pct >= 65) return 'B'
  if (pct >= 50) return 'C'
  if (pct >= 40) return 'D'
  return 'F'
}

function gradeStyle(grade: string): string {
  if (grade === 'A') return styles.gradeA
  if (grade === 'B') return styles.gradeB
  if (grade === 'C') return styles.gradeC
  return styles.gradeD
}

function initials(n: string) {
  return n.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}
function getTimeOfDay() {
  const h = new Date().getHours()
  return h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening'
}

// ── Icons ────────────────────────────────────────────────────────────────────
const IconSun         = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
const IconMoon        = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z"/></svg>
const IconHome        = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
const IconClipboard   = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
const IconEdit        = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
const IconBarChart    = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
const IconCheck       = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
const IconAlertCircle = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
const IconSave        = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>

// ── Component ─────────────────────────────────────────────────────────────────
export default function PostResultsClient({
  teacherClasses,
  allStudents,
  existingResults,
  teacherId,
  teacherName,
  schoolId,
  academicYear,
}: Props) {
  const [isDark,       setIsDark]       = useState(true)
  const [mounted,      setMounted]      = useState(false)
  const [step,         setStep]         = useState(1)
  const [selectedCS,   setSelectedCS]   = useState<TeacherClass | null>(null)
  const [term,         setTerm]         = useState<Term>('first')
  const [resultType,   setResultType]   = useState<ResultType>('day_test')
  const [maxScore,     setMaxScore]     = useState('100')
  const [scores,       setScores]       = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [errorMsg,     setErrorMsg]     = useState('')
  const [savedCount,   setSavedCount]   = useState(0)

  const currentAcademicYear = getAcademicYear(academicYear)

  useEffect(() => {
    const saved = localStorage.getItem('schoolos_theme')
    const dark  = saved !== 'light'
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

  // Students belonging to the selected class
  const classStudents = useMemo(() => {
    if (!selectedCS) return []
    return allStudents.filter(s => s.class_id === selectedCS.class_id)
  }, [selectedCS, allStudents])

  // Pre-fill scores when arriving at step 3, and clear when combo changes.
  // Uses existingResults passed from the server so no extra round-trip needed.
  useEffect(() => {
    if (step !== 3 || !selectedCS) return
    const dbTerm = TERM_TO_DB[term]
    const pre: Record<string, string> = {}
    existingResults.forEach(r => {
      if (
        r.class_subject_id === selectedCS.class_subject_id &&
        r.term             === dbTerm &&
        r.result_type      === resultType
      ) {
        pre[r.student_id] = String(r.score)
      }
    })
    setScores(pre)
    // Reset save status when switching context
    setSubmitStatus('idle')
    setErrorMsg('')
  }, [step, selectedCS, term, resultType, existingResults])

  const filledCount = Object.values(scores).filter(v => v !== '' && !isNaN(Number(v))).length
  const maxNum      = Number(maxScore) || 100

  // ── Safe insert-or-update (no unique constraint needed) ───────────────────
  const handleSubmit = useCallback(async () => {
    if (!selectedCS) return
    setIsSubmitting(true)
    setSubmitStatus('idle')
    setErrorMsg('')

    const supabase = createClient()
    const dbTerm   = TERM_TO_DB[term]

    // Only process students who have a score entered
    const studentsWithScores = classStudents.filter(s => {
      const v = scores[s.student_id]
      return v !== '' && v !== undefined && !isNaN(Number(v))
    })

    if (studentsWithScores.length === 0) {
      setIsSubmitting(false)
      setSubmitStatus('error')
      setErrorMsg('No scores entered.')
      return
    }

    // 1) Find which students already have a row for this exact combo
    const studentIds = studentsWithScores.map(s => s.student_id)
    const { data: existing, error: fetchErr } = await supabase
      .from('results')
      .select('id, student_id')
      .eq('class_subject_id', selectedCS.class_subject_id)
      .eq('term',             dbTerm)
      .eq('result_type',      resultType)
      .eq('school_id',        schoolId)
      .in('student_id',       studentIds)

    if (fetchErr) {
      setIsSubmitting(false)
      setSubmitStatus('error')
      setErrorMsg(`Failed to check existing results: ${fetchErr.message}`)
      return
    }

    const existingMap = new Map((existing ?? []).map(r => [r.student_id, r.id]))

    // 2) Split into updates vs inserts
    const toUpdate = studentsWithScores.filter(s =>  existingMap.has(s.student_id))
    const toInsert = studentsWithScores.filter(s => !existingMap.has(s.student_id))

    const errors: string[] = []

    // 3) Run updates one-by-one (or batch via .in if you prefer)
    for (const s of toUpdate) {
      const scoreNum = Math.min(Math.max(Number(scores[s.student_id]) || 0, 0), maxNum)
      const { error } = await supabase
        .from('results')
        .update({
          score:        scoreNum,
          max_score:    maxNum,
          grade:        computeGrade(scoreNum, maxNum),
          posted_by:    teacherId,
          posted_at:    new Date().toISOString(),
        })
        .eq('id', existingMap.get(s.student_id)!)
      if (error) errors.push(`Update failed for ${s.full_name}: ${error.message}`)
    }

    // 4) Batch-insert new rows
    if (toInsert.length > 0) {
      const insertRows = toInsert.map(s => {
        const scoreNum = Math.min(Math.max(Number(scores[s.student_id]) || 0, 0), maxNum)
        return {
          student_id:       s.student_id,
          class_subject_id: selectedCS.class_subject_id,
          result_type:      resultType,
          term:             dbTerm,
          score:            scoreNum,
          max_score:        maxNum,
          grade:            computeGrade(scoreNum, maxNum),
          school_id:        schoolId,
          academic_year:    currentAcademicYear,
          posted_by:        teacherId,
        }
      })
      const { error } = await supabase.from('results').insert(insertRows)
      if (error) errors.push(`Insert failed: ${error.message}`)
    }

    setIsSubmitting(false)

    if (errors.length > 0) {
      setSubmitStatus('error')
      setErrorMsg(errors.join(' | '))
    } else {
      setSavedCount(studentsWithScores.length)
      setSubmitStatus('success')
    }
  }, [selectedCS, classStudents, scores, term, resultType, maxNum, schoolId, teacherId, currentAcademicYear])

  if (!mounted) return null

  return (
    <div className={styles.page}>
      <div className={styles.layoutWrap}>

        {/* ── Side Nav ── */}
        <nav className={styles.sideNav}>
          <div className={styles.sideNavLogo}>School<span>OS</span></div>
          <Link href="/dashboard/teacher"         className={styles.sideNavItem}><IconHome />      Overview</Link>
          <Link href="/dashboard/teacher/results" className={`${styles.sideNavItem} ${styles.sideNavItemActive}`}><IconClipboard /> Post Results</Link>
          <Link href="/dashboard/teacher/grades"  className={styles.sideNavItem}><IconEdit />      Grade Submissions</Link>
          <Link href="/dashboard/teacher/classes" className={styles.sideNavItem}><IconBarChart />  My Classes</Link>
        </nav>

        <div className={styles.mainCol}>
          <header className={styles.header}>
            <div className={styles.headerLeft}>
              <p className={styles.greeting}>Good {getTimeOfDay()}</p>
              <h1 className={styles.pageTitle}>Post <span>Results</span></h1>
            </div>
            <div className={styles.headerActions}>
              <button className={styles.themeBtn} onClick={toggleTheme}>
                {isDark ? <IconSun /> : <IconMoon />}
              </button>
            </div>
          </header>

          <main className={styles.content}>

            {/* Step progress bar */}
            <div className={styles.stepBar}>
              {[
                { n: 1, label: 'Class & Subject' },
                { n: 2, label: 'Term & Type'     },
                { n: 3, label: 'Enter Scores'    },
              ].map(s => (
                <div
                  key={s.n}
                  className={`${styles.step} ${step === s.n ? styles.stepActive : ''} ${step > s.n ? styles.stepDone : ''}`}
                  onClick={() => {
                    // Allow clicking back to any completed step
                    if (s.n < step) setStep(s.n)
                    // Allow jumping to step 2/3 only if class is selected
                    if (s.n === 2 && selectedCS) setStep(2)
                    if (s.n === 3 && selectedCS) setStep(3)
                  }}
                >
                  <div className={styles.stepNum}>{step > s.n ? <IconCheck /> : s.n}</div>
                  <span className={styles.stepLabel}>{s.label}</span>
                </div>
              ))}
            </div>

            {/* ── Step 1: Pick class & subject ── */}
            {step === 1 && (
              <div className={styles.card} style={{ animationDelay: '0ms' }}>
                <div className={styles.cardHeader}>
                  <div>
                    <p className={styles.cardTitle}>Select Class &amp; Subject</p>
                    <p className={styles.cardSubtitle}>Choose which class you are posting results for</p>
                  </div>
                </div>
                <div className={styles.cardBody}>
                  {teacherClasses.length === 0 ? (
                    <div className={styles.emptyState}>You are not assigned to any classes yet.</div>
                  ) : (
                    <div className={styles.classGrid}>
                      {teacherClasses.map(tc => (
                        <button
                          key={tc.class_subject_id}
                          className={`${styles.classOption} ${selectedCS?.class_subject_id === tc.class_subject_id ? styles.classOptionSelected : ''}`}
                          onClick={() => setSelectedCS(tc)}
                        >
                          <p className={styles.classOptionSubject}>{tc.subject_name}</p>
                          <p className={styles.classOptionName}>{tc.class_name}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className={styles.actionRow}>
                  <button
                    className={styles.primaryBtn}
                    disabled={!selectedCS}
                    onClick={() => setStep(2)}
                  >
                    Continue →
                  </button>
                </div>
              </div>
            )}

            {/* ── Step 2: Term & Type ── */}
            {step === 2 && (
              <div className={styles.card} style={{ animationDelay: '0ms' }}>
                <div className={styles.cardHeader}>
                  <div>
                    <p className={styles.cardTitle}>{selectedCS?.subject_name} — {selectedCS?.class_name}</p>
                    <p className={styles.cardSubtitle}>Set the assessment details</p>
                  </div>
                </div>
                <div className={styles.cardBody}>
                  <div className={styles.segRow}>
                    <div className={styles.segGroup}>
                      <span className={styles.segLabel}>Term</span>
                      <div className={styles.segButtons}>
                        {(['first', 'second', 'third'] as Term[]).map(t => (
                          <button
                            key={t}
                            className={`${styles.segBtn} ${term === t ? styles.segBtnActive : ''}`}
                            onClick={() => setTerm(t)}
                          >
                            {TERM_LABELS[t]}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className={styles.segGroup}>
                      <span className={styles.segLabel}>Assessment Type</span>
                      <div className={styles.segButtons}>
                        {(['day_test', 'mid_term', 'exam'] as ResultType[]).map(rt => (
                          <button
                            key={rt}
                            className={`${styles.segBtn} ${resultType === rt ? styles.segBtnActive : ''}`}
                            onClick={() => setResultType(rt)}
                          >
                            {RESULT_TYPE_LABELS[rt]}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className={styles.fieldRow}>
                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>Maximum Score</label>
                      <input
                        className={styles.fieldInput}
                        type="number" min="1" max="1000"
                        value={maxScore}
                        onChange={e => setMaxScore(e.target.value)}
                        placeholder="100"
                      />
                    </div>
                  </div>
                </div>
                <div className={styles.actionRow}>
                  <button className={styles.secondaryBtn} onClick={() => setStep(1)}>← Back</button>
                  <button
                    className={styles.primaryBtn}
                    disabled={!maxScore || Number(maxScore) <= 0}
                    onClick={() => setStep(3)}
                  >
                    Continue →
                  </button>
                </div>
              </div>
            )}

            {/* ── Step 3: Enter scores ── */}
            {step === 3 && (
              <div className={styles.card} style={{ animationDelay: '0ms' }}>
                <div className={styles.cardHeader}>
                  <div>
                    <p className={styles.cardTitle}>
                      {selectedCS?.subject_name} — {selectedCS?.class_name}
                    </p>
                    <p className={styles.cardSubtitle}>
                      {TERM_LABELS[term]} · {RESULT_TYPE_LABELS[resultType]} · Out of {maxNum}
                    </p>
                    <p className={styles.cardSubtitle} style={{ marginTop: 2, opacity: 0.6 }}>
                      {currentAcademicYear}
                    </p>
                  </div>
                </div>

                {/* Status banners */}
                {submitStatus === 'success' && (
                  <div style={{ margin: 'var(--space-4) var(--space-6) 0' }}>
                    <div className={styles.statusSuccess}>
                      <IconCheck /> Results saved for {savedCount} student{savedCount !== 1 ? 's' : ''}!
                    </div>
                  </div>
                )}
                {submitStatus === 'error' && (
                  <div style={{ margin: 'var(--space-4) var(--space-6) 0' }}>
                    <div className={styles.statusError}>
                      <IconAlertCircle /> {errorMsg || 'Failed to save results.'}
                    </div>
                  </div>
                )}

                <div className={styles.cardBody} style={{ padding: 0 }}>
                  {classStudents.length === 0 ? (
                    <div className={styles.emptyState}>No students found in this class.</div>
                  ) : (
                    <div className={styles.scoreTableWrap}>
                      <table className={styles.scoreTable}>
                        <thead>
                          <tr>
                            <th>Student</th>
                            <th>Score / {maxNum}</th>
                            <th>Grade</th>
                          </tr>
                        </thead>
                        <tbody>
                          {classStudents.map(s => {
                            const raw    = scores[s.student_id] ?? ''
                            const num    = raw !== '' ? Number(raw) : NaN
                            const grade  = !isNaN(num) && raw !== '' ? computeGrade(Math.min(num, maxNum), maxNum) : '—'
                            const isOver = !isNaN(num) && num > maxNum
                            return (
                              <tr key={s.student_id}>
                                <td>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <div className={styles.studentAvatar}>{initials(s.full_name)}</div>
                                    <div>
                                      <p className={styles.studentName}>{s.full_name}</p>
                                      <p className={styles.studentNum}>{s.student_number ?? '—'}</p>
                                    </div>
                                  </div>
                                </td>
                                <td>
                                  <input
                                    className={styles.scoreInput}
                                    type="number" min="0" max={maxNum}
                                    placeholder="—"
                                    value={raw}
                                    onChange={e =>
                                      setScores(prev => ({ ...prev, [s.student_id]: e.target.value }))
                                    }
                                    style={isOver ? { borderColor: 'var(--error)' } : {}}
                                  />
                                  {isOver && (
                                    <span style={{ fontSize: '0.68rem', color: 'var(--error)', marginLeft: 6 }}>
                                      max {maxNum}
                                    </span>
                                  )}
                                </td>
                                <td>
                                  <div className={`${styles.gradeBadge} ${grade === '—' ? styles.gradeEmpty : gradeStyle(grade)}`}>
                                    {grade}
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className={styles.actionRow}>
                  <button className={styles.secondaryBtn} onClick={() => setStep(2)}>← Back</button>
                  <button
                    className={styles.primaryBtn}
                    onClick={handleSubmit}
                    disabled={isSubmitting || filledCount === 0}
                  >
                    <IconSave />
                    {isSubmitting
                      ? 'Saving…'
                      : `Save${filledCount > 0 ? ` (${filledCount})` : ''} Results`}
                  </button>
                  <span className={styles.submitCount}>
                    {filledCount} / {classStudents.length} filled
                  </span>
                </div>
              </div>
            )}

          </main>
        </div>
      </div>
    </div>
  )
}
