'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import DashboardHeader from '@/components/DashboardHeader'
import StudentNav from '@/components/StudentNav'
import { ClipboardIcon, CheckCircleIcon } from '@/components/Icons'
import styles from './page.module.css'

interface Props { profile: any; school: any; userId: string }

export default function AssignmentsClient({ profile, school, userId }: Props) {
  const [items,   setItems]   = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab,     setTab]     = useState<'pending'|'submitted'|'all'>('pending')
  const supabase    = createClient()
  const schoolColor = school?.primary_color ?? '#7C3AED'

  useEffect(() => { load() }, [])

  async function load() {
    // Fetch assignments for this student's class, joined with their submission status
    const { data: subs } = await supabase
      .from('assignment_submissions')
      .select('assignment_id, status, score, feedback, submitted_at')
      .eq('student_id', userId)

    const subMap: Record<string, any> = {}
    subs?.forEach(s => { subMap[s.assignment_id] = s })

    const { data: assignments } = await supabase
      .from('assignments')
      .select('id, title, subject, description, due_date, status, created_at, class_level')
      .eq('school_id', school?.id)
      .eq('class_id', profile?.class_id)
      .order('due_date', { ascending: true })

    if (assignments) {
      setItems(assignments.map(a => ({
        ...a,
        submission: subMap[a.id] ?? null,
      })))
    }
    setLoading(false)
  }

  async function submitAssignment(assignmentId: string) {
    await supabase.from('assignment_submissions').upsert({
      assignment_id: assignmentId,
      student_id:    userId,
      school_id:     school?.id,
      status:        'submitted',
      submitted_at:  new Date().toISOString(),
    }, { onConflict: 'assignment_id,student_id' })
    setItems(prev => prev.map(i =>
      i.id === assignmentId
        ? { ...i, submission: { status: 'submitted', submitted_at: new Date().toISOString() } }
        : i
    ))
  }

  const filtered = tab === 'all' ? items
    : tab === 'submitted' ? items.filter(i => i.submission?.status === 'submitted')
    : items.filter(i => !i.submission)

  function isOverdue(due: string) { return new Date(due) < new Date() }

  return (
    <div className={styles.page}>
      <StudentNav userId={userId} profile={profile} school={school} schoolColor={schoolColor} />
      <div className={styles.content}>
        <DashboardHeader userId={userId} role="student" profile={profile} school={school}
          schoolColor={schoolColor} title="Assignments" showBack />
        <main className={styles.main}>
          <div style={{ display:'flex', gap:'var(--space-2)', marginBottom:'var(--space-5)', flexWrap:'wrap' }}>
            {([['pending','Pending'],['submitted','Submitted'],['all','All']] as const).map(([v,l]) => (
              <button key={v} onClick={() => setTab(v)}
                style={{ padding:'6px 14px', borderRadius:'999px', fontSize:'0.75rem', fontWeight:700,
                  background: tab===v ? schoolColor : 'var(--glass-bg)',
                  color: tab===v ? '#fff' : 'var(--text-muted)',
                  border:`1px solid ${tab===v ? schoolColor : 'var(--glass-border)'}`, cursor:'pointer' }}>
                {l}
              </button>
            ))}
          </div>
          {loading
            ? <div className={styles.loading}><span/><span/><span/></div>
            : filtered.length === 0
              ? <div className={styles.empty}><ClipboardIcon size={40} color="var(--text-faint)" strokeWidth={1}/><p>No {tab} assignments</p></div>
              : <div className={styles.list}>
                {filtered.map(item => {
                  const submitted = item.submission?.status === 'submitted'
                  const graded    = item.submission?.score != null
                  const overdue   = !submitted && item.due_date && isOverdue(item.due_date)
                  return (
                    <div key={item.id} className={styles.card} style={{ flexDirection:'column', gap:'var(--space-2)', cursor:'default' }}>
                      <div style={{ display:'flex', alignItems:'flex-start', gap:'var(--space-4)', width:'100%' }}>
                        <div className={styles.cardIcon} style={{ background: submitted ? '#10B98120' : overdue ? '#EF444420' : schoolColor+'20' }}>
                          <ClipboardIcon size={16} color={submitted ? '#10B981' : overdue ? '#EF4444' : schoolColor}/>
                        </div>
                        <div className={styles.cardBody}>
                          <p className={styles.cardTitle}>{item.title}</p>
                          <p className={styles.cardText}>{item.subject}{item.class_level ? ` · ${item.class_level}` : ''}</p>
                          {item.description && <p className={styles.cardText} style={{ fontSize:'0.78rem' }}>{item.description}</p>}
                          <p className={styles.cardMeta}>
                            {item.due_date ? `Due ${new Date(item.due_date).toLocaleDateString('en-NG',{day:'numeric',month:'short'})}` : 'No due date'}
                            {overdue && <span style={{ color:'#EF4444', marginLeft:6, fontWeight:700 }}>· Overdue</span>}
                            {graded && <span style={{ color:'#10B981', marginLeft:6, fontWeight:700 }}>· Score: {item.submission.score}</span>}
                          </p>
                        </div>
                        <span style={{ padding:'3px 10px', borderRadius:999, fontSize:'0.65rem', fontWeight:700, flexShrink:0,
                          background: submitted ? '#10B98120' : overdue ? '#EF444420' : '#F59E0B20',
                          color:       submitted ? '#10B981'   : overdue ? '#EF4444'   : '#F59E0B' }}>
                          {submitted ? (graded ? 'Graded' : 'Submitted') : overdue ? 'Overdue' : 'Pending'}
                        </span>
                      </div>
                      {!submitted && (
                        <div style={{ paddingLeft:56 }}>
                          <button onClick={() => submitAssignment(item.id)}
                            style={{ padding:'6px 16px', background:schoolColor, color:'#fff', border:'none', borderRadius:999, fontWeight:700, fontSize:'0.75rem', cursor:'pointer' }}>
                            Mark as Submitted
                          </button>
                        </div>
                      )}
                      {item.submission?.feedback && (
                        <div style={{ paddingLeft:56 }}>
                          <p style={{ fontSize:'0.78rem', color:'var(--text-muted)', fontStyle:'italic' }}>💬 {item.submission.feedback}</p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
          }
          <div className={styles.spacer}/>
        </main>
      </div>
    </div>
  )
}
