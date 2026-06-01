'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import DashboardHeader from '@/components/DashboardHeader'
import StudentNav from '@/components/StudentNav'
import { VideoIcon } from '@/components/Icons'
import styles from './page.module.css'

interface Props { profile: any; school: any; userId: string }

export default function ClassesClient({ profile, school, userId }: Props) {
  const [classes, setClasses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab,     setTab]     = useState<'live'|'upcoming'|'recorded'>('live')
  const supabase    = createClient()
  const schoolColor = school?.primary_color ?? '#7C3AED'

  useEffect(() => { load() }, [tab])

  async function load() {
    setLoading(true)
    const statusMap = { live: 'live', upcoming: 'scheduled', recorded: 'ended' }
    const { data } = await supabase
      .from('live_classes')
      .select('id, title, subject, status, meeting_link, recording_url, scheduled_at, teacher:profiles(full_name)')
      .eq('school_id', school?.id)
      .eq('status', statusMap[tab])
      .order('scheduled_at', { ascending: false })
      .limit(20)
    if (data) setClasses(data)
    setLoading(false)
  }

  const TAB_CONFIG = {
    live:     { label: '🔴 Live Now',  color: '#EF4444' },
    upcoming: { label: '📅 Upcoming',  color: '#F59E0B' },
    recorded: { label: '🎬 Recorded',  color: schoolColor },
  }

  return (
    <div className={styles.page}>
      <StudentNav userId={userId} profile={profile} school={school} schoolColor={schoolColor} />
      <div className={styles.content}>
        <DashboardHeader userId={userId} role="student" profile={profile} school={school}
          schoolColor={schoolColor} title="Classes" showBack />
        <main className={styles.main}>
          <div style={{ display:'flex', gap:'var(--space-2)', marginBottom:'var(--space-5)', flexWrap:'wrap' }}>
            {(Object.keys(TAB_CONFIG) as (keyof typeof TAB_CONFIG)[]).map(t => (
              <button key={t} onClick={() => setTab(t)}
                style={{ padding:'6px 16px', borderRadius:'999px', fontSize:'0.78rem', fontWeight:700,
                  background: tab===t ? TAB_CONFIG[t].color : 'var(--glass-bg)',
                  color:      tab===t ? '#fff' : 'var(--text-muted)',
                  border:`1px solid ${tab===t ? TAB_CONFIG[t].color : 'var(--glass-border)'}`, cursor:'pointer' }}>
                {TAB_CONFIG[t].label}
              </button>
            ))}
          </div>

          {loading ? <div className={styles.loading}><span/><span/><span/></div>
          : classes.length === 0
            ? <div className={styles.empty}><VideoIcon size={40} color="var(--text-faint)" strokeWidth={1}/><p>No {tab} classes right now</p></div>
            : <div className={styles.list}>
              {classes.map(cls => {
                const actionUrl  = tab === 'recorded' ? cls.recording_url : cls.meeting_link
                const actionLabel = tab === 'live' ? 'Join Now' : tab === 'upcoming' ? 'View Link' : 'Watch'
                const iconColor   = tab === 'live' ? '#EF4444' : schoolColor
                return (
                  <div key={cls.id} className={styles.card}>
                    <div className={styles.cardIcon} style={{ background: iconColor + '20' }}>
                      <VideoIcon size={16} color={iconColor}/>
                    </div>
                    <div className={styles.cardBody}>
                      <p className={styles.cardTitle}>{cls.title}</p>
                      <p className={styles.cardText}>{cls.subject}</p>
                      <p className={styles.cardMeta}>
                        {(cls.teacher as any)?.full_name ?? 'Teacher'}
                        {cls.scheduled_at ? ` · ${new Date(cls.scheduled_at).toLocaleDateString('en-NG',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}` : ''}
                      </p>
                    </div>
                    {actionUrl && (
                      <a href={actionUrl} target="_blank" rel="noreferrer"
                        style={{ padding:'7px 14px', background: iconColor, color:'#fff', borderRadius:'999px', fontSize:'0.72rem', fontWeight:700, textDecoration:'none', flexShrink:0 }}>
                        {actionLabel}
                      </a>
                    )}
                  </div>
                )
              })}
            </div>
          }
          <div className={styles.spacer}/>
        </main>
      </div>
    </div>
  )
}
