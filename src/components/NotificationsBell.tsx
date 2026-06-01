'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BellIcon, CheckCircleIcon } from './Icons'
import styles from './NotificationsBell.module.css'

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
  userId: string
  role?:  string
}

const TYPE_COLORS: Record<string, string> = {
  announcement: '#3B82F6',
  assignment:   '#F59E0B',
  result:       '#10B981',
  quiz:         '#8B5CF6',
  chat:         '#7C3AED',
  payment:      '#EF4444',
  system:       '#6B7280',
  default:      '#7C3AED',
}

export default function NotificationsBell({ userId, role = 'student' }: Props) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [open,          setOpen]          = useState(false)
  const [loading,       setLoading]       = useState(false)
  const supabase = createClient()
  const panelRef = useRef<HTMLDivElement>(null)
  const btnRef   = useRef<HTMLButtonElement>(null)

  const unread = notifications.filter(n => !n.is_read).length

  // ── Load notifications ───────────────────────────────────
  useEffect(() => {
    loadNotifications()

    // Real-time subscription
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on('postgres_changes', {
        event:  '*',
        schema: 'public',
        table:  'notifications',
        filter: `user_id=eq.${userId}`,
      }, () => loadNotifications())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId])

  // ── Close panel on outside click ─────────────────────────
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        open &&
        panelRef.current &&
        btnRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  async function loadNotifications() {
    setLoading(true)
    const { data } = await supabase
      .from('notifications')
      .select('id, title, body, type, is_read, created_at, action_url')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20)

    if (data) setNotifications(data as Notification[])
    setLoading(false)
  }

  async function markAllRead() {
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false)

    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
  }

  async function markOneRead(id: string) {
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id)

    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, is_read: true } : n)
    )
  }

  function formatTime(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins  = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days  = Math.floor(diff / 86400000)
    if (mins  < 1)   return 'Just now'
    if (mins  < 60)  return `${mins}m ago`
    if (hours < 24)  return `${hours}h ago`
    if (days  < 7)   return `${days}d ago`
    return new Date(dateStr).toLocaleDateString()
  }

  return (
    <div className={styles.wrapper}>
      {/* Bell button */}
      <button
        ref={btnRef}
        className={styles.bellBtn}
        onClick={() => setOpen(!open)}
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ''}`}
      >
        <BellIcon size={18} />
        {unread > 0 && (
          <span className={styles.badge}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* Panel — FIX: z-index above everything */}
      {open && (
        <div ref={panelRef} className={styles.panel}>
          {/* Header */}
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.panelTitle}>Notifications</p>
              {unread > 0 && (
                <p className={styles.panelSub}>{unread} unread</p>
              )}
            </div>
            {unread > 0 && (
              <button className={styles.markAllBtn} onClick={markAllRead}>
                <CheckCircleIcon size={13} />
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className={styles.list}>
            {loading ? (
              <div className={styles.empty}>
                <div className={styles.loadingDots}>
                  <span /><span /><span />
                </div>
              </div>
            ) : notifications.length === 0 ? (
              <div className={styles.empty}>
                <BellIcon size={28} color="var(--text-faint)" />
                <p>No notifications yet</p>
              </div>
            ) : (
              notifications.map(n => (
                <button
                  key={n.id}
                  className={`${styles.notifItem} ${!n.is_read ? styles.notifUnread : ''}`}
                  onClick={() => {
                    markOneRead(n.id)
                    if (n.action_url) window.location.href = n.action_url
                  }}
                >
                  {/* Type indicator */}
                  <div
                    className={styles.typeDot}
                    style={{ background: TYPE_COLORS[n.type] ?? TYPE_COLORS.default }}
                  />
                  <div className={styles.notifContent}>
                    <p className={styles.notifTitle}>{n.title}</p>
                    <p className={styles.notifBody}>{n.body}</p>
                    <p className={styles.notifTime}>{formatTime(n.created_at)}</p>
                  </div>
                  {!n.is_read && <div className={styles.unreadDot} />}
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className={styles.panelFooter}>
              <a href={`/dashboard/${role}/notifications`} className={styles.viewAll}>
                View all notifications →
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
