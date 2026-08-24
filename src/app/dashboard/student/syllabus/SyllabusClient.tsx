'use client'
// src/app/dashboard/student/syllabus/SyllabusClient.tsx
//
// FIX (carried over):
//   1. `term` is a Postgres ENUM ('first'|'second'|'third') - this file was
//      sending 'First Term' directly, which would be silently rejected.
//      Friendly labels stay in the UI; only the enum value is sent/queried.
//   2. Replaced the nested join `class_subjects(subjects(name))` with a
//      local lookup - consistent with the teacher-side fix, doesn't depend
//      on PostgREST FK cache timing.
//   3. Syllabus PDF section - this page only ever read `syllabus_topics`
//      (the topic tracker), never the `syllabus` table (the PDF teachers
//      upload), so a teacher-uploaded PDF was completely invisible to
//      students. Both are now shown.
//   4. Visible error banner instead of silent failure.
//
// REDESIGN PASS (Lane 3 - Student): RolePageWrapper chrome, emoji → Icons,
// glass-card/motion treatment, hardcoded status hex → design tokens.

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { BookOpenIcon, AlertIcon, XIcon, FileTextIcon, CheckIcon, DownloadIcon } from '@/components/Icons'
import motion from '@/components/dashboard-motion.module.css'
import styles from './page.module.css'
import { SkeletonList } from '@/components/motion/Skeleton'

interface Props { profile: any; school: any; userId: string }

// FIX: UI label ↔ DB enum value mapping
const TERM_OPTIONS: { label: string; value: string }[] = [
  { label: 'First Term',  value: 'first' },
  { label: 'Second Term', value: 'second' },
  { label: 'Third Term',  value: 'third' },
]

export default function SyllabusClient({ profile, school, userId }: Props) {
  const [topics,      setTopics]      = useState<any[]>([])
  const [pdfUrl,       setPdfUrl]      = useState<string | null>(null)
  const [subjectMap,  setSubjectMap]  = useState<Record<string, string>>({})
  const [subjects,    setSubjects]    = useState<string[]>([])
  const [selected,    setSelected]    = useState<string>('all')
  const [term,        setTerm]        = useState('first') // FIX: enum value, not label
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)
  const supabase    = createClient()
  const schoolColor = school?.primary_color ?? '#800020'

  useEffect(() => { load() }, [term])

  async function load() {
    setLoading(true)
    setError(null)

    const { data: classSubjects, error: csErr } = await supabase
      .from('class_subjects')
      .select('id, subject_id, subjects(name)')
      .eq('class_id', profile?.class_id)

    if (csErr) { console.error('[student syllabus] class_subjects error:', csErr.message); setError("We couldn't load your subjects. Try again.") }

    const csIds = (classSubjects ?? []).map((cs: any) => cs.id)
    // FIX: build local lookup instead of relying on nested join in the topics query
    const map: Record<string, string> = {}
    ;(classSubjects ?? []).forEach((cs: any) => { map[cs.id] = cs.subjects?.name ?? 'Subject' })
    setSubjectMap(map)

    if (csIds.length === 0) { setTopics([]); setPdfUrl(null); setLoading(false); return }

    // FIX: no nested join - select class_subject_id directly, resolve via subjectMap
    const [{ data: topicData, error: topicErr }, { data: syllabusData, error: sylErr }] = await Promise.all([
      supabase
        .from('syllabus_topics')
        .select('id, title, description, week_number, is_covered, covered_at, class_subject_id, profiles!created_by(full_name)')
        .in('class_subject_id', csIds)
        .eq('term', term) // FIX: now sends the enum value ('first'/'second'/'third')
        .order('week_number', { ascending: true }),
      // FIX: also fetch the syllabus PDF - previously never queried at all
      supabase
        .from('syllabus')
        .select('file_url')
        .eq('class_id', profile?.class_id)
        .eq('term', term)
        .maybeSingle(),
    ])

    if (topicErr) { console.error('[student syllabus] topics error:', topicErr.message); setError("We couldn't load the syllabus. Try again.") }
    if (sylErr)   { console.error('[student syllabus] pdf error:', sylErr.message) } // not fatal - PDF may just not exist yet

    if (topicData) {
      const withSubject = topicData.map((t: any) => ({
        ...t,
        subject_name: map[t.class_subject_id] ?? 'Subject',
        teacher_name: t.profiles?.full_name ?? 'Teacher',
      }))
      setTopics(withSubject)
      const unique = [...new Set(withSubject.map((t: any) => t.subject_name))] as string[]
      setSubjects(unique)
    }

    setPdfUrl(syllabusData?.file_url ?? null)
    setLoading(false)
  }

  const filtered = selected === 'all' ? topics : topics.filter(t => t.subject_name === selected)
  const covered  = filtered.filter(t => t.is_covered).length
  const pct      = filtered.length > 0 ? Math.round((covered / filtered.length) * 100) : 0
  const termLabel = TERM_OPTIONS.find(t => t.value === term)?.label ?? term

  // Categorical per-subject tag palette - unrelated to brand color, intentionally varied
  const SUBJECT_COLORS = ['#7C3AED', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#06B6D4', '#8B5CF6', '#F97316', '#14B8A6']

  return (
    <RolePageWrapper userId={userId} role="student" profile={profile} school={school} title="Syllabus">
        <>

          <div className={`${styles.tabs} ${motion.riseIn}`} style={{ marginBottom: 'var(--space-3)' }}>
            {/* FIX: tabs map over TERM_OPTIONS - value sent to DB, label shown to student */}
            {TERM_OPTIONS.map(t => (
              <button key={t.value} onClick={() => setTerm(t.value)}
                className={`${styles.tab} ${term === t.value ? styles.tabActive : ''} ${motion.pressable}`}
                style={term === t.value ? { background: schoolColor, color: '#fff', borderColor: schoolColor } : {}}>
                {t.label}
              </button>
            ))}
          </div>

          {error && (
            <div className={`glass-card ${motion.riseIn}`} style={{ display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 14px', background: 'var(--danger-subtle)', borderColor: 'rgba(239,68,68,0.3)', marginBottom: 'var(--space-4)' }}>
              <AlertIcon size={16} color="var(--danger)" />
              <span style={{ fontSize: '0.8rem', color: 'var(--danger)', flex: 1 }}>{error}</span>
              <button onClick={() => setError(null)} className={motion.pressable}
                style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', display: 'flex', padding: 4 }}>
                <XIcon size={14} />
              </button>
            </div>
          )}

          {loading ? <SkeletonList count={3} variant="row" /> : <>

            {/* Syllabus PDF section */}
            {pdfUrl && (
              <a href={pdfUrl} target="_blank" rel="noreferrer" className={`glass-card ${motion.riseIn} ${motion.pressable}`}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px',
                  background: 'var(--brand-subtle)', borderColor: 'var(--brand-border)', marginBottom: 'var(--space-4)', textDecoration: 'none' }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--brand-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <FileTextIcon size={18} color={schoolColor} />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: '0.85rem', color: schoolColor }}>{termLabel} Syllabus PDF</p>
                  <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)' }}>Tap to view or download</p>
                </div>
                <DownloadIcon size={16} color={schoolColor} />
              </a>
            )}

            {topics.length === 0
              ? <div className={`${styles.empty} ${motion.riseIn}`}><BookOpenIcon size={40} color="var(--text-faint)" strokeWidth={1} /><p>No syllabus topics for {termLabel}</p></div>
              : <>
                <div className={motion.riseIn} style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
                  {['all', ...subjects].map((s, i) => (
                    <button key={s} onClick={() => setSelected(s)} className={motion.pressable}
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

                <div className={`glass-card ${styles.progressCard} ${motion.riseIn}`} style={{ marginBottom: 'var(--space-5)', flexDirection: 'column', alignItems: 'stretch' }}>
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
                  {filtered.map((t, i) => (
                    <div key={t.id} className={`glass-card ${styles.topicCard} ${t.is_covered ? styles.topicDone : ''} ${motion.staggerItem}`}
                      style={{ animationDelay: `${i * 30}ms` }}>
                      <div className={styles.topicCheck}
                        style={{ borderColor: t.is_covered ? 'var(--success)' : 'var(--glass-border)', background: t.is_covered ? 'var(--success)' : 'transparent',
                          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%', border: '2px solid', flexShrink: 0 }}>
                        {t.is_covered && <CheckIcon size={12} />}
                      </div>
                      <div style={{ flex: 1 }}>
                        <p className={styles.topicTitle} style={{ textDecoration: t.is_covered ? 'line-through' : 'none', opacity: t.is_covered ? 0.6 : 1 }}>{t.title}</p>
                        {t.description && <p className={styles.topicNotes}>{t.description}</p>}
                        <p className={styles.topicWeek}>Wk {t.week_number} · {t.subject_name} · {t.teacher_name}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            }
          </>}
          <div className={styles.spacer} />
        </>
    </RolePageWrapper>
  )
}
