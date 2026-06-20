'use client'
// src/app/dashboard/student/timetable/TimetableClient.tsx
// FIXES:
//   1. `timetable` has no `subject` text column — subject comes via
//      class_subject_id → class_subjects → subjects(name)
//   2. `day_of_week` is TEXT ('Monday'..'Friday'), not a number — the old
//      client compared it against a number from dayMap, so it never matched
//      and the page always showed "No classes" regardless of real data
//   3. teacher:profiles(full_name) needs explicit FK hint: profiles!teacher_id
//   4. class.level doesn't exist — classes table column is just used for filtering
//      by class_id directly instead of a level string match

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import DashboardHeader from '@/components/DashboardHeader'
import StudentNav from '@/components/StudentNav'
import { ClockIcon } from '@/components/Icons'
import styles from './page.module.css'

interface Props { profile: any; school: any; userId: string }

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

export default function TimetableClient({ profile, school, userId }: Props) {
  const [timetable, setTimetable] = useState<any[]>([])
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
    // FIX: subject comes from class_subjects → subjects, not a direct column.
    // FIX: filter directly by the student's class_id (no text "level" field needed).
    const { data } = await supabase
      .from('timetable')
      .select(`
        id, day_of_week, start_time, end_time, room,
        teacher:profiles!teacher_id ( full_name ),
        class_subjects ( subjects ( name ) )
      `)
      .eq('school_id', school?.id)
      .eq('class_id', profile?.class_id)
      .order('start_time', { ascending: true })

    if (data) setTimetable(data)
    setLoading(false)
  }

  // FIX: day_of_week is stored as text ('Monday'), compare directly — no number mapping
  const todaySlots = timetable.filter(t => t.day_of_week === day)

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
                      {/* FIX: subject now read from the joined class_subjects.subjects.name */}
                      <p className={styles.periodSubject}>{slot.class_subjects?.subjects?.name ?? 'Class'}</p>
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
