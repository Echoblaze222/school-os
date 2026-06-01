'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { PeopleIcon, SearchIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'

interface Props { profile: any; school: any; userId: string }

export default function ClassesClient({ profile, school, userId }: Props) {
  const [classes,  setClasses]  = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [students, setStudents] = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const supabase = createClient()

  useEffect(() => { load() }, [])
  useEffect(() => { if (selected) loadStudents(selected.id) }, [selected])

  async function load() {
    const { data } = await supabase
      .from('classes')
      .select('id, name, class_level, subject, student_count')
      .eq('teacher_id', userId)
      .order('name')
    if (data) { setClasses(data); if (data[0]) setSelected(data[0]) }
    setLoading(false)
  }

  async function loadStudents(classId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, default_code, avatar_url')
      .eq('class_id', classId)
      .eq('role', 'student')
      .order('full_name')
    if (data) setStudents(data)
  }

  return (
    <RolePageWrapper userId={userId} role="teacher" profile={profile} school={school} title="My Classes">
      {loading ? <div className={styles.loading}><span/><span/><span/></div> : <>

      {classes.length === 0
        ? <div className={styles.empty}><PeopleIcon size={40} color="var(--text-faint)" strokeWidth={1}/><p>No classes assigned yet</p></div>
        : <>
            {/* Class pills */}
            <div className={styles.subjectScroll} style={{ marginBottom:'var(--space-5)' }}>
              {classes.map(cls => (
                <button key={cls.id}
                  className={`${styles.subjectPill} ${selected?.id===cls.id ? styles.subjectPillActive : ''}`}
                  style={selected?.id===cls.id
                    ? { background: school?.primary_color??'#7C3AED', borderColor: school?.primary_color??'#7C3AED', color:'#fff' }
                    : { borderColor:(school?.primary_color??'#7C3AED')+'50', color: school?.primary_color??'#7C3AED' }}
                  onClick={() => setSelected(cls)}>
                  {cls.name}
                </button>
              ))}
            </div>

            {selected && (
              <>
                <div className={styles.statsRow} style={{ marginBottom:'var(--space-5)' }}>
                  <div className={styles.statCard}>
                    <p className={styles.statVal} style={{ color: school?.primary_color??'#7C3AED' }}>{students.length}</p>
                    <p className={styles.statLbl}>Students</p>
                  </div>
                  <div className={styles.statCard}>
                    <p className={styles.statVal} style={{ color:'#10B981' }}>{selected.class_level}</p>
                    <p className={styles.statLbl}>Level</p>
                  </div>
                </div>

                <p className={styles.sectionLabel}>Students in {selected.name}</p>
                <div className={styles.list}>
                  {students.map(s => (
                    <div key={s.id} className={styles.card}>
                      <div className={styles.cardIcon} style={{ background: (school?.primary_color??'#7C3AED')+'20', borderRadius:'50%', overflow:'hidden' }}>
                        {s.avatar_url
                          ? <img src={s.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                          : <span style={{ fontWeight:700, color: school?.primary_color??'#7C3AED' }}>{s.full_name?.[0]}</span>
                        }
                      </div>
                      <div className={styles.cardBody}>
                        <p className={styles.cardTitle}>{s.full_name}</p>
                        <p className={styles.cardMeta}>{s.default_code}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
      }
      <div className={styles.spacer}/>
      </>}
    </RolePageWrapper>
  )
}
