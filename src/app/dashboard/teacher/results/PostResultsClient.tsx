'use client'
// src/app/dashboard/teacher/results/PostResultsClient.tsx
//
// REDESIGNED: Proper dashboard with 3 modes:
//   "overview" → landing page showing all posted results grouped by subject
//                with Edit buttons per group and a "+ Post New Results" button
//   "wizard"   → 3-step flow: pick class/subject → pick term/type → enter scores
//   "preview"  → read-only view of a specific class+term+type before editing
//
// FIXED: upsert replaced with safe check-then-insert-or-update pattern
// FIXED: academic_year computed correctly for Nigerian school calendar

import { useEffect, useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import type { TeacherClass, StudentForResult, ExistingResult } from './types'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Props {
  teacherClasses:  TeacherClass[]
  allStudents:     (StudentForResult & { class_id: string })[]
  existingResults: ExistingResult[]
  teacherId:       string
  teacherName:     string
  schoolId:        string
  academicYear?:   string
  primaryColor?:   string
  profile?:        any
  school?:         any
}

type ResultType = 'day_test' | 'mid_term' | 'exam'
type Term       = 'first' | 'second' | 'third'
type Mode       = 'overview' | 'wizard' | 'preview'

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
// Confirmed DB enum values (from pg_enum query):
// results.term      → 'first' | 'second' | 'third'
// results.result_type → 'day_test' | 'mid_term' | 'exam'
const TERM_TO_DB: Record<Term, string> = {
  first:  'first',
  second: 'second',
  third:  'third',
}
const DB_TO_TERM: Record<string, Term> = {
  first:  'first',
  second: 'second',
  third:  'third',
}
const TYPE_ORDER: Record<string, number> = { day_test: 0, mid_term: 1, exam: 2 }

function getAcademicYear(override?: string): string {
  if (override) return override
  const now = new Date()
  const y   = now.getFullYear()
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

function gradeColor(g: string) {
  if (g === 'A') return '#10B981'
  if (g === 'B') return '#3B82F6'
  if (g === 'C') return '#F59E0B'
  if (g === 'D') return '#F97316'
  return '#EF4444'
}

function gradeBg(g: string) {
  if (g === 'A') return '#10B98120'
  if (g === 'B') return '#3B82F620'
  if (g === 'C') return '#F59E0B20'
  if (g === 'D') return '#F9731620'
  return '#EF444420'
}

function initials(n: string) {
  return n.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

// ── Inline SVG icons ──────────────────────────────────────────────────────────
const IcPlus    = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
const IcEdit    = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
const IcEye     = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
const IcBack    = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
const IcCheck   = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
const IcAlert   = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
const IcSave    = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
const IcEmpty   = () => <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>

// ── Main Component ─────────────────────────────────────────────────────────────
export default function PostResultsClient({
  teacherClasses,
  allStudents,
  existingResults: initialResults,
  teacherId,
  schoolId,
  academicYear,
  primaryColor = '#7C3AED',
  teacherName,
  profile,
  school,
}: Props) {
  // Live results — starts from server data, updated after each save
  const [liveResults,  setLiveResults]  = useState<ExistingResult[]>(initialResults)

  // Navigation state
  const [mode,         setMode]         = useState<Mode>('overview')
  const [step,         setStep]         = useState(1)

  // Wizard selections
  const [selectedCS,   setSelectedCS]   = useState<TeacherClass | null>(null)
  const [term,         setTerm]         = useState<Term>('first')
  const [resultType,   setResultType]   = useState<ResultType>('day_test')
  const [maxScore,     setMaxScore]     = useState('100')
  const [scores,       setScores]       = useState<Record<string, string>>({})

  // Save state
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [errorMsg,     setErrorMsg]     = useState('')
  const [savedCount,   setSavedCount]   = useState(0)

  const currentAcademicYear = getAcademicYear(academicYear)
  const maxNum = Number(maxScore) || 100

  // ── Derived: group existing results for the overview ──────────────────────
  // Groups: { "class_subject_id|term|result_type" → { label, count, avg, rows } }
  const overviewGroups = useMemo(() => {
    const map: Record<string, {
      key:             string
      csId:            string
      subjectName:     string
      className:       string
      term:            string
      termKey:         Term
      resultType:      ResultType
      count:           number
      avg:             number
      maxScore:        number
    }> = {}

    liveResults.forEach(r => {
      const groupKey = `${r.class_subject_id}|${r.term}|${r.result_type}`
      const tc = teacherClasses.find(c => c.class_subject_id === r.class_subject_id)
      if (!map[groupKey]) {
        map[groupKey] = {
          key:         groupKey,
          csId:        r.class_subject_id,
          subjectName: tc?.subject_name ?? '—',
          className:   tc?.class_name   ?? '—',
          term:        r.term,
          termKey:     DB_TO_TERM[r.term] ?? 'first',
          resultType:  r.result_type as ResultType,
          count:       0,
          avg:         0,
          maxScore:    r.max_score,
        }
      }
      const g = map[groupKey]
      const prevTotal = g.avg * g.count
      g.count++
      g.avg = Math.round((prevTotal + (r.score / (r.max_score || 100)) * 100) / g.count)
      g.maxScore = r.max_score
    })

    return Object.values(map).sort((a, b) => {
      if (a.subjectName !== b.subjectName) return a.subjectName.localeCompare(b.subjectName)
      return (TYPE_ORDER[a.resultType] ?? 9) - (TYPE_ORDER[b.resultType] ?? 9)
    })
  }, [liveResults, teacherClasses])

  // ── Pre-fill scores when entering wizard step 3 ───────────────────────────
  useEffect(() => {
    if (mode !== 'wizard' || step !== 3 || !selectedCS) return
    const dbTerm = TERM_TO_DB[term]
    const pre: Record<string, string> = {}
    liveResults.forEach(r => {
      if (
        r.class_subject_id === selectedCS.class_subject_id &&
        r.term             === dbTerm &&
        r.result_type      === resultType
      ) {
        pre[r.student_id] = String(r.score)
      }
    })
    setScores(pre)
    setSubmitStatus('idle')
    setErrorMsg('')
  }, [mode, step, selectedCS, term, resultType, liveResults])

  // ── Students in selected class ────────────────────────────────────────────
  const classStudents = useMemo(() => {
    if (!selectedCS) return []
    return allStudents.filter(s => s.class_id === selectedCS.class_id)
  }, [selectedCS, allStudents])

  const filledCount = Object.values(scores).filter(v => v !== '' && !isNaN(Number(v))).length

  // ── Navigate: open wizard fresh ───────────────────────────────────────────
  function openNewWizard() {
    setSelectedCS(null)
    setTerm('first')
    setResultType('day_test')
    setMaxScore('100')
    setScores({})
    setSubmitStatus('idle')
    setErrorMsg('')
    setStep(1)
    setMode('wizard')
  }

  // ── Navigate: edit an existing group ─────────────────────────────────────
  function openEditWizard(group: typeof overviewGroups[0]) {
    const tc = teacherClasses.find(c => c.class_subject_id === group.csId)
    if (!tc) return
    setSelectedCS(tc)
    setTerm(group.termKey)
    setResultType(group.resultType)
    setMaxScore(String(group.maxScore))
    setScores({})            // will be pre-filled by the useEffect above
    setSubmitStatus('idle')
    setErrorMsg('')
    setStep(3)               // jump straight to score entry
    setMode('wizard')
  }

  // ── Navigate: preview a group (read-only) ────────────────────────────────
  const [previewGroup, setPreviewGroup] = useState<typeof overviewGroups[0] | null>(null)

  function openPreview(group: typeof overviewGroups[0]) {
    setPreviewGroup(group)
    setMode('preview')
  }

  // ── Save handler ──────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!selectedCS) return
    setIsSubmitting(true)
    setSubmitStatus('idle')
    setErrorMsg('')

    const supabase = createClient()
    const dbTerm   = TERM_TO_DB[term]

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

    const studentIds = studentsWithScores.map(s => s.student_id)

    // 1) Check which rows already exist
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
      setErrorMsg(`Check failed: ${fetchErr.message}`)
      return
    }

    const existingMap = new Map((existing ?? []).map(r => [r.student_id, r.id]))
    const toUpdate    = studentsWithScores.filter(s =>  existingMap.has(s.student_id))
    const toInsert    = studentsWithScores.filter(s => !existingMap.has(s.student_id))
    const errors: string[] = []

    // 2) Update existing rows
    for (const s of toUpdate) {
      const scoreNum = Math.min(Math.max(Number(scores[s.student_id]) || 0, 0), maxNum)
      const { error } = await supabase
        .from('results')
        .update({
          score:     scoreNum,
          max_score: maxNum,
          grade:     computeGrade(scoreNum, maxNum),
          posted_by: teacherId,
          posted_at: new Date().toISOString(),
        })
        .eq('id', existingMap.get(s.student_id)!)
      if (error) errors.push(error.message)
    }

    // 3) Insert new rows
    if (toInsert.length > 0) {
      const rows = toInsert.map(s => {
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
      const { error } = await supabase.from('results').insert(rows)
      if (error) errors.push(error.message)
    }

    setIsSubmitting(false)

    if (errors.length > 0) {
      setSubmitStatus('error')
      setErrorMsg(errors.join(' | '))
      return
    }

    // 4) Refresh live results from DB so overview updates immediately
    const { data: refreshed } = await supabase
      .from('results')
      .select('id, student_id, class_subject_id, result_type, term, score, max_score, grade, approved')
      .eq('school_id', schoolId)
      .in('class_subject_id', teacherClasses.map(tc => tc.class_subject_id))

    if (refreshed) setLiveResults(refreshed as ExistingResult[])

    setSavedCount(studentsWithScores.length)
    setSubmitStatus('success')
  }, [selectedCS, classStudents, scores, term, resultType, maxNum, schoolId, teacherId, currentAcademicYear, teacherClasses])

  // ── Preview rows for the selected group ───────────────────────────────────
  const previewRows = useMemo(() => {
    if (!previewGroup) return []
    return liveResults
      .filter(r =>
        r.class_subject_id === previewGroup.csId &&
        r.term             === previewGroup.term  &&
        r.result_type      === previewGroup.resultType
      )
      .map(r => ({
        ...r,
        studentName:   allStudents.find(s => s.student_id === r.student_id)?.full_name ?? 'Unknown',
        studentNumber: allStudents.find(s => s.student_id === r.student_id)?.student_number ?? '—',
      }))
      .sort((a, b) => a.studentName.localeCompare(b.studentName))
  }, [previewGroup, liveResults, allStudents])

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  // ── OVERVIEW ─────────────────────────────────────────────────────────────
  if (mode === 'overview') {
    return (
      <RolePageWrapper userId={teacherId} role="teacher" profile={profile} school={school} title="Results">
        {/* Post Results button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <button onClick={openNewWizard} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', borderRadius: 10, background: primaryColor, color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700 }}>
            <IcPlus /> Post Results
          </button>
        </div>
        {/* Stats bar */}
        {liveResults.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 20 }}>
            {[
              { label: 'Groups',   value: overviewGroups.length },
              { label: 'Students', value: new Set(liveResults.map(r => r.student_id)).size },
              { label: 'Records',  value: liveResults.length },
            ].map(s => (
              <div key={s.label} style={{
                textAlign: 'center', padding: '10px 8px',
                background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 12,
              }}>
                <p style={{ margin: '0 0 2px', fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)' }}>{s.value}</p>
                <p style={{ margin: 0, fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Posted results grouped by subject */}
        {overviewGroups.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
            <div style={{ marginBottom: 12 }}><IcEmpty /></div>
            <p style={{ margin: '0 0 4px', fontWeight: 700, color: 'var(--text-primary)' }}>No results posted yet</p>
            <p style={{ margin: '0 0 20px', fontSize: '0.8rem' }}>Tap "Post Results" to get started</p>
            <button
              onClick={openNewWizard}
              style={{
                padding: '10px 20px', borderRadius: 10,
                background: primaryColor, color: '#fff',
                border: 'none', cursor: 'pointer',
                fontSize: '0.82rem', fontWeight: 700,
              }}
            >
              + Post First Results
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {overviewGroups.map(g => (
              <div key={g.key} style={{
                background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
                borderRadius: 14, padding: '14px 16px',
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: '0 0 2px', fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {g.subjectName}
                  </p>
                  <p style={{ margin: '0 0 6px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {g.className} · {g.term} · {RESULT_TYPE_LABELS[g.resultType]}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {/* Avg badge */}
                    <span style={{
                      fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                      background: gradeBg(computeGrade(g.avg, 100)),
                      color: gradeColor(computeGrade(g.avg, 100)),
                    }}>
                      Avg {g.avg}%
                    </span>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                      {g.count} student{g.count !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button
                    onClick={() => openPreview(g)}
                    title="Preview scores"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '7px 12px', borderRadius: 8, cursor: 'pointer',
                      background: 'var(--glass-border)', border: '1px solid var(--glass-border)',
                      color: 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 700,
                    }}
                  >
                    <IcEye /> View
                  </button>
                  <button
                    onClick={() => openEditWizard(g)}
                    title="Edit scores"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '7px 12px', borderRadius: 8, cursor: 'pointer',
                      background: primaryColor, border: 'none',
                      color: '#fff', fontSize: '0.72rem', fontWeight: 700,
                    }}
                  >
                    <IcEdit /> Edit
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </RolePageWrapper>
    )
  }

  // ── PREVIEW (read-only score table) ──────────────────────────────────────
  if (mode === 'preview' && previewGroup) {
    const avgPct = previewGroup.avg
    return (
      <RolePageWrapper userId={teacherId} role="teacher" profile={profile} school={school} title={previewGroup.subjectName}>
        {/* Back + edit row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <button onClick={() => setMode('overview')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '7px 12px', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.78rem', fontWeight: 700 }}>
            <IcBack /> Back
          </button>
          <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)', flex: 1 }}>
            {previewGroup.className} · {previewGroup.term} · {RESULT_TYPE_LABELS[previewGroup.resultType]}
          </p>
          <button onClick={() => openEditWizard(previewGroup)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 8, cursor: 'pointer', background: primaryColor, border: 'none', color: '#fff', fontSize: '0.78rem', fontWeight: 700 }}>
            <IcEdit /> Edit
          </button>
        </div>
        {/* Summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
          {[
            { label: 'Students', value: previewGroup.count },
            { label: 'Avg Score', value: `${avgPct}%`, color: avgPct >= 50 ? '#10B981' : '#EF4444' },
            { label: 'Max Score', value: previewGroup.maxScore },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center', padding: '10px 8px', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 10 }}>
              <p style={{ margin: '0 0 2px', fontSize: '1.2rem', fontWeight: 800, color: (s as any).color ?? 'var(--text-primary)' }}>{s.value}</p>
              <p style={{ margin: 0, fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Score rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {previewRows.map((r, i) => {
            const pct = r.max_score > 0 ? Math.round((r.score / r.max_score) * 100) : 0
            return (
              <div key={r.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 14px', background: 'var(--glass-bg)',
                border: '1px solid var(--glass-border)', borderRadius: 12,
              }}>
                <div style={{
                  width: 34, height: 34, borderRadius: '50%',
                  background: 'var(--glass-border)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', flexShrink: 0,
                }}>
                  {initials(r.studentName)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: '0 0 2px', fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.studentName}
                  </p>
                  <p style={{ margin: 0, fontSize: '0.68rem', color: 'var(--text-muted)' }}>{r.studentNumber}</p>
                </div>
                {/* Bar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                    <span style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                      {r.score}<span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 500 }}>/{r.max_score}</span>
                    </span>
                    <div style={{ width: 56, height: 4, background: 'var(--glass-border)', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: gradeColor(r.grade), borderRadius: 999 }} />
                    </div>
                  </div>
                  <div style={{ width: 30, height: 30, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', background: gradeBg(r.grade) }}>
                    <span style={{ fontWeight: 800, fontSize: '0.82rem', color: gradeColor(r.grade) }}>{r.grade}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </RolePageWrapper>
    )
  }

  // ── WIZARD ────────────────────────────────────────────────────────────────
  const wizardTitle = step === 1 ? 'Post Results'
    : step === 2 ? 'Assessment Details'
    : `${selectedCS?.subject_name ?? ''} — ${selectedCS?.class_name ?? ''}`

  return (
    <RolePageWrapper userId={teacherId} role="teacher" profile={profile} school={school} title={wizardTitle}>

      {/* Back + step info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button onClick={() => { setMode('overview'); setStep(1) }} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '7px 12px', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.78rem', fontWeight: 700 }}>
          <IcBack /> Back
        </button>
        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Step {step} of 3{step > 1 && selectedCS ? ` · ${selectedCS.class_name}` : ''}
        </p>
      </div>

      {/* Step indicators */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
        {[1, 2, 3].map(n => (
          <div key={n} style={{
            flex: 1, height: 4, borderRadius: 999,
            background: step >= n ? primaryColor : 'var(--glass-border)',
            transition: 'background 0.2s',
          }} />
        ))}
      </div>

      {/* ── Step 1: Pick class + subject ── */}
      {step === 1 && (
        <>
          {teacherClasses.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
              <p>You are not assigned to any classes yet.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {teacherClasses.map(tc => (
                <button
                  key={tc.class_subject_id}
                  onClick={() => { setSelectedCS(tc); setStep(2) }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '14px 16px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                    background: selectedCS?.class_subject_id === tc.class_subject_id
                      ? primaryColor : 'var(--glass-bg)',
                    border: `1px solid ${selectedCS?.class_subject_id === tc.class_subject_id
                      ? primaryColor : 'var(--glass-border)'}`,
                    color: selectedCS?.class_subject_id === tc.class_subject_id ? '#fff' : 'var(--text-primary)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div>
                    <p style={{ margin: '0 0 2px', fontWeight: 700, fontSize: '0.9rem' }}>{tc.subject_name}</p>
                    <p style={{ margin: 0, fontSize: '0.72rem', opacity: 0.7 }}>{tc.class_name}</p>
                  </div>
                  <span style={{ fontSize: '1.2rem', opacity: 0.5 }}>›</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Step 2: Term, type, max score ── */}
      {step === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Term */}
          <div>
            <p style={{ margin: '0 0 10px', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Term</p>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['first', 'second', 'third'] as Term[]).map(t => (
                <button
                  key={t}
                  onClick={() => setTerm(t)}
                  style={{
                    flex: 1, padding: '10px 4px', borderRadius: 10, cursor: 'pointer',
                    fontSize: '0.78rem', fontWeight: 700,
                    background: term === t ? primaryColor : 'var(--glass-bg)',
                    border: `1px solid ${term === t ? primaryColor : 'var(--glass-border)'}`,
                    color: term === t ? '#fff' : 'var(--text-muted)',
                    transition: 'all 0.15s',
                  }}
                >
                  {TERM_LABELS[t].replace(' Term', '')}
                </button>
              ))}
            </div>
          </div>

          {/* Assessment type */}
          <div>
            <p style={{ margin: '0 0 10px', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Assessment Type</p>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['day_test', 'mid_term', 'exam'] as ResultType[]).map(rt => (
                <button
                  key={rt}
                  onClick={() => setResultType(rt)}
                  style={{
                    flex: 1, padding: '10px 4px', borderRadius: 10, cursor: 'pointer',
                    fontSize: '0.78rem', fontWeight: 700,
                    background: resultType === rt ? primaryColor : 'var(--glass-bg)',
                    border: `1px solid ${resultType === rt ? primaryColor : 'var(--glass-border)'}`,
                    color: resultType === rt ? '#fff' : 'var(--text-muted)',
                    transition: 'all 0.15s',
                  }}
                >
                  {RESULT_TYPE_LABELS[rt]}
                </button>
              ))}
            </div>
          </div>

          {/* Max score */}
          <div>
            <p style={{ margin: '0 0 10px', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Maximum Score</p>
            <input
              type="number" min="1" max="1000"
              value={maxScore}
              onChange={e => setMaxScore(e.target.value)}
              placeholder="100"
              style={{
                width: '100%', padding: '12px 14px', borderRadius: 10, boxSizing: 'border-box',
                background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
                color: 'var(--text-primary)', fontSize: '1rem', fontWeight: 600,
              }}
            />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button onClick={() => setStep(1)} style={{ flex: 1, padding: '12px', borderRadius: 10, cursor: 'pointer', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.85rem' }}>
              ← Back
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!maxScore || Number(maxScore) <= 0}
              style={{ flex: 2, padding: '12px', borderRadius: 10, cursor: 'pointer', background: primaryColor, border: 'none', color: '#fff', fontWeight: 700, fontSize: '0.85rem', opacity: (!maxScore || Number(maxScore) <= 0) ? 0.5 : 1 }}
            >
              Continue → Enter Scores
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Score entry ── */}
      {step === 3 && (
        <div>
          {/* Context reminder */}
          <div style={{ padding: '10px 14px', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 10, marginBottom: 16, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            {TERM_LABELS[term]} · {RESULT_TYPE_LABELS[resultType]} · Max {maxNum} · {currentAcademicYear}
          </div>

          {/* Status banners */}
          {submitStatus === 'success' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, background: '#10B98120', border: '1px solid #10B981', color: '#10B981', marginBottom: 14, fontSize: '0.82rem', fontWeight: 700 }}>
              <IcCheck /> Saved {savedCount} result{savedCount !== 1 ? 's' : ''} successfully!
            </div>
          )}
          {submitStatus === 'error' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, background: '#EF444420', border: '1px solid #EF4444', color: '#EF4444', marginBottom: 14, fontSize: '0.82rem', fontWeight: 700 }}>
              <IcAlert /> {errorMsg || 'Failed to save results.'}
            </div>
          )}

          {/* Student score rows */}
          {classStudents.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              No students found in this class.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {classStudents.map(s => {
                const raw   = scores[s.student_id] ?? ''
                const num   = raw !== '' ? Number(raw) : NaN
                const grade = !isNaN(num) && raw !== '' ? computeGrade(Math.min(num, maxNum), maxNum) : '—'
                const isOver = !isNaN(num) && num > maxNum
                return (
                  <div key={s.student_id} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 14px', background: 'var(--glass-bg)',
                    border: `1px solid ${isOver ? '#EF4444' : 'var(--glass-border)'}`,
                    borderRadius: 12,
                  }}>
                    {/* Avatar */}
                    <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', flexShrink: 0 }}>
                      {initials(s.full_name)}
                    </div>
                    {/* Name */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: '0 0 1px', fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.full_name}</p>
                      <p style={{ margin: 0, fontSize: '0.65rem', color: 'var(--text-muted)' }}>{s.student_number ?? '—'}</p>
                    </div>
                    {/* Score input */}
                    <input
                      type="number" min="0" max={maxNum}
                      placeholder="—"
                      value={raw}
                      onChange={e => setScores(prev => ({ ...prev, [s.student_id]: e.target.value }))}
                      style={{
                        width: 68, padding: '8px 10px', borderRadius: 8, textAlign: 'center',
                        background: 'var(--glass-bg)', fontWeight: 700, fontSize: '0.95rem',
                        color: isOver ? '#EF4444' : 'var(--text-primary)',
                        border: `1px solid ${isOver ? '#EF4444' : 'var(--glass-border)'}`,
                        flexShrink: 0,
                      }}
                    />
                    {/* Grade badge */}
                    <div style={{ width: 30, height: 30, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', background: grade !== '—' ? gradeBg(grade) : 'var(--glass-border)', flexShrink: 0 }}>
                      <span style={{ fontWeight: 800, fontSize: '0.8rem', color: grade !== '—' ? gradeColor(grade) : 'var(--text-muted)' }}>
                        {grade}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              onClick={() => setStep(2)}
              style={{ padding: '12px 16px', borderRadius: 10, cursor: 'pointer', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.85rem' }}
            >
              ← Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || filledCount === 0}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '12px', borderRadius: 10, cursor: 'pointer',
                background: primaryColor, border: 'none',
                color: '#fff', fontWeight: 700, fontSize: '0.85rem',
                opacity: (isSubmitting || filledCount === 0) ? 0.6 : 1,
              }}
            >
              <IcSave />
              {isSubmitting ? 'Saving…' : `Save ${filledCount > 0 ? `(${filledCount}) ` : ''}Results`}
            </button>
          </div>
          <p style={{ textAlign: 'center', margin: '10px 0 0', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            {filledCount} of {classStudents.length} students filled
          </p>
        </div>
      )}
    </RolePageWrapper>
  )
}
