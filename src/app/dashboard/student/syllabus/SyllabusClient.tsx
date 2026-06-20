'use client'
// src/app/dashboard/student/syllabus/SyllabusClient.tsx
// FIXES:
//   1. `syllabus_topics` has no `subject` text column — subject comes via
//      class_subject_id → class_subjects → subjects(name)
//   2. `.order('subject')` removed — that column doesn't exist, this would error
//   3. `(t.teacher as any)?.full_name` → query aliases as `profiles!created_by`,
//      so the returned field is `t.profiles`, not `t.teacher`
//   4. Filters by the student's own class_subject_id list (via class_id) instead
//      of just school_id, so students only see topics for classes they're in

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import DashboardHeader from '@/components/DashboardHeader'
import StudentNav from '@/components/StudentNav'
import { BookOpenIcon } from '@/components/Icons'
import styles from './page.module.css'

interface Props { profile: any; school: any; userId: string }

export default function SyllabusClient({ profile, school, userId }: Props) {
  const [topics,   setTopics]   = useState<any[]>([])
  const [subjects, setSubjects] = useState<string[]>([])
  const [selected, setSelected] = useState<string>('all')
  const [term,     setTerm]     = useState('First Term')
  const [loading,  setLoading]  = useState(true)
  const supabase    = createClient()
  const schoolColor = school?.primary_color ?? '#7C3AED'

  useEffect(() => { load() }, [term])

  async function load() {
    setLoading(true)

    // FIX: resolve this student's class_subject_ids first (via their class_id),
    // so we only show topics relevant to classes/subjects they're actually in
    const { data: classSubjects } = await supabase
      .from('class_subjects')
      .select('id')
      .eq('class_id', profile?.class_id)

    const csIds = (classSubjects ?? []).map((cs: any) => cs.id)
    if (csIds.length === 0) { setTopics([]); setLoading(false); return }

    // FIX: subject name now comes from the join, not a direct column.
    // FIX: removed .order('subject') — no such column; sort client-side instead.
    const { data } = await supabase
      .from('syllabus_topics')
      .select(`
        id, title, description, week_number, is_covered, covered_at,
        class_subject_id,
        class_subjects ( subjects ( name ) ),
        profiles!created_by ( full_name )
      `)
      .in('class_subject_id', csIds)
      .eq('term', term)
      .order('week_number', { ascending: true })

    if (data) {
      const withSubject = data.map((t: any) => ({
        ...t,
        subject_name: t.class_subjects?.subjects?.name ?? 'Subject',
        teacher_name: t.profiles?.full_name ?? 'Teacher',
      }))
      setTopics(withSubject)
      const unique = [...new Set(withSubject.map((t: any) => t.subject_name))] as string[]
      setSubjects(unique)
    }
    setLoading(false)
  }

  const filtered = selected === 'all' ? topics : topics.filter(t => t.subject_name === selected)
  const covered  = filtered.filter(t => t.is_covered).length
  const pct      = filtered.length > 0 ? Math.round((covered / filtered.length) * 100) : 0

  const SUBJECT_COLORS = ['#7C3AED', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#06B6D4', '#8B5CF6', '#F97316', '#14B8A6']

  return (
    <div className={styles.page}>
      <StudentNav userId={userId} profile={profile} school={school} schoolColor={schoolColor} />
      <div className={styles.content}>
        <DashboardHeader userId={userId} role="student" profile={profile} school={school}
          schoolColor={schoolColor} title="Syllabus" showBack />
        <main className={styles.main}>

          <div className={styles.tabs} style={{ marginBottom: 'var(--space-3)' }}>
            {['First Term', 'Second Term', 'Third Term'].map(t => (
              <button key={t} onClick={() => setTerm(t)}
                className={`${styles.tab} ${term === t ? styles.tabActive : ''}`}
                style={term === t ? { background: schoolColor, color: '#fff', borderColor: schoolColor } : {}}>
                {t}
              </button>
            ))}
          </div>

          {loading ? <div className={styles.loading}><span /><span /><span /></div> : <>

            {topics.length === 0
              ? <div className={styles.empty}><BookOpenIcon size={40} color="var(--text-faint)" strokeWidth={1} /><p>No syllabus uploaded for {term}</p></div>
              : <>
                <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
                  {['all', ...subjects].map((s, i) => (
                    <button key={s} onClick={() => setSelected(s)}
                      style={{
                        padding: '5px 12px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700,
                        background: selected === s ? (s === 'all' ? schoolColor : SUBJECT_COLORS[(i - 1) % SUBJECT_COLORS.length]) : 'var(--glass-bg)',
                        color: selected === s ? '#fff' : 'var(--text-muted)',
                        border: `1px solid ${selected === s ? 'transparent' : 'var(--glass-border)'}`,
                        cursor: 'pointer',
                      }}>
                      {s === 'all' ? 'All Subjects' : s}
                    </button>
                  ))}
                </div>

                <div className={styles.progressCard} style={{ marginBottom: 'var(--space-5)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>Coverage</span>
                    <span style={{ fontSize: '0.78rem', fontWeight: 800, color: schoolColor }}>{pct}%</span>
                  </div>
                  <div className={styles.progressTrack}>
                    <div className={styles.progressFill} style={{ width: `${pct}%`, background: schoolColor }} />
                  </div>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 6 }}>{covered} of {filtered.length} topics taught</p>
                </div>

                <div className={styles.topicList}>
                  {filtered.map(t => (
                    <div key={t.id} className={`${styles.topicCard} ${t.is_covered ? styles.topicDone : ''}`}>
                      <div className={styles.topicCheck}
                        style={{ borderColor: t.is_covered ? '#10B981' : 'var(--glass-border)', background: t.is_covered ? '#10B981' : 'transparent', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%', border: '2px solid', flexShrink: 0 }}>
                        {t.is_covered && <span style={{ fontSize: 12, fontWeight: 800 }}>✓</span>}
                      </div>
                      <div style={{ flex: 1 }}>
                        <p className={styles.topicTitle} style={{ textDecoration: t.is_covered ? 'line-through' : 'none', opacity: t.is_covered ? 0.6 : 1 }}>{t.title}</p>
                        {t.description && <p className={styles.topicNotes}>{t.description}</p>}
                        {/* FIX: subject_name + teacher_name resolved above, not raw t.subject/t.teacher */}
                        <p className={styles.topicWeek}>Wk {t.week_number} · {t.subject_name} · {t.teacher_name}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            }
          </>}
          <div className={styles.spacer} />
        </main>
      </div>
    </div>
  )
}
