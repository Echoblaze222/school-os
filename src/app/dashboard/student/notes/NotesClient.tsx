'use client'
// NotesClient.tsx
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import DashboardHeader from '@/components/DashboardHeader'
import StudentNav from '@/components/StudentNav'
import { BookIcon, DownloadIcon } from '@/components/Icons'
import styles from './page.module.css'
interface Props { profile: any; school: any; userId: string }
export default function NotesClient({ profile, school, userId }: Props) {
  const [notes, setNotes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient(); const schoolColor = school?.primary_color ?? '#7C3AED'
  useEffect(() => { load() }, [])
  async function load() {
    const { data } = await supabase.from('notes').select('id, title, subject, file_url, created_at, author:profiles(full_name)')
      .eq('school_id', school?.id).order('created_at', { ascending: false })
    if (data) setNotes(data); setLoading(false)
  }
  return (
    <div className={styles.page}>
      <StudentNav userId={userId} profile={profile} school={school} schoolColor={schoolColor} />
      <div className={styles.content}>
        <DashboardHeader userId={userId} role="student" profile={profile} school={school} schoolColor={schoolColor} title="School Notes" showBack />
        <main className={styles.main}>
          {loading ? <div className={styles.loading}><span/><span/><span/></div>
          : notes.length === 0 ? <div className={styles.empty}><BookIcon size={40} color="var(--text-faint)" strokeWidth={1}/><p>No notes uploaded yet</p></div>
          : <div className={styles.list}>{notes.map(n => (
              <div key={n.id} className={styles.card}>
                <div className={styles.cardIcon} style={{ background: schoolColor+'20' }}><BookIcon size={16} color={schoolColor}/></div>
                <div className={styles.cardBody}>
                  <p className={styles.cardTitle}>{n.title}</p>
                  <p className={styles.cardMeta}>{n.subject} · {(n.author as any)?.full_name}</p>
                </div>
                {n.file_url && <a href={n.file_url} target="_blank" rel="noreferrer"
                  style={{ width:34, height:34, display:'flex', alignItems:'center', justifyContent:'center', background:'var(--glass-bg)', border:'1px solid var(--glass-border)', borderRadius:'var(--radius-md)', flexShrink:0 }}>
                  <DownloadIcon size={15} color="var(--text-muted)"/>
                </a>}
              </div>
            ))}</div>}
          <div className={styles.spacer}/>
        </main>
      </div>
    </div>
  )
}
