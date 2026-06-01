'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import DashboardHeader from '@/components/DashboardHeader'
import StudentNav from '@/components/StudentNav'
import { ClockIcon } from '@/components/Icons'
import styles from './page.module.css'

interface Props { profile: any; school: any; userId: string }

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday']

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
    // timetable uses day_of_week (not day) and class_id FK
    // We filter by school only, then filter by class_level text match on the joined class_groups
    const { data } = await supabase
      .from('timetable')
      .select('id, day_of_week, subject, start_time, end_time, room, teacher:profiles(full_name), class:class_groups(name, level)')
      .eq('school_id', school?.id)
      .order('start_time', { ascending: true })
    // Filter client-side by matching class level
    if (data) {
      const myLevel = profile?.class_level ?? ''
      const filtered = data.filter((t: any) =>
        !myLevel || !t.class?.level || t.class.level === myLevel
      )
      setTimetable(filtered)
    }
    setLoading(false)
  }

  const todaySlots = timetable.filter(t => t.day_of_week === day)

  const PERIOD_COLORS = ['#7C3AED','#3B82F6','#10B981','#F59E0B','#EF4444','#EC4899','#06B6D4','#8B5CF6']

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
                className={`${styles.dayTab} ${day===d ? styles.dayTabActive : ''}`}
                style={day===d ? { background:schoolColor, color:'#fff', borderColor:schoolColor } : {}}>
                {d.slice(0,3)}
              </button>
            ))}
          </div>
          <p className={styles.sectionLabel}>{day}'s Schedule</p>
          {loading ? <div className={styles.loading}><span/><span/><span/></div>
          : todaySlots.length === 0
            ? <div className={styles.empty}><ClockIcon size={40} color="var(--text-faint)" strokeWidth={1}/><p>No classes on {day}</p></div>
            : <div className={styles.periodList}>
              {todaySlots.map((slot, i) => (
                <div key={slot.id} className={styles.periodCard}>
                  <div className={styles.periodTime}>
                    <p className={styles.timeStart}>{slot.start_time?.slice(0,5)}</p>
                    <div className={styles.timeLine} style={{ background: PERIOD_COLORS[i % PERIOD_COLORS.length] + '40' }}/>
                    <p className={styles.timeEnd}>{slot.end_time?.slice(0,5)}</p>
                  </div>
                  <div className={styles.periodBody} style={{ borderLeftColor: PERIOD_COLORS[i % PERIOD_COLORS.length] }}>
                    <p className={styles.periodSubject}>{slot.subject}</p>
                    <p className={styles.periodMeta}>
                      {(slot.teacher as any)?.full_name ?? 'Teacher'}
                      {slot.room ? ` · Room ${slot.room}` : ''}
                    </p>
                    <div className={styles.periodDuration}>
                      <ClockIcon size={11} color="var(--text-muted)"/>
                      {slot.start_time?.slice(0,5)} – {slot.end_time?.slice(0,5)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          }
          <div className={styles.spacer}/>
        </main>
      </div>
    </div>
  )
}
