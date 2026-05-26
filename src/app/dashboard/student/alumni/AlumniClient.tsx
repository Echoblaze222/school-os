'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import DashboardHeader from '@/components/DashboardHeader'
import StudentNav from '@/components/StudentNav'
import { GlobeIcon, SearchIcon, UserIcon } from '@/components/Icons'
import styles from './page.module.css'

interface Props { profile: any; school: any; userId: string }

export default function AlumniClient({ profile, school, userId }: Props) {
  const [alumni,    setAlumni]    = useState<any[]>([])
  const [filtered,  setFiltered]  = useState<any[]>([])
  const [search,    setSearch]    = useState('')
  const [yearFilter,setYearFilter]= useState<string>('all')
  const [loading,   setLoading]   = useState(true)
  const supabase    = createClient()
  const schoolColor = school?.primary_color ?? '#7C3AED'

  useEffect(() => { load() }, [])

  useEffect(() => {
    let list = alumni
    if (search) list = list.filter(a =>
      a.full_name.toLowerCase().includes(search.toLowerCase()) ||
      a.occupation?.toLowerCase().includes(search.toLowerCase())
    )
    if (yearFilter !== 'all') list = list.filter(a => String(a.graduation_year) === yearFilter)
    setFiltered(list)
  }, [search, yearFilter, alumni])

  async function load() {
    const { data } = await supabase
      .from('alumni')
      .select('id, full_name, graduation_year, occupation, company, location, avatar_url, linkedin_url')
      .eq('school_id', school?.id)
      .order('graduation_year', { ascending: false })
      .limit(50)
    if (data) { setAlumni(data); setFiltered(data) }
    setLoading(false)
  }

  const years = [...new Set(alumni.map(a => String(a.graduation_year)))].sort((a,b) => +b - +a)

  return (
    <div className={styles.page}>
      <StudentNav userId={userId} profile={profile} school={school} schoolColor={schoolColor} />
      <div className={styles.content}>
        <DashboardHeader userId={userId} role="student" profile={profile} school={school}
          schoolColor={schoolColor} title="Alumni Network" showBack />
        <main className={styles.main}>

          {/* Stats */}
          <div className={styles.statsRow} style={{ marginBottom:'var(--space-5)' }}>
            <div className={styles.statCard}>
              <p className={styles.statVal} style={{ color:schoolColor }}>{alumni.length}</p>
              <p className={styles.statLbl}>Alumni</p>
            </div>
            <div className={styles.statCard}>
              <p className={styles.statVal} style={{ color:'#10B981' }}>{years.length}</p>
              <p className={styles.statLbl}>Graduating Years</p>
            </div>
          </div>

          {/* Search */}
          <div className={styles.searchRow}>
            <div className={styles.searchBox}>
              <SearchIcon size={15} color="var(--text-muted)"/>
              <input className={styles.searchInput} placeholder="Search alumni by name or career..."
                value={search} onChange={e => setSearch(e.target.value)}/>
            </div>
            {years.length > 0 && (
              <select className={styles.yearSelect}
                value={yearFilter} onChange={e => setYearFilter(e.target.value)}>
                <option value="all">All Years</option>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            )}
          </div>

          {loading ? <div className={styles.loading}><span/><span/><span/></div>
          : filtered.length === 0
            ? <div className={styles.empty}>
                <GlobeIcon size={40} color="var(--text-faint)" strokeWidth={1}/>
                <p>No alumni found{search ? ` for "${search}"` : ''}</p>
              </div>
            : <div className={styles.alumniGrid}>
                {filtered.map(a => (
                  <div key={a.id} className={styles.alumniCard}>
                    <div className={styles.alumniAvatar} style={{ background: schoolColor }}>
                      {a.avatar_url
                        ? <img src={a.avatar_url} alt={a.full_name} style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:'50%' }}/>
                        : <UserIcon size={20} color="white"/>
                      }
                    </div>
                    <p className={styles.alumniName}>{a.full_name}</p>
                    <p className={styles.alumniYear}>Class of {a.graduation_year}</p>
                    {a.occupation && (
                      <p className={styles.alumniOccupation}>{a.occupation}{a.company ? ` @ ${a.company}` : ''}</p>
                    )}
                    {a.location && (
                      <p className={styles.alumniLocation}>📍 {a.location}</p>
                    )}
                    {a.linkedin_url && (
                      <a href={a.linkedin_url} target="_blank" rel="noreferrer"
                        className={styles.linkedinBtn} style={{ borderColor: schoolColor + '40', color: schoolColor }}>
                        Connect →
                      </a>
                    )}
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
