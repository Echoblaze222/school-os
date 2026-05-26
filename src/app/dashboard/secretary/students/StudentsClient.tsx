'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { PeopleIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'

interface Props { profile: any; school: any; userId: string }

export default function StudentsClient({ profile, school, userId }: Props) {
  const [classes,  setClasses]  = useState<any[]>([])
  const [students, setStudents] = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [classId,  setClassId]  = useState<string | null>(null)
  const supabase = createClient()
  const sc       = school?.primary_color ?? '#7C3AED'

  useEffect(() => { loadClasses() }, [])
  useEffect(() => { loadStudents() }, [classId])

  async function loadClasses() {
    const { data } = await supabase.from('classes')
      .select('id, name, class_level').eq('school_id', school?.id).order('name')
    if (data) setClasses(data)
  }

  async function loadStudents() {
    setLoading(true)
    let q = supabase.from('profiles')
      .select('id, full_name, default_code, class_level, avatar_url')
      .eq('school_id', school?.id).eq('role', 'student').order('full_name')
    if (classId) q = q.eq('class_id', classId)
    const { data } = await q
    if (data) setStudents(data)
    setLoading(false)
  }

  const filtered = students.filter(s =>
    !search ||
    s.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    s.default_code?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <RolePageWrapper userId={userId} role="secretary" profile={profile} school={school} title="Students">
      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search by name or student ID…"
        style={{ width:'100%', height:42, padding:'0 14px', background:'var(--input-bg)',
          border:'1px solid var(--input-border)', borderRadius:10, color:'var(--text-primary)',
          fontSize:'0.85rem', outline:'none', marginBottom:'var(--space-4)' }}/>

      <div className={styles.subjectScroll} style={{ marginBottom:'var(--space-4)' }}>
        <button onClick={() => setClassId(null)}
          className={`${styles.subjectPill} ${!classId ? styles.subjectPillActive : ''}`}
          style={!classId ? { background:sc, borderColor:sc, color:'#fff' } : { borderColor:sc+'50', color:sc }}>
          All Classes
        </button>
        {classes.map(c => (
          <button key={c.id} onClick={() => setClassId(c.id)}
            className={`${styles.subjectPill} ${classId===c.id ? styles.subjectPillActive : ''}`}
            style={classId===c.id ? { background:sc, borderColor:sc, color:'#fff' } : { borderColor:sc+'50', color:sc }}>
            {c.name}
          </button>
        ))}
      </div>

      <p style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--text-muted)',
        marginBottom:'var(--space-3)', letterSpacing:'0.05em' }}>
        {filtered.length} STUDENT{filtered.length !== 1 ? 'S' : ''}
      </p>

      {loading
        ? <div className={styles.loading}><span/><span/><span/></div>
        : filtered.length === 0
          ? <div className={styles.empty}><PeopleIcon size={40} color="var(--text-faint)" strokeWidth={1}/><p>No students found</p></div>
          : <div className={styles.list}>
              {filtered.map((s: any) => (
                <div key={s.id} className={styles.card}>
                  <div className={styles.cardIcon}
                    style={{ background:sc+'20', borderRadius:'50%', overflow:'hidden' }}>
                    {s.avatar_url
                      ? <img src={s.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                      : <span style={{ fontWeight:800, fontSize:'0.9rem', color:sc }}>{s.full_name?.[0]}</span>}
                  </div>
                  <div className={styles.cardBody}>
                    <p className={styles.cardTitle}>{s.full_name}</p>
                    <p className={styles.cardMeta}>{s.default_code}{s.class_level ? ` · ${s.class_level}` : ''}</p>
                  </div>
                </div>
              ))}
            </div>
      }
      <div className={styles.spacer}/>
    </RolePageWrapper>
  )
}
