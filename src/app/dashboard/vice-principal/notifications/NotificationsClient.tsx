'use client'
// src/app/dashboard/vice-principal/notifications/NotificationsClient.tsx

import { useState } from 'react'
import RoleSubHeader from '@/components/RoleSubHeader'
import { BellIcon, CheckCircleIcon } from '@/components/Icons'
import { VP_FEATURE_GROUPS } from '../featureGroups'
import styles from './notifications.module.css'

interface Notification {
  id: string; title: string; body: string; type: string
  is_read: boolean; created_at: string; action_url: string | null; link_url: string | null
}

interface Props {
  profile: any; school: any; userId: string
  initialNotifications: Notification[]
}

function relTime(iso: string) {
  const d = Date.now() - new Date(iso).getTime()
  const m = Math.floor(d / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.floor(h / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

export default function NotificationsClient({ profile, school, userId, initialNotifications }: Props) {
  const [notifications, setNotifications] = useState(initialNotifications)
  const unreadCount = notifications.filter(n => !n.is_read).length

  async function markRead(id: string) {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    await supabase.from('notifications').update({ is_read: true }).eq('id', id).eq('user_id', userId)
  }

  async function markAllRead() {
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', userId).eq('is_read', false)
  }

  return (
    <RoleSubHeader
      userId={userId} role="vice-principal" profile={profile} school={school}
      title="Notifications" featureGroups={VP_FEATURE_GROUPS}
    >
      {unreadCount > 0 && (
        <button className={styles.markAllBtn} onClick={markAllRead}>
          <CheckCircleIcon size={13} /> Mark all {unreadCount} as read
        </button>
      )}

      {notifications.length === 0 ? (
        <div className={styles.emptyState}>
          <BellIcon size={22} />
          <p>Nothing here yet. Department and appointment updates will show up in this list.</p>
        </div>
      ) : (
        <div className={styles.list}>
          {notifications.map(n => {
            const href = n.action_url ?? n.link_url ?? undefined
            const content = (
              <>
                <span className={styles.dot} style={{ opacity: n.is_read ? 0 : 1 }} />
                <div className={styles.body}>
                  <p className={styles.title}>{n.title}</p>
                  <p className={styles.text}>{n.body}</p>
                  <p className={styles.time}>{relTime(n.created_at)}</p>
                </div>
              </>
            )
            return href ? (
              <a key={n.id} href={href} className={styles.row} onClick={() => !n.is_read && markRead(n.id)}>
                {content}
              </a>
            ) : (
              <button key={n.id} className={styles.row} onClick={() => !n.is_read && markRead(n.id)}>
                {content}
              </button>
            )
          })}
        </div>
      )}
      <div style={{ height: 40 }} />
    </RoleSubHeader>
  )
}
