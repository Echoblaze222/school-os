'use client'
// src/app/dashboard/parent/timetable/TimetableClient.tsx
//
// FIX: this page was reading a flat day/subject/teacher_name shape from
// `timetable` that doesn't match the real schema. The actual columns are
// day_of_week (INTEGER, 1=Monday...5=Friday — not text), class_id,
// class_subject_id, and teacher_id, matching the already-fixed student-side
// TimetableClient. Subject names are resolved via a local lookup against
// class_subjects instead of a fragile nested join.
//
// Also: a parent can have more than one linked child (profiles.parent_id is
// not unique per parent), so child resolution never uses .single() — same
// fix already applied to FeesClient.tsx.

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { ClockIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'

interface Props { profile: any; school: any; userId: string }

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
// Matches the teacher/student-side mapping: day_of_week is stored as an
// integer, 1=Monday...5=Friday — never compare it against a string label.
const DAY_TO_NUM: Record<string, number> = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5 }
const PERIOD_COLORS = ['#7C3AED', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#06B6D4', '#8B5CF6']

export default function TimetableClient({ profile, school, userId }: Props) {
  const [children,  setChildren]  = useState<any[]>([])
  const [childId,   setChildId]   = useState<string | null>(null)
  const [timetable, setTimetable] = useState<any[]>([])
  const [subjectMap,setSubjectMap]= useState<Record<string, string>>({})
  const [loading,   setLoading]   = useState(true)
  const [day,       setDay]       = useState<string>(() => {
    const d = new Date().getDay()
    return d === 0 || d === 6 ? 'Monday' : DAYS[d - 1]
  })
  const supabase = createClient()
  const sc = school?.primary_color ?? '#7C3AED'
  const child = children.find(c => c.id === childId) ?? null

  useEffect(() => { loadChildren() }, [])
  useEffect(() => { if (childId) loadTimetable(childId) }, [childId])

  async function loadChildren() {
    setLoading(true)
    // A parent can have more than one linked child — never assume .single()
    const { data: childData } = await supabase
      .from('profiles')
      .select('id, full_name, class_level, class_id')
      .eq('parent_id', userId)
      .order('full_name')

    if (!childData || childData.length === 0) {
      setChildren([])
      setLoading(false)
      return
    }

    setChildren(childData)
    setChildId(childData[0].id)
    // loadTimetable fires via the childId effect once childId is set
  }

  async function loadTimetable(id: string) {
    setLoading(true)
    const childData = children.find(c => c.id === id)
    if (!childData?.class_id) { setTimetable([]); setLoading(false); return }

    // No nested join — select class_subject_id directly, resolve the
    // subject name via a separate lookup instead of relying on PostgREST's
    // FK cache, exactly like the teacher/student-side fix.
    const { data, error: err } = await supabase
      .from('timetable')
      .select('id, day_of_week, start_time, end_time, room, class_id, class_subject_id, teacher:profiles!teacher_id(full_name)')
      .eq('school_id', school?.id)
      .eq('class_id', childData.class_id)
      .order('start_time', { ascending: true })

    if (err) console.error('[parent timetable] load error:', err.message)

    if (data) {
      setTimetable(data)
      const csIds = [...new Set(data.map((t: any) => t.class_subject_id).filter(Boolean))]
      if (csIds.length > 0) {
        const { data: csData } = await supabase
          .from('class_subjects')
          .select('id, subject_id, subjects(name)')
          .in('id', csIds)
        if (csData) {
          const map: Record<string, string> = {}
          csData.forEach((cs: any) => { map[cs.id] = cs.subjects?.name ?? 'Class' })
          setSubjectMap(map)
        }
      }
    } else {
      setTimetable([])
    }
    setLoading(false)
  }

  // Compare against the integer, never the string label
  const daySlots = timetable.filter(t => t.day_of_week === DAY_TO_NUM[day])

  return (
    <RolePageWrapper userId={userId} role="parent" profile={profile} school={school} title="Timetable">
      {loading && children.length === 0
        ? <div className={styles.loading}><span/><span/><span/></div>
        : children.length === 0
          ? <div className={styles.empty}>
              <ClockIcon size={40} color="var(--text-faint)" strokeWidth={1}/>
              <p>No child linked to your account.</p>
            </div>
          : <>
              {/* Child switcher — only shown when parent has more than one linked child */}
              {children.length > 1 && (
                <div style={{ display:'flex', gap:8, marginBottom:'var(--space-4)', overflowX:'auto' }}>
                  {children.map(c => (
                    <button key={c.id} onClick={() => setChildId(c.id)}
                      style={{
                        flexShrink:0, padding:'8px 16px', borderRadius:20, fontWeight:700,
                        fontSize:'0.82rem', cursor:'pointer', border:'1px solid var(--glass-border)',
                        background: c.id === childId ? sc : 'var(--input-bg)',
                        color: c.id === childId ? '#fff' : 'var(--text-muted)',
                      }}>
                      {c.full_name?.split(' ')[0] ?? 'Child'}
                    </button>
                  ))}
                </div>
              )}

              <p style={{ fontSize:'0.75rem', color:'var(--text-muted)', marginBottom:'var(--space-4)' }}>
                Timetable for <strong style={{ color:'var(--text-primary)' }}>{child?.full_name}</strong> · {child?.class_level}
              </p>

              {/* Day tabs */}
              <div style={{ display:'flex', gap:6, overflowX:'auto', marginBottom:'var(--space-5)', paddingBottom:4 }}>
                {DAYS.map(d => (
                  <button
                    key={d}
                    onClick={() => setDay(d)}
                    style={{
                      flexShrink: 0,
                      padding: '6px 14px',
                      borderRadius: 20,
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      background: day === d ? sc : 'var(--glass-bg)',
                      color:      day === d ? '#fff' : 'var(--text-secondary)',
                      transition: 'all 0.18s',
                    }}
                  >
                    {d.slice(0, 3)}
                  </button>
                ))}
              </div>

              {loading
                ? <div className={styles.loading}><span/><span/><span/></div>
                : timetable.length === 0
                  ? <div className={styles.empty}>
                      <ClockIcon size={40} color="var(--text-faint)" strokeWidth={1}/>
                      <p>No timetable set for {child?.class_level} yet.</p>
                    </div>
                  : daySlots.length === 0
                    ? <div className={styles.empty}>
                        <ClockIcon size={40} color="var(--text-faint)" strokeWidth={1}/>
                        <p>No classes on {day}.</p>
                      </div>
                    : <div className={styles.list}>
                        {daySlots.map((slot, i) => (
                          <div key={slot.id ?? i} className={styles.card}>
                            {/* Time badge */}
                            <div style={{
                              flexShrink: 0,
                              minWidth: 56,
                              textAlign: 'center',
                              background: sc + '15',
                              borderRadius: 10,
                              padding: '6px 4px',
                            }}>
                              <p style={{ fontSize:'0.65rem', fontWeight:700, color: sc, lineHeight:1.3 }}>
                                {slot.start_time ? slot.start_time.slice(0,5) : '--'}
                              </p>
                              <p style={{ fontSize:'0.6rem', color:'var(--text-muted)' }}>
                                {slot.end_time ? slot.end_time.slice(0,5) : ''}
                              </p>
                            </div>

                            <div className={styles.cardBody}>
                              <p className={styles.cardTitle}>
                                {subjectMap[slot.class_subject_id] ?? 'Class'}
                              </p>
                              <p className={styles.cardMeta}>
                                {slot.teacher?.full_name ?? 'Teacher'}
                                {slot.room ? ` · Room ${slot.room}` : ''}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
              }
            </>
      }
      <div className={styles.spacer}/>
    </RolePageWrapper>
  )
}