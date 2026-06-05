'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BellIcon, CheckIcon, XIcon } from '@/components/Icons'
import styles from './NotificationBell.module.css'

interface Notification {
  id:         string
  title:      string
  body:       string
  type:       string
  is_read:    boolean
  created_at: string
  action_url?: string
}

interface Props {
  userId:      string
  schoolColor?: string
}

const TYPE_ICONS: Record<string, string> = {
  chat:    '💬',
  payment: '💳',
  system:  '🔔',
  alert:   '⚠️',
  result:  '📊',
}

export default function NotificationBell({ userId, schoolColor = '#7C3AED' }: Props) {
  const [open,    setOpen]    = useState(false)
  const [notifs,  setNotifs]  = useState<Notification[]>([])
  const [unread,  setUnread]  = useState(0)
  const [loading, setLoading] = useState(false)

  const router   = useRouter()
  const supabase = createClient()
  const panelRef = useRef<HTMLDivElement>(null)

  // Load on mount + real-time updates
  useEffect(() => {
    fetchNotifications()

    const ch = supabase
      .channel(`notifs:${userId}`)
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'notifications',
        filter: `user_id=eq.${userId}`,
      }, payload => {
        const n = payload.new as Notification
        setNotifs(prev => [n, ...prev].slice(0, 30))
        setUnread(prev => prev + 1)
      })
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [userId])

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  async function fetchNotifications() {
    setLoading(true)
    const res = await fetch('/api/notifications?limit=20')
    if (res.ok) {
      const data = await res.json()
      setNotifs(data.notifications ?? [])
      setUnread(data.unreadCount ?? 0)
    }
    setLoading(false)
  }

  async function markAllRead() {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markAll: true }),
    })
    setNotifs(prev => prev.map(n => ({ ...n, is_read: true })))
    setUnread(0)
  }

  async function markRead(id: string) {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id] }),
    })
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
    setUnread(prev => Math.max(0, prev - 1))
  }

  function handleNotifClick(notif: Notification) {
    markRead(notif.id)
    if (notif.action_url) {
      router.push(notif.action_url)
      setOpen(false)
    }
  }

  function timeAgo(d: string) {
    const diff = Date.now() - new Date(d).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1)    return 'just now'
    if (mins < 60)   return `${mins}m ago`
    if (mins < 1440) return `${Math.floor(mins / 60)}h ago`
    return `${Math.floor(mins / 1440)}d ago`
  }

  return (
    <div className={styles.wrapper} ref={panelRef}>

      {/* Bell button */}
      <button
        className={styles.bell}
        onClick={() => {
          setOpen(!open)
          if (!open) fetchNotifications()
        }}
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ''}`}
      >
        <BellIcon size={20} color="var(--text-secondary)" />
        {unread > 0 && (
          <span
            className={styles.badge}
            style={{ background: schoolColor }}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className={styles.panel}>

          {/* Panel header */}
          <div className={styles.panelHeader}>
            <p className={styles.panelTitle}>Notifications</p>
            <div className={styles.panelActions}>
              {unread > 0 && (
                <button className={styles.markAllBtn} onClick={markAllRead} title="Mark all read">
                  <CheckIcon size={14} />
                  <span>All read</span>
                </button>
              )}
              <button className={styles.closeBtn} onClick={() => setOpen(false)}>
                <XIcon size={16} />
              </button>
            </div>
          </div>

          {/* Notification list */}
          <div className={styles.list}>
            {loading && (
              <div className={styles.loadingRow}>
                <div className={styles.dots}><span/><span/><span/></div>
              </div>
            )}

            {!loading && notifs.length === 0 && (
              <div className={styles.empty}>
                <span className={styles.emptyIcon}>🔔</span>
                <p>No notifications yet</p>
              </div>
            )}

            {!loading && notifs.map(notif => (
              <button
                key={notif.id}
                className={`${styles.notifItem} ${!notif.is_read ? styles.notifUnread : ''}`}
                onClick={() => handleNotifClick(notif)}
                style={!notif.is_read ? { borderLeft: `3px solid ${schoolColor}` } : undefined}
              >
                <div className={styles.notifIcon}>
                  {TYPE_ICONS[notif.type] ?? '🔔'}
                </div>
                <div className={styles.notifContent}>
                  <p className={styles.notifTitle}>{notif.title}</p>
                  <p className={styles.notifBody}>{notif.body}</p>
                  <p className={styles.notifTime}>{timeAgo(notif.created_at)}</p>
                </div>
                {!notif.is_read && (
                  <div className={styles.unreadDot} style={{ background: schoolColor }} />
                )}
              </button>
            ))}
          </div>

          {notifs.length > 0 && (
            <div className={styles.panelFooter}>
              <button
                className={styles.viewAllBtn}
                style={{ color: schoolColor }}
                onClick={() => {
                  router.push(`/dashboard/${window.location.pathname.split('/')[2]}/notifications`)
                  setOpen(false)
                }}
              >
                View all notifications →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
