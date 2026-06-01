'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { AwardIcon, PlusIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'

interface Props { profile: any; school: any; userId: string }
type Question = { question: string; options: { label: string; text: string }[]; answer: string; marks: number }

export default function QuizzesClient({ profile, school, userId }: Props) {
  const [quizzes,   setQuizzes]   = useState<any[]>([])
  const [loading,   setLoading]   = useState(true)
  const [step,      setStep]      = useState<'list'|'create'|'questions'>('list')
  const [saving,    setSaving]    = useState(false)
  const [newQuiz,   setNewQuiz]   = useState<any>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [form,      setForm]      = useState({ title:'', subject:'', class_level:'', term:'1st Term', duration_min:30, total_marks:10 })
  const supabase = createClient()
  const sc       = school?.primary_color ?? '#7C3AED'

  const BLANK_Q: Question = {
    question: '',
    options:  [{ label:'A', text:'' },{ label:'B', text:'' },{ label:'C', text:'' },{ label:'D', text:'' }],
    answer:   'A',
    marks:    1,
  }

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('quizzes')
      .select('id, title, subject, class_level, term, duration_min, total_marks, status, created_at')
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
    const { data } = await supabase
      .from('quizzes')
      .insert({ ...form, school_id: school?.id, teacher_id: userId, status: 'draft' })
      .select().single()
    if (data) { setNewQuiz(data); setQuestions([{ ...BLANK_Q }]); setStep('questions') }
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

  const STATUS_COLOR: Record<string, string> = { draft:'#F59E0B', published:'#10B981', closed:'#6B7280' }

  // — Questions builder
  if (step === 'questions') return (
    <RolePageWrapper userId={userId} role="teacher" profile={profile} school={school} title="Add Questions">
      <p style={{ fontSize:'0.8rem', color:'var(--text-muted)', marginBottom:'var(--space-5)' }}>
        Quiz: <strong style={{ color:'var(--text-primary)' }}>{newQuiz?.title}</strong>
      </p>
      <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-4)', marginBottom:'var(--space-5)' }}>
        {questions.map((q, qi) => (
          <div key={qi} style={{ background:'var(--glass-bg)', border:'1px solid var(--glass-border)', borderRadius:'var(--radius-xl)', padding:'var(--space-5)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'var(--space-3)' }}>
              <span style={{ fontSize:'0.75rem', fontWeight:800, color:sc }}>Q{qi + 1}</span>
              {questions.length > 1 && (
                <button onClick={() => setQuestions(prev => prev.filter((_, i) => i !== qi))}
                  style={{ fontSize:'0.72rem', color:'#EF4444', background:'none', border:'none', cursor:'pointer', fontWeight:700 }}>Remove</button>
              )}
            </div>
            <textarea value={q.question}
              onChange={e => setQuestions(prev => prev.map((x, i) => i === qi ? { ...x, question: e.target.value } : x))}
              placeholder="Type the question here..." rows={2}
              style={{ width:'100%', padding:'8px 12px', background:'var(--input-bg)', border:'1px solid var(--input-border)', borderRadius:8, color:'var(--text-primary)', fontSize:'0.85rem', outline:'none', resize:'none', marginBottom:'var(--space-3)', boxSizing:'border-box' }}/>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--space-2)', marginBottom:'var(--space-3)' }}>
              {q.options.map((opt, oi) => (
                <div key={opt.label} style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontWeight:800, fontSize:'0.8rem', color: q.answer===opt.label ? '#10B981' : 'var(--text-muted)', width:16, flexShrink:0 }}>{opt.label}</span>
                  <input value={opt.text}
                    onChange={e => setQuestions(prev => prev.map((x, i) => i === qi ? { ...x, options: x.options.map((o, j) => j === oi ? { ...o, text: e.target.value } : o) } : x))}
                    placeholder={`Option ${opt.label}`}
                    style={{ flex:1, height:36, padding:'0 10px', background:'var(--input-bg)', border:`1px solid ${q.answer===opt.label ? '#10B981' : 'var(--input-border)'}`, borderRadius:6, color:'var(--text-primary)', fontSize:'0.82rem', outline:'none' }}/>
                </div>
              ))}
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:'var(--space-4)' }}>
              <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                <label style={{ fontSize:'0.68rem', fontWeight:700, color:'var(--text-muted)' }}>Correct Answer</label>
                <select value={q.answer}
                  onChange={e => setQuestions(prev => prev.map((x, i) => i === qi ? { ...x, answer: e.target.value } : x))}
                  style={{ height:36, padding:'0 10px', background:'var(--input-bg)', border:'1px solid var(--input-border)', borderRadius:6, color:'#10B981', fontWeight:700, fontSize:'0.85rem', outline:'none' }}>
                  {q.options.map(o => <option key={o.label} value={o.label}>{o.label}</option>)}
                </select>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                <label style={{ fontSize:'0.68rem', fontWeight:700, color:'var(--text-muted)' }}>Marks</label>
                <input type="number" value={q.marks} min={1}
                  onChange={e => setQuestions(prev => prev.map((x, i) => i === qi ? { ...x, marks: +e.target.value } : x))}
                  style={{ width:64, height:36, padding:'0 10px', background:'var(--input-bg)', border:'1px solid var(--input-border)', borderRadius:6, color:'var(--text-primary)', fontSize:'0.85rem', outline:'none' }}/>
              </div>
            </div>
          </div>
        ))}
      </div>
      <button onClick={() => setQuestions(prev => [...prev, { ...BLANK_Q }])}
        style={{ width:'100%', height:40, background:'var(--glass-bg)', border:`1px dashed ${sc}`, borderRadius:8, color:sc, fontWeight:700, fontSize:'0.85rem', cursor:'pointer', marginBottom:'var(--space-4)' }}>
        + Add Question
      </button>
      <div style={{ display:'flex', gap:'var(--space-2)' }}>
        <button onClick={saveQuestions} disabled={saving || questions.some(q => !q.question)}
          style={{ flex:2, height:48, background:sc, color:'#fff', border:'none', borderRadius:12, fontWeight:700, fontSize:'0.9rem', cursor:'pointer', opacity:saving?0.6:1 }}>
          {saving ? 'Saving...' : `Save ${questions.length} Question${questions.length!==1?'s':''}`}
        </button>
        <button onClick={() => { setStep('list'); load() }}
          style={{ flex:1, height:48, background:'var(--glass-bg)', border:'1px solid var(--glass-border)', borderRadius:12, color:'var(--text-muted)', fontWeight:600, fontSize:'0.85rem', cursor:'pointer' }}>
          Skip
        </button>
      </div>
      <div className={styles.spacer}/>
    </RolePageWrapper>
  )

  return (
    <RolePageWrapper userId={userId} role="teacher" profile={profile} school={school} title="Quizzes">

      {step === 'create' ? (
        <div style={{ background:'var(--glass-bg)', border:'1px solid var(--glass-border)', borderRadius:'var(--radius-xl)', padding:'var(--space-5)', marginBottom:'var(--space-5)' }}>
          <p style={{ fontWeight:700, color:'var(--text-primary)', marginBottom:'var(--space-4)', fontSize:'0.9rem' }}>New Quiz</p>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--space-3)' }}>
            {[
              { key:'title',        label:'Title *',       placeholder:'e.g. Chapter 3 Quiz' },
              { key:'subject',      label:'Subject *',     placeholder:'e.g. Mathematics'    },
              { key:'class_level',  label:'Class Level',   placeholder:'e.g. JSS 2'          },
              { key:'term',         label:'Term',          type:'select', options:['1st Term','2nd Term','3rd Term'] },
              { key:'duration_min', label:'Duration (min)',type:'number', placeholder:'30'    },
              { key:'total_marks',  label:'Total Marks',   type:'number', placeholder:'10'   },
            ].map(f => (
              <div key={f.key} style={{ display:'flex', flexDirection:'column', gap:4 }}>
                <label style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--text-secondary)' }}>{f.label}</label>
                {f.type === 'select'
                  ? <select value={(form as any)[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                      style={{ height:40, padding:'0 12px', background:'var(--input-bg)', border:'1px solid var(--input-border)', borderRadius:8, color:'var(--text-primary)', fontSize:'0.85rem', outline:'none' }}>
                      {(f.options??[]).map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  : <input type={f.type??'text'} value={(form as any)[f.key]}
                      onChange={e => setForm(p => ({ ...p, [f.key]: f.type==='number' ? +e.target.value : e.target.value }))}
                      placeholder={f.placeholder??''}
                      style={{ height:40, padding:'0 12px', background:'var(--input-bg)', border:'1px solid var(--input-border)', borderRadius:8, color:'var(--text-primary)', fontSize:'0.85rem', outline:'none' }}/>
                }
              </div>
            ))}
          </div>
          <div style={{ display:'flex', gap:'var(--space-2)', marginTop:'var(--space-4)' }}>
            <button onClick={createQuiz} disabled={saving || !form.title || !form.subject}
              style={{ flex:1, height:40, background:sc, color:'#fff', border:'none', borderRadius:8, fontWeight:700, fontSize:'0.85rem', cursor:'pointer', opacity:saving?0.6:1 }}>
              {saving ? 'Creating...' : 'Next: Add Questions →'}
            </button>
            <button onClick={() => setStep('list')}
              style={{ flex:1, height:40, background:'var(--glass-bg)', border:'1px solid var(--glass-border)', borderRadius:8, color:'var(--text-muted)', fontWeight:600, fontSize:'0.85rem', cursor:'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:'var(--space-4)' }}>
          <button onClick={() => setStep('create')}
            style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 14px', background:sc, color:'#fff', border:'none', borderRadius:999, fontWeight:700, fontSize:'0.8rem', cursor:'pointer' }}>
            <PlusIcon size={13} color="white"/> New Quiz
          </button>
        </div>
      )}

      {loading ? <div className={styles.loading}><span/><span/><span/></div>
        : quizzes.length === 0
          ? <div className={styles.empty}><AwardIcon size={40} color="var(--text-faint)" strokeWidth={1}/><p>No quizzes yet</p></div>
          : <div className={styles.list}>
            {quizzes.map(q => (
              <div key={q.id} className={styles.card} style={{ cursor:'default' }}>
                <div className={styles.cardIcon} style={{ background:(STATUS_COLOR[q.status]??sc)+'20' }}>
                  <AwardIcon size={16} color={STATUS_COLOR[q.status]??sc}/>
                </div>
                <div className={styles.cardBody}>
                  <p className={styles.cardTitle}>{q.title}</p>
                  <p className={styles.cardText}>{q.subject}{q.class_level ? ` · ${q.class_level}` : ''} · {q.term}</p>
                  <p className={styles.cardMeta}>{q.duration_min} min · {q.total_marks} marks</p>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:6, flexShrink:0, alignItems:'flex-end' }}>
                  <span style={{ padding:'2px 10px', borderRadius:999, fontSize:'0.65rem', fontWeight:700, background:(STATUS_COLOR[q.status]??'#6B7280')+'20', color:STATUS_COLOR[q.status]??'#6B7280' }}>
                    {q.status}
                  </span>
                  <button onClick={() => togglePublish(q.id, q.status)}
                    style={{ fontSize:'0.68rem', fontWeight:700, color: q.status==='draft' ? '#10B981' : '#F59E0B', background:'none', border:'none', cursor:'pointer' }}>
                    {q.status === 'draft' ? 'Publish' : 'Unpublish'}
                  </button>
                  <button onClick={() => deleteQuiz(q.id)}
                    style={{ fontSize:'0.68rem', fontWeight:700, color:'#EF4444', background:'none', border:'none', cursor:'pointer' }}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
      }
      <div className={styles.spacer}/>
    </RolePageWrapper>
  )
}
