'use client'
// src/app/dashboard/teacher/quizzes/QuizzesClient.tsx
// FIX #8: class_id from teacher's assigned classes (not free text)
// FIX #8: scheduled_at, closes_at, attempt_limit fields added
// FIX #1: subject auto-filled from class_teachers assignment

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { AwardIcon, PlusIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'

interface Props { profile: any; school: any; userId: string }

interface TeacherClass {
  class_id:   string
  class_name: string
  subject:    string | null
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
  const [quizzes,        setQuizzes]        = useState<any[]>([])
  const [teacherClasses, setTeacherClasses] = useState<TeacherClass[]>([])
  const [loading,        setLoading]        = useState(true)
  const [step,           setStep]           = useState<'list' | 'create' | 'questions'>('list')
  const [saving,         setSaving]         = useState(false)
  const [newQuiz,        setNewQuiz]        = useState<any>(null)
  const [questions,      setQuestions]      = useState<Question[]>([{ ...BLANK_Q }])
  const [form, setForm] = useState({
    title:         '',
    subject:       '',
    class_id:      '',
    term:          '1st Term',
    duration_min:  30,
    total_marks:   10,
    scheduled_at:  '',
    closes_at:     '',
    attempt_limit: 1,
  })
  const searchParams = useSearchParams()
  const supabase = createClient()
  const sc       = school?.primary_color ?? '#7C3AED'

  useEffect(() => {
    loadTeacherClasses()
    load()
  }, [])

  // Pre-fill from Classes quick action
  useEffect(() => {
    const classId = searchParams.get('class_id')
    if (classId) {
      setForm(prev => ({ ...prev, class_id: classId }))
      setStep('create')
    }
  }, [searchParams])

  async function loadTeacherClasses() {
    const { data } = await supabase
      .from('class_teachers')
      .select('class_id, subject, classes(name)')
      .eq('teacher_id', userId)
      .eq('school_id', school?.id)
    if (data) {
      setTeacherClasses(data.map((ct: any) => ({
        class_id:   ct.class_id,
        class_name: ct.classes?.name ?? '',
        subject:    ct.subject,
      })))
    }
  }

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('quizzes')
      .select('id, title, subject, class_id, term, duration_min, total_marks, status, scheduled_at, closes_at, attempt_limit, created_at, classes(name)')
      .eq('school_id', school?.id)
      .eq('teacher_id', userId)
      .order('created_at', { ascending: false })
      .limit(30)
    if (data) setQuizzes(data)
    setLoading(false)
  }

  async function createQuiz() {
    if (!form.title || !form.subject) return
    setSaving(true)

    const payload: any = {
      title:         form.title,
      subject:       form.subject,
      class_id:      form.class_id || null,
      term:          form.term,
      duration_min:  form.duration_min,
      total_marks:   form.total_marks,
      attempt_limit: form.attempt_limit,
      school_id:     school?.id,
      teacher_id:    userId,
      status:        'draft',
    }
    // Only include scheduling if provided
    if (form.scheduled_at) payload.scheduled_at = new Date(form.scheduled_at).toISOString()
    if (form.closes_at)    payload.closes_at    = new Date(form.closes_at).toISOString()

    const { data } = await supabase
      .from('quizzes')
      .insert(payload)
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
      questions.map((q, i) => ({ quiz_id: newQuiz.id, ...q, position: i }))
    )
    setSaving(false)
    setStep('list')
    load()
  }

  async function togglePublish(id: string, status: string) {
    const next = status === 'draft' ? 'published' : 'draft'
    await supabase.from('quizzes').update({ status: next }).eq('id', id)
    setQuizzes(prev => prev.map(q => q.id === id ? { ...q, status: next } : q))
  }

  async function deleteQuiz(id: string) {
    await supabase.from('quizzes').delete().eq('id', id)
    setQuizzes(prev => prev.filter(q => q.id !== id))
  }

  function classLabel(cls: TeacherClass) {
    return `${cls.class_name}${cls.subject ? ` (${cls.subject})` : ''}`
  }

  // ── Question builder ──────────────────────────────────────────
  if (step === 'questions') return (
    <RolePageWrapper userId={userId} role="teacher" profile={profile} school={school} title="Add Questions">
      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 'var(--space-5)' }}>
        Quiz: <strong style={{ color: 'var(--text-primary)' }}>{newQuiz?.title}</strong>
        {newQuiz?.classes?.name && (
          <span style={{ color: sc, marginLeft: 8 }}>· {newQuiz.classes.name}</span>
        )}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
        {questions.map((q, qi) => (
          <div key={qi} style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: sc }}>Q{qi + 1}</span>
              {questions.length > 1 && (
                <button onClick={() => setQuestions(prev => prev.filter((_, i) => i !== qi))}
                  style={{ fontSize: '0.72rem', color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
                  Remove
                </button>
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

        {/* Title + Subject row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
          {[
            { key: 'title',   label: 'Quiz Title *',  placeholder: 'e.g. Chapter 5 Test' },
            { key: 'subject', label: 'Subject *',      placeholder: 'e.g. Mathematics'    },
          ].map(f => (
            <div key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>{f.label}</label>
              <input type="text" value={(form as any)[f.key]}
                onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                style={{ height: 40, padding: '0 12px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }} />
            </div>
          ))}
        </div>

        {/* Class selector — FIX #8 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Assign to Class</label>
          <select value={form.class_id}
            onChange={e => {
              const cls = teacherClasses.find(c => c.class_id === e.target.value)
              setForm(prev => ({
                ...prev,
                class_id: e.target.value,
                subject: cls?.subject || prev.subject,
              }))
            }}
            style={{ height: 40, padding: '0 12px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }}>
            <option value="">Select a class *</option>
            {teacherClasses.map(cls => (
              <option key={`${cls.class_id}-${cls.subject}`} value={cls.class_id}>
                {classLabel(cls)}
              </option>
            ))}
          </select>
          <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', margin: 0 }}>
            Only students in this class will see and take this quiz
          </p>
        </div>

        {/* Term + Duration + Marks */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-3)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Term</label>
            <select value={form.term} onChange={e => setForm(prev => ({ ...prev, term: e.target.value }))}
              style={{ height: 40, padding: '0 12px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }}>
              {['1st Term', '2nd Term', '3rd Term'].map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Duration (mins)</label>
            <input type="number" min={5} value={form.duration_min}
              onChange={e => setForm(prev => ({ ...prev, duration_min: Number(e.target.value) }))}
              style={{ height: 40, padding: '0 12px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Total Marks</label>
            <input type="number" min={1} value={form.total_marks}
              onChange={e => setForm(prev => ({ ...prev, total_marks: Number(e.target.value) }))}
              style={{ height: 40, padding: '0 12px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }} />
          </div>
        </div>

        {/* Scheduling — FIX #8 */}
        <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 10, padding: 'var(--space-4)' }}>
          <p style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 var(--space-3)' }}>
            Scheduling (optional)
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Opens At</label>
              <input type="datetime-local" value={form.scheduled_at}
                onChange={e => setForm(prev => ({ ...prev, scheduled_at: e.target.value }))}
                style={{ height: 40, padding: '0 12px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.82rem', outline: 'none' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Closes At</label>
              <input type="datetime-local" value={form.closes_at}
                onChange={e => setForm(prev => ({ ...prev, closes_at: e.target.value }))}
                style={{ height: 40, padding: '0 12px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.82rem', outline: 'none' }} />
            </div>
          </div>
          <div style={{ marginTop: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Attempt Limit</label>
            <select value={form.attempt_limit}
              onChange={e => setForm(prev => ({ ...prev, attempt_limit: Number(e.target.value) }))}
              style={{ height: 40, padding: '0 12px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none', maxWidth: 200 }}>
              {[1, 2, 3, 5].map(n => (
                <option key={n} value={n}>{n === 1 ? '1 attempt (default)' : `${n} attempts`}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <button onClick={createQuiz} disabled={saving || !form.title || !form.subject || !form.class_id}
            style={{ flex: 1, height: 44, background: sc, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer', opacity: saving || !form.class_id ? 0.5 : 1 }}>
            {saving ? 'Creating...' : 'Continue → Add Questions'}
          </button>
          <button onClick={() => { setStep('list'); setForm({ title: '', subject: '', class_id: '', term: '1st Term', duration_min: 30, total_marks: 10, scheduled_at: '', closes_at: '', attempt_limit: 1 }) }}
            style={{ height: 44, padding: '0 16px', background: 'transparent', border: '1px solid var(--glass-border)', borderRadius: 10, color: 'var(--text-muted)', fontSize: '0.85rem', cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
        {!form.class_id && (
          <p style={{ fontSize: '0.72rem', color: '#EF4444', margin: '-8px 0 0', textAlign: 'center' }}>
            Select a class before continuing
          </p>
        )}
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
          {quizzes.map(q => (
            <div key={q.id} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 14px',
              background: 'var(--glass-bg)',
              border: '1px solid var(--glass-border)',
              borderRadius: 12,
            }}>
              <div style={{ width: 40, height: 40, borderRadius: 8, background: sc + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <AwardIcon size={18} color={sc} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: '0 0 2px', fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.88rem' }}>
                  {q.title}
                </p>
                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                  {q.subject}
                  {q.classes?.name ? ` · ${q.classes.name}` : ''}
                  {' · '}{q.term}
                  {' · '}{q.duration_min}min
                  {q.scheduled_at ? ` · Opens ${new Date(q.scheduled_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}` : ''}
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                <span style={{
                  padding: '3px 8px',
                  borderRadius: 999,
                  background: STATUS_COLOR[q.status] + '20',
                  color: STATUS_COLOR[q.status],
                  fontSize: '0.65rem',
                  fontWeight: 800,
                  textTransform: 'uppercase' as const,
                  letterSpacing: '0.06em',
                }}>
                  {q.status}
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => togglePublish(q.id, q.status)}
                    style={{ fontSize: '0.7rem', fontWeight: 700, color: q.status === 'draft' ? sc : '#F59E0B', background: 'none', border: 'none', cursor: 'pointer' }}>
                    {q.status === 'draft' ? 'Publish' : 'Unpublish'}
                  </button>
                  <button onClick={() => deleteQuiz(q.id)}
                    style={{ fontSize: '0.7rem', fontWeight: 700, color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer' }}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ height: 100 }} />
    </RolePageWrapper>
  )
}
