'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import DashboardHeader from '@/components/DashboardHeader'
import StudentNav from '@/components/StudentNav'
import { MessageIcon, PlusIcon } from '@/components/Icons'
import styles from './page.module.css'

interface Props { profile: any; school: any; userId: string }

export default function ChatClient({ profile, school, userId }: Props) {
  const [rooms,   setRooms]   = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const supabase    = createClient()
  const schoolColor = school?.primary_color ?? '#7C3AED'

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase
      .from('chat_room_members')
      // FIX: was querying 'type' which doesn't exist — correct column is 'room_type'
      .select('room:chat_rooms(id, name, description, room_type, updated_at)')
      .eq('user_id', userId)
    if (data) setRooms(data.map((d:any) => d.room).filter(Boolean))
    setLoading(false)
  }

  function timeAgo(d: string) {
    const diff = Date.now() - new Date(d).getTime()
    const mins = Math.floor(diff/60000)
    if (mins < 1)  return 'Just now'
    if (mins < 60) return `${mins}m ago`
    return `${Math.floor(mins/60)}h ago`
  }

  return (
    <div className={styles.page}>
      <StudentNav userId={userId} profile={profile} school={school} schoolColor={schoolColor} />
      <div className={styles.content}>
        <DashboardHeader userId={userId} role="student" profile={profile} school={school}
          schoolColor={schoolColor} title="Messages" showBack />
        <main className={styles.main}>
          {loading
            ? <div className={styles.loading}><span/><span/><span/></div>
            : rooms.length === 0
              ? <div className={styles.empty}>
                  <MessageIcon size={40} color="var(--text-faint)" strokeWidth={1}/>
                  <p>No chats yet. Your teacher will add you to class groups.</p>
                </div>
              : <div className={styles.list}>
                  {rooms.map(room => (
                    <Link key={room.id}
                      href={`/dashboard/student/chat/${room.id}`}
                      className={styles.card} style={{ textDecoration:'none' }}>
                      <div className={styles.cardIcon} style={{ background: schoolColor }}>
                        <span style={{ color:'#fff', fontWeight:700, fontSize:'1rem' }}>{room.name?.[0]}</span>
                      </div>
                      <div className={styles.cardBody}>
                        <p className={styles.cardTitle}>{room.name}</p>
                        {/* FIX: was room.type — now correctly room.room_type */}
                        <p className={styles.cardMeta}>{room.description ?? room.room_type}</p>
                      </div>
                      <span style={{ fontSize:'0.65rem', color:'var(--text-muted)', flexShrink:0 }}>
                        {timeAgo(room.updated_at)}
                      </span>
                    </Link>
                  ))}
                </div>
          }
          <div className={styles.spacer}/>
        </main>
      </div>
    </div>
  )
}
