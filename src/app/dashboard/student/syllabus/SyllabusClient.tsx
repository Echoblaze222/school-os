'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import DashboardHeader from '@/components/DashboardHeader'
import StudentNav from '@/components/StudentNav'
import { BookOpenIcon, CheckCircleIcon } from '@/components/Icons'
import styles from './page.module.css'

interface Props { profile: any; school: any; userId: string }

export default function SyllabusClient({ profile, school, userId }: Props) {
  const [topics,   setTopics]   = useState<any[]>([])
  const [subjects, setSubjects] = useState<string[]>([])
  const [selected, setSelected] = useState<string>('all')
  const [term,     setTerm]     = useState('1st Term')
  const [loading,  setLoading]  = useState(true)
  const supabase    = createClient()
  const schoolColor = school?.primary_color ?? '#7C3AED'

  useEffect(() => { load() }, [term])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('syllabus')
      .select('id, title, subject, description, week_number, is_covered, covered_at, teacher:profiles(full_name)')
      .eq('school_id', school?.id)
      .eq('term', term)
      .order('subject')
      .order('week_number')
    if (data) {
      setTopics(data)
      const unique = [...new Set(data.map((t: any) => t.subject))] as string[]
      setSubjects(unique)
    }
    setLoading(false)
  }

  const filtered = selected === 'all' ? topics : topics.filter(t => t.subject === selected)
  const covered  = filtered.filter(t => t.is_covered).length
  const pct      = filtered.length > 0 ? Math.round((covered / filtered.length) * 100) : 0

  const SUBJECT_COLORS = ['#7C3AED','#3B82F6','#10B981','#F59E0B','#EF4444','#EC4899','#06B6D4','#8B5CF6','#F97316','#14B8A6']

  return (
    <div className={styles.page}>
      <StudentNav userId={userId} profile={profile} school={school} schoolColor={schoolColor} />
      <div className={styles.content}>
        <DashboardHeader userId={userId} role="student" profile={profile} school={school}
          schoolColor={schoolColor} title="Syllabus" showBack />
        <main className={styles.main}>

          {/* Term tabs */}
          <div className={styles.tabs} style={{ marginBottom:'var(--space-3)' }}>
            {['1st Term','2nd Term','3rd Term'].map(t => (
              <button key={t} onClick={() => setTerm(t)}
                className={`${styles.tab} ${term===t ? styles.tabActive : ''}`}
                style={term===t ? { background:schoolColor, color:'#fff', borderColor:schoolColor } : {}}>
                {t}
              </button>
            ))}
          </div>

          {loading ? <div className={styles.loading}><span/><span/><span/></div> : <>

            {topics.length === 0
              ? <div className={styles.empty}><BookOpenIcon size={40} color="var(--text-faint)" strokeWidth={1}/><p>No syllabus uploaded for {term}</p></div>
              : <>
                {/* Subject filter pills */}
                <div style={{ display:'flex', gap:'var(--space-2)', flexWrap:'wrap', marginBottom:'var(--space-4)' }}>
                  {['all', ...subjects].map((s, i) => (
                    <button key={s} onClick={() => setSelected(s)}
                      style={{ padding:'5px 12px', borderRadius:999, fontSize:'0.72rem', fontWeight:700,
                        background: selected===s ? (s==='all' ? schoolColor : SUBJECT_COLORS[(i-1) % SUBJECT_COLORS.length]) : 'var(--glass-bg)',
                        color: selected===s ? '#fff' : 'var(--text-muted)',
                        border:`1px solid ${selected===s ? 'transparent' : 'var(--glass-border)'}`,
                        cursor:'pointer' }}>
                      {s === 'all' ? 'All Subjects' : s}
                    </button>
                  ))}
                </div>

                {/* Progress */}
                <div className={styles.progressCard} style={{ marginBottom:'var(--space-5)' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                    <span style={{ fontSize:'0.78rem', fontWeight:700, color:'var(--text-primary)' }}>Coverage</span>
                    <span style={{ fontSize:'0.78rem', fontWeight:800, color:schoolColor }}>{pct}%</span>
                  </div>
                  <div className={styles.progressTrack}>
                    <div className={styles.progressFill} style={{ width:`${pct}%`, background:schoolColor }}/>
                  </div>
                  <p style={{ fontSize:'0.72rem', color:'var(--text-muted)', marginTop:6 }}>{covered} of {filtered.length} topics taught</p>
                </div>

                {/* Topic list */}
                <div className={styles.topicList}>
                  {filtered.map(t => (
                    <div key={t.id} className={`${styles.topicCard} ${t.is_covered ? styles.topicDone : ''}`}>
                      <div className={styles.topicCheck}
                        style={{ borderColor: t.is_covered ? '#10B981' : 'var(--glass-border)', background: t.is_covered ? '#10B981' : 'transparent', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', width:22, height:22, borderRadius:'50%', border:'2px solid', flexShrink:0 }}>
                        {t.is_covered && <span style={{ fontSize:12, fontWeight:800 }}>✓</span>}
                      </div>
                      <div style={{ flex:1 }}>
                        <p className={styles.topicTitle} style={{ textDecoration: t.is_covered ? 'line-through' : 'none', opacity: t.is_covered ? 0.6 : 1 }}>{t.title}</p>
                        {t.description && <p className={styles.topicNotes}>{t.description}</p>}
                        <p className={styles.topicWeek}>Wk {t.week_number} · {t.subject} · {(t.teacher as any)?.full_name ?? 'Teacher'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            }
          </>}
          <div className={styles.spacer}/>
        </main>
      </div>
    </div>
  )
}
