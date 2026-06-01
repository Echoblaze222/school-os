'use client'
// LeaderboardClient.tsx
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import DashboardHeader from '@/components/DashboardHeader'
import StudentNav from '@/components/StudentNav'
import { TrophyIcon } from '@/components/Icons'
import styles from './page.module.css'
interface Props { profile: any; school: any; userId: string }
export default function LeaderboardClient({ profile, school, userId }: Props) {
  const [board, setBoard] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient(); const schoolColor = school?.primary_color ?? '#7C3AED'
  useEffect(() => { load() }, [])
  async function load() {
    const { data } = await supabase.rpc('get_class_leaderboard', { p_school_id: school?.id, p_limit: 20 })
    if (data) setBoard(data); setLoading(false)
  }
  const medals = ['🥇','🥈','🥉']
  return (
    <div className={styles.page}>
      <StudentNav userId={userId} profile={profile} school={school} schoolColor={schoolColor} />
      <div className={styles.content}>
        <DashboardHeader userId={userId} role="student" profile={profile} school={school} schoolColor={schoolColor} title="Leaderboard" showBack />
        <main className={styles.main}>
          {loading ? <div className={styles.loading}><span/><span/><span/></div>
          : board.length === 0 ? <div className={styles.empty}><TrophyIcon size={40} color="var(--text-faint)" strokeWidth={1}/><p>No leaderboard data yet</p></div>
          : <div className={styles.list}>{board.map((entry: any, i: number) => (
              <div key={i} className={styles.card}
                style={entry.student_id === userId ? { borderColor: schoolColor, background:'var(--brand-subtle)' } : {}}>
                <div style={{ width:36, height:36, borderRadius:'50%', background: i < 3 ? 'var(--gold-subtle)' : 'var(--glass-bg)', display:'flex', alignItems:'center', justifyContent:'center', fontSize: i < 3 ? '1.1rem' : '0.85rem', fontWeight:700, color: i < 3 ? 'var(--gold)' : 'var(--text-muted)', flexShrink:0 }}>
                  {i < 3 ? medals[i] : `#${i+1}`}
                </div>
                <div className={styles.cardBody}>
                  <p className={styles.cardTitle}>{entry.full_name} {entry.student_id===userId ? '(You)' : ''}</p>
                  <p className={styles.cardMeta}>{entry.class_level}</p>
                </div>
                <p style={{ fontSize:'1rem', fontWeight:800, color: i === 0 ? 'var(--gold)' : 'var(--text-primary)', flexShrink:0 }}>{entry.total_score ?? 0}pts</p>
              </div>
            ))}</div>}
          <div className={styles.spacer}/>
        </main>
      </div>
    </div>
  )
}
