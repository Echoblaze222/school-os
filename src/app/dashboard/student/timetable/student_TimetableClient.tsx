'use client'
// src/app/dashboard/student/timetable/TimetableClient.tsx
// FIX (this round): `day_of_week` is an INTEGER (1=Monday...5=Friday), not
// text. The previous version compared `t.day_of_week === 'Monday'`, which
// never matched the stored integer — so the page always showed "No classes"
// even when teachers had created periods. This is why nothing appeared.
//
// Also: queries class_id directly instead of relying on a nested join
// (class_subjects(subjects(name))), resolving names via a local lookup —
// consistent with the teacher-side fix, works regardless of PostgREST FK
// cache timing.

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import DashboardHeader from '@/components/DashboardHeader'
import StudentNav from '@/components/StudentNav'
import { ClockIcon } from '@/components/Icons'
import styles from './page.module.css'

interface Props { profile: any; school: any; userId: string }

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
// FIX: integer mapping matching the teacher-side fix (1=Monday...5=Friday)
const DAY_TO_NUM: Record<string, number> = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5 }

export default function TimetableClient({ profile, school, userId }: Props) {
  const [timetable, setTimetable] = useState<any[]>([])
  const [subjectMap, setSubjectMap] = useState<Record<string, string>>({})
  const [loading,   setLoading]   = useState(true)
  const [day,       setDay]       = useState(() => {
    const d = new Date().getDay()
    return d === 0 || d === 6 ? 'Monday' : DAYS[d - 1]
  })
  const supabase    = createClient()
  const schoolColor = school?.primary_color ?? '#7C3AED'

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)

    // FIX: no nested join — select class_subject_id directly, resolve subject
    // name via a separate lookup query instead of relying on a PostgREST join
    const { data, error: err } = await supabase
      .from('timetable')
      .select('id, day_of_week, start_time, end_time, room, class_id, class_subject_id, teacher:profiles!teacher_id(full_name)')
      .eq('school_id', school?.id)
      .eq('class_id', profile?.class_id)
      .order('start_time', { ascending: true })

    if (err) console.error('[student timetable] load error:', err.message)

    if (data) {
      setTimetable(data)
      // Resolve subject names for any class_subject_id present
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
    }
    setLoading(false)
  }

  // FIX: compare against the integer, not the string label
  const todaySlots = timetable.filter(t => t.day_of_week === DAY_TO_NUM[day])

  const PERIOD_COLORS = ['#7C3AED', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#06B6D4', '#8B5CF6']

  return (
    <div className={styles.page}>
      <StudentNav userId={userId} profile={profile} school={school} schoolColor={schoolColor} />
      <div className={styles.content}>
        <DashboardHeader userId={userId} role="student" profile={profile} school={school}
          schoolColor={schoolColor} title="Timetable" showBack />
        <main className={styles.main}>
          <div className={styles.dayTabs}>
            {DAYS.map(d => (
              <button key={d} onClick={() => setDay(d)}
                className={`${styles.dayTab} ${day === d ? styles.dayTabActive : ''}`}
                style={day === d ? { background: schoolColor, color: '#fff', borderColor: schoolColor } : {}}>
                {d.slice(0, 3)}
              </button>
            ))}
          </div>
          <p className={styles.sectionLabel}>{day}'s Schedule</p>
          {loading ? <div className={styles.loading}><span /><span /><span /></div>
            : todaySlots.length === 0
              ? <div className={styles.empty}><ClockIcon size={40} color="var(--text-faint)" strokeWidth={1} /><p>No classes on {day}</p></div>
              : <div className={styles.periodList}>
                {todaySlots.map((slot, i) => (
                  <div key={slot.id} className={styles.periodCard}>
                    <div className={styles.periodTime}>
                      <p className={styles.timeStart}>{slot.start_time?.slice(0, 5)}</p>
                      <div className={styles.timeLine} style={{ background: PERIOD_COLORS[i % PERIOD_COLORS.length] + '40' }} />
                      <p className={styles.timeEnd}>{slot.end_time?.slice(0, 5)}</p>
                    </div>
                    <div className={styles.periodBody} style={{ borderLeftColor: PERIOD_COLORS[i % PERIOD_COLORS.length] }}>
                      {/* FIX: subject resolved via local lookup, not a fragile nested join */}
                      <p className={styles.periodSubject}>{subjectMap[slot.class_subject_id] ?? 'Class'}</p>
                      <p className={styles.periodMeta}>
                        {slot.teacher?.full_name ?? 'Teacher'}
                        {slot.room ? ` · Room ${slot.room}` : ''}
                      </p>
                      <div className={styles.periodDuration}>
                        <ClockIcon size={11} color="var(--text-muted)" />
                        {slot.start_time?.slice(0, 5)} – {slot.end_time?.slice(0, 5)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
          }
          <div className={styles.spacer} />
        </main>
      </div>
    </div>
  )
}
