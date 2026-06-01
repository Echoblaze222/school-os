'use client'
// AnnouncementsClient.tsx
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import DashboardHeader from '@/components/DashboardHeader'
import StudentNav from '@/components/StudentNav'
import { MegaphoneIcon, BellIcon } from '@/components/Icons'
import styles from './page.module.css'

interface Props { profile: any; school: any; userId: string }

export default function AnnouncementsClient({ profile, school, userId }: Props) {
  const [items, setItems]   = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const supabase    = createClient()
  const schoolColor = school?.primary_color ?? '#7C3AED'

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase
      .from('announcements')
      .select('id, title, body, type, created_at, author:profiles(full_name)')
      .eq('school_id', school?.id)
      .order('created_at', { ascending: false })
      .limit(30)
    if (data) setItems(data)
    setLoading(false)
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  return (
    <div className={styles.page}>
      <StudentNav userId={userId} profile={profile} school={school} schoolColor={schoolColor} />
      <div className={styles.content}>
        <DashboardHeader userId={userId} role="student" profile={profile} school={school}
          schoolColor={schoolColor} title="Notice Board" showBack />
        <main className={styles.main}>
          {loading
            ? <div className={styles.loading}><span/><span/><span/></div>
            : items.length === 0
              ? <div className={styles.empty}>
                  <MegaphoneIcon size={40} color="var(--text-faint)" strokeWidth={1} />
                  <p>No announcements yet</p>
                </div>
              : <div className={styles.list}>
                  {items.map(item => (
                    <div key={item.id} className={styles.card}>
                      <div className={styles.cardIcon} style={{ background: schoolColor + '20' }}>
                        <BellIcon size={16} color={schoolColor} />
                      </div>
                      <div className={styles.cardBody}>
                        <p className={styles.cardTitle}>{item.title}</p>
                        <p className={styles.cardText}>{item.body}</p>
                        <p className={styles.cardMeta}>
                          {(item.author as any)?.full_name ?? 'Admin'} · {formatDate(item.created_at)}
                        </p>
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
