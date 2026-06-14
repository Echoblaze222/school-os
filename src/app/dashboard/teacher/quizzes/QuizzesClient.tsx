'use client'
// FIXED: uses class_subject_id (resolves from class_teachers), correct schema columns
// starts_at/ends_at (NOT scheduled_at/closes_at for required fields), created_by not teacher_id
// quiz_questions stored in quiz_questions table

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { AwardIcon, PlusIcon, PeopleIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'

interface Props { profile: any; school: any; userId: string }

interface TeacherClass {
  class_id: string
  class_name: string
  subject: string | null
  class_subject_id: string | null
}

type Question = {
  question: string
  options: { label: string; text: string }[]
  answer: string
  marks: number
}

const BLANK_Q: Question = {
  question: '',
  options: [
    { label: 'A', text: '' }, { label: 'B', text: '' },
    { label: 'C', text: '' }, { label: 'D', text: '' },
  ],
  answer: 'A',
  marks: 1,
}

const STATUS_COLOR: Record<string, string> = {
  draft: '#F59E0B', published: '#10B981', closed: '#6B7280',
}

export default function QuizzesClient({ profile, school, userId }: Props) {
  const [quizzes, setQuizzes] = useState<any[]>([])
  const [teacherClasses, setTeacherClasses] = useState<TeacherClass[]>([])
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState<'list' | 'create' | 'questions'>('list')
  const [saving, setSaving] = useState(false)
  const [newQuiz, setNewQuiz] = useState<any>(null)
  const [questions, setQuestions] = useState<Question[]>([{ ...BLANK_Q }])
  const [attemptCounts, setAttemptCounts] = useState<Record<string, number>>({})
  const [form, setForm] = useState({
    title: '',
    class_id: '',
    class_subject_id: '',
    term: 'First Term',
    total_marks: 10,
    starts_at: '',
    ends_at: '',
    attempt_limit: 1,
  })
  const searchParams = useSearchParams()
  const supabase = createClient()
  const sc = school?.primary_color ?? '#7C3AED'

  useEffect(() => {
    loadTeacherClasses()
    loadQuizzes()
  }, [])

  useEffect(() => {
    const classId = searchParams.get('class_id')
    if (classId) {
      setForm(prev => ({ ...prev, class_id: classId }))
      setStep('create')
    }
  }, [searchParams])

  async function loadTeacherClasses() {
    const { data: ct } = await supabase
      .from('class_teachers')
      .select('class_id, subject, classes(name)')
      .eq('teacher_id', userId)
      .eq('school_id', school?.id)

    if (!ct?.length) return

    const list: TeacherClass[] = await Promise.all(
      ct.map(async (row: any) => {
        const { data: cs } = await supabase
          .from('class_subjects')
          .select('id')
          .eq('class_id', row.class_id)
          .limit(1)
          .maybeSingle()
        return {
          class_id: row.class_id,
          class_name: row.classes?.name ?? '',
          subject: row.subject,
          class_subject_id: cs?.id ?? null,
        }
      })
    )
    setTeacherClasses(list)
    if (list[0]) {
      setForm(f => ({ ...f, class_id: list[0].class_id, class_subject_id: list[0].class_subject_id ?? '' }))
    }
  }

  async function loadQuizzes() {
    setLoading(true)
    const { data } = await supabase
      .from('quizzes')
      .select('id, title, total_marks, attempt_limit, starts_at, ends_at, created_at, class_id, class_subject_id, classes(name)')
      .eq('school_id', school?.id)
      .eq('created_by', userId)  // FIXED: created_by not teacher_id
      .order('created_at', { ascending: false })
      .limit(30)
    if (data) {
      setQuizzes(data)
      // Load attempt counts
      const ids = data.map((q: any) => q.id)
      if (ids.length) {
        const { data: attempts } = await supabase
          .from('quiz_attempts')
          .select('quiz_id')
          .in('quiz_id', ids)
        if (attempts) {
          const counts: Record<string, number> = {}
          attempts.forEach((a: any) => { counts[a.quiz_id] = (counts[a.quiz_id] ?? 0) + 1 })
          setAttemptCounts(counts)
        }
      }
    }
    setLoading(false)
  }

  async function createQuiz() {
    const cls = teacherClasses.find(c => c.class_id === form.class_id)
    if (!cls?.class_subject_id) {
      alert('No class_subject found. Ensure subjects are assigned to classes by the principal.')
      return
    }
    if (!form.title) return
    setSaving(true)

    // FIXED: starts_at/ends_at required, class_subject_id required, created_by not teacher_id
    const now = new Date()
    const defaultEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

    const { data } = await supabase
      .from('quizzes')
      .insert({
        class_subject_id: cls.class_subject_id,
        class_id: form.class_id,
        title: form.title,
        total_marks: form.total_marks,
        attempt_limit: form.attempt_limit,
        starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : now.toISOString(),
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : defaultEnd.toISOString(),
        scheduled_at: form.starts_at ? new Date(form.starts_at).toISOString() : now.toISOString(),
        closes_at: form.ends_at ? new Date(form.ends_at).toISOString() : defaultEnd.toISOString(),
        created_by: userId,  // FIXED: created_by
        school_id: school?.id,
      })
      .select()
      .single()

    if (data) {
      setNewQuiz(data)
      setQuestions([{ ...BLANK_Q }])
      setStep('questions')
    }
    setSaving(false)
  }

  async function saveQuestions() {
    if (!newQuiz) return
    setSaving(true)
    await supabase.from('quiz_questions').insert(
      questions.map((q, i) => ({
        quiz_id: newQuiz.id,
        question: q.question,
        options: q.options,
        answer: q.answer,
        marks: q.marks,
        position: i,
      }))
    )
    setSaving(false)
    setStep('list')
    loadQuizzes()
  }

  async function togglePublish(id: string, currentEnds: string) {
    // Toggle by moving ends_at: if already ended, extend; if active, close now
    const now = new Date()
    const isActive = new Date(currentEnds) > now
    const newEndsAt = isActive
      ? now.toISOString()  // close immediately
      : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()  // extend 7 days
    await supabase.from('quizzes').update({ ends_at: newEndsAt, closes_at: newEndsAt }).eq('id', id)
    loadQuizzes()
  }

  async function deleteQuiz(id: string) {
    if (!confirm('Delete this quiz and all its questions?')) return
    await supabase.from('quiz_questions').delete().eq('quiz_id', id)
    await supabase.from('quizzes').delete().eq('id', id)
    setQuizzes(prev => prev.filter(q => q.id !== id))
  }

  function quizStatus(q: any): string {
    const now = new Date()
    if (new Date(q.starts_at) > now) return 'scheduled'
    if (new Date(q.ends_at) > now) return 'live'
    return 'closed'
  }

  // ── Question builder ──────────────────────────────────────────
  if (step === 'questions') return (
    <RolePageWrapper userId={userId} role="teacher" profile={profile} school={school} title="Add Questions">
      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 'var(--space-5)' }}>
        Quiz: <strong style={{ color: 'var(--text-primary)' }}>{newQuiz?.title}</strong>
        {newQuiz?.classes?.name && <span style={{ color: sc, marginLeft: 8 }}>· {newQuiz.classes.name}</span>}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
        {questions.map((q, qi) => (
          <div key={qi} style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: sc }}>Q{qi + 1}</span>
              {questions.length > 1 && (
                <button onClick={() => setQuestions(prev => prev.filter((_, i) => i !== qi))}
                  style={{ fontSize: '0.72rem', color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>Remove</button>
              )}
            </div>
            <textarea value={q.question}
              onChange={e => setQuestions(prev => prev.map((x, i) => i === qi ? { ...x, question: e.target.value } : x))}
              placeholder="Type the question here..." rows={2}
              style={{ width: '100%', padding: '8px 12px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none', resize: 'none', marginBottom: 'var(--space-3)', boxSizing: 'border-box' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
              {q.options.map((opt, oi) => (
                <div key={opt.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 800, fontSize: '0.8rem', color: q.answer === opt.label ? '#10B981' : 'var(--text-muted)', width: 16, flexShrink: 0 }}>{opt.label}</span>
                  <input value={opt.text}
                    onChange={e => setQuestions(prev => prev.map((x, i) => i === qi ? { ...x, options: x.options.map((o, j) => j === oi ? { ...o, text: e.target.value } : o) } : x))}
                    placeholder={`Option ${opt.label}`}
                    style={{ flex: 1, height: 36, padding: '0 10px', background: 'var(--input-bg)', border: `1px solid ${q.answer === opt.label ? '#10B981' : 'var(--input-border)'}`, borderRadius: 6, color: 'var(--text-primary)', fontSize: '0.82rem', outline: 'none' }} />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)' }}>Correct Answer</label>
                <select value={q.answer}
                  onChange={e => setQuestions(prev => prev.map((x, i) => i === qi ? { ...x, answer: e.target.value } : x))}
                  style={{ height: 36, padding: '0 10px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 6, color: '#10B981', fontWeight: 700, fontSize: '0.85rem', outline: 'none' }}>
                  {q.options.map(o => <option key={o.label} value={o.label}>{o.label}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)' }}>Marks</label>
                <input type="number" min={1} value={q.marks}
                  onChange={e => setQuestions(prev => prev.map((x, i) => i === qi ? { ...x, marks: Number(e.target.value) } : x))}
                  style={{ width: 64, height: 36, padding: '0 10px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-5)' }}>
        <button onClick={() => setQuestions(prev => [...prev, { ...BLANK_Q }])}
          style={{ flex: 1, height: 40, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 8, color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
          + Add Question
        </button>
        <button onClick={saveQuestions} disabled={saving || questions.some(q => !q.question)}
          style={{ flex: 1, height: 40, background: sc, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Saving...' : `Save ${questions.length} Question${questions.length !== 1 ? 's' : ''}`}
        </button>
      </div>
    </RolePageWrapper>
  )

  // ── Create form ───────────────────────────────────────────────
  if (step === 'create') return (
    <RolePageWrapper userId={userId} role="teacher" profile={profile} school={school} title="New Quiz">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
          <div style={{ gridColumn: '1/-1', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Quiz Title *</label>
            <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Chapter 5 Test"
              style={{ height: 40, padding: '0 12px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }} />
          </div>

          {/* Class selector — resolves class_subject_id */}
          <div style={{ gridColumn: '1/-1', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Assign to Class *</label>
            <select value={form.class_id}
              onChange={e => {
                const cls = teacherClasses.find(c => c.class_id === e.target.value)
                setForm(f => ({ ...f, class_id: e.target.value, class_subject_id: cls?.class_subject_id ?? '' }))
              }}
              style={{ height: 40, padding: '0 12px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }}>
              <option value="">Select a class</option>
              {teacherClasses.map(cls => (
                <option key={cls.class_id} value={cls.class_id}>
                  {cls.class_name}{cls.subject ? ` (${cls.subject})` : ''}
                </option>
              ))}
            </select>
            {form.class_id && !teacherClasses.find(c => c.class_id === form.class_id)?.class_subject_id && (
              <p style={{ fontSize: '0.7rem', color: '#F59E0B', margin: 0 }}>⚠️ No subject mapping found. Ask principal to assign subjects to this class.</p>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Total Marks</label>
            <input type="number" min={1} value={form.total_marks}
              onChange={e => setForm(f => ({ ...f, total_marks: Number(e.target.value) }))}
              style={{ height: 40, padding: '0 12px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Attempt Limit</label>
            <select value={form.attempt_limit} onChange={e => setForm(f => ({ ...f, attempt_limit: Number(e.target.value) }))}
              style={{ height: 40, padding: '0 12px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }}>
              {[1, 2, 3, 5].map(n => <option key={n} value={n}>{n === 1 ? '1 attempt' : `${n} attempts`}</option>)}
            </select>
          </div>
        </div>

        <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 10, padding: 'var(--space-4)' }}>
          <p style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 var(--space-3)' }}>Scheduling</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Opens At</label>
              <input type="datetime-local" value={form.starts_at} onChange={e => setForm(f => ({ ...f, starts_at: e.target.value }))}
                style={{ height: 40, padding: '0 12px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.82rem', outline: 'none' }} />
              <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', margin: 0 }}>Leave blank = open now</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Closes At</label>
              <input type="datetime-local" value={form.ends_at} onChange={e => setForm(f => ({ ...f, ends_at: e.target.value }))}
                style={{ height: 40, padding: '0 12px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.82rem', outline: 'none' }} />
              <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', margin: 0 }}>Leave blank = 7 days from now</p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <button onClick={createQuiz} disabled={saving || !form.title || !form.class_id}
            style={{ flex: 1, height: 44, background: sc, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer', opacity: saving || !form.class_id ? 0.5 : 1 }}>
            {saving ? 'Creating...' : 'Continue → Add Questions'}
          </button>
          <button onClick={() => setStep('list')}
            style={{ height: 44, padding: '0 16px', background: 'transparent', border: '1px solid var(--glass-border)', borderRadius: 10, color: 'var(--text-muted)', fontSize: '0.85rem', cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      </div>
      <div style={{ height: 100 }} />
    </RolePageWrapper>
  )

  // ── Quiz list ─────────────────────────────────────────────────
  return (
    <RolePageWrapper userId={userId} role="teacher" profile={profile} school={school} title="Quizzes">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-4)' }}>
        <button onClick={() => setStep('create')}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', background: sc, color: '#fff', border: 'none', borderRadius: 999, fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
          <PlusIcon size={13} color="white" /> New Quiz
        </button>
      </div>

      {loading ? (
        <div className={styles.loading}><span /><span /><span /></div>
      ) : quizzes.length === 0 ? (
        <div className={styles.empty}>
          <AwardIcon size={40} color="var(--text-faint)" strokeWidth={1} />
          <p>No quizzes yet. Create your first one.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {quizzes.map(q => {
            const status = quizStatus(q)
            const statusCol = status === 'live' ? '#10B981' : status === 'scheduled' ? '#F59E0B' : '#6B7280'
            const statusLabel = status === 'live' ? 'Live' : status === 'scheduled' ? 'Scheduled' : 'Closed'
            return (
              <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 8, background: sc + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <AwardIcon size={18} color={sc} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: '0 0 2px', fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.88rem' }}>{q.title}</p>
                  <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                    {q.classes?.name ?? '—'}
                    {' · '}{q.total_marks} marks
                    {' · '}{attemptCounts[q.id] ?? 0} attempt{(attemptCounts[q.id] ?? 0) !== 1 ? 's' : ''}
                  </p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                  <span style={{ padding: '3px 8px', borderRadius: 999, background: statusCol + '20', color: statusCol, fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {statusLabel}
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => togglePublish(q.id, q.ends_at)}
                      style={{ fontSize: '0.7rem', fontWeight: 700, color: status === 'live' ? '#F59E0B' : sc, background: 'none', border: 'none', cursor: 'pointer' }}>
                      {status === 'live' ? 'Close' : 'Open'}
                    </button>
                    <button onClick={() => deleteQuiz(q.id)}
                      style={{ fontSize: '0.7rem', fontWeight: 700, color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer' }}>
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
      <div style={{ height: 100 }} />
    </RolePageWrapper>
  )
}
