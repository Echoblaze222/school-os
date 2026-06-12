'use client'

import { useState, useEffect, useCallback } from 'react'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import styles from './notifications.module.css'

interface Notification {
  id: string
  title: string
  body: string
  type: string
  is_read: boolean
  created_at: string
  link_url: string | null
}

interface Props {
  initialNotifications: Notification[]
  unreadCount: number
  userId: string
  role: string
}

const FILTERS = [
  { key: 'all',          label: 'All',          emoji: '🔔' },
  { key: 'unread',       label: 'Unread',       emoji: '🔵' },
  { key: 'result',       label: 'Results',      emoji: '📊' },
  { key: 'payment',      label: 'Payments',     emoji: '💰' },
  { key: 'announcement', label: 'News',         emoji: '📣' },
  { key: 'assignment',   label: 'Assignments',  emoji: '📝' },
  { key: 'system',       label: 'System',       emoji: '⚙️' },
]

const TYPE_EMOJIS: Record<string, string> = {
  result:       '📊',
  assignment:   '📝',
  payment:      '💰',
  announcement: '📣',
  promotion:    '🎓',
  transfer:     '🔄',
  meeting:      '📅',
  chat:         '💬',
  system:       '⚙️',
  reminder:     '⏰',
}

const ROLE_DASHBOARDS: Record<string, string> = {
  student:   '/dashboard/student',
  teacher:   '/dashboard/teacher',
  principal: '/dashboard/principal',
  bursar:    '/dashboard/bursar',
  parent:    '/dashboard/parent',
  secretary: '/dashboard/secretary',
}

export default function NotificationsPageClient({
  initialNotifications, unreadCount, userId, role,
}: Props) {
  const router   = useRouter()
  const supabase = createClient()

  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications)
  const [filter,        setFilter]        = useState('all')
  const [loading,       setLoading]       = useState(false)
  const [theme,         setTheme]         = useState<'dark' | 'light'>('dark')
  const [localUnread,   setLocalUnread]   = useState(unreadCount)

  const push = usePushNotifications()
  const dashboardPath = ROLE_DASHBOARDS[role] ?? '/dashboard/student'

  useEffect(() => {
    const saved = localStorage.getItem('schoolos_theme') as any
    if (saved) {
      setTheme(saved)
      document.documentElement.setAttribute('data-theme', saved === 'light' ? 'light' : '')
    }

    // Real-time — new notifications arrive instantly
    const channel = supabase
      .channel(`notifs-page:${userId}`)
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'notifications',
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        const n = payload.new as Notification
        setNotifications(prev => [n, ...prev])
        setLocalUnread(prev => prev + 1)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId])

  async function markAllRead() {
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false)

    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    setLocalUnread(0)
  }

  async function markOneRead(id: string) {
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id)

    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, is_read: true } : n)
    )
    setLocalUnread(prev => Math.max(prev - 1, 0))
  }

  async function deleteNotif(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    await supabase.from('notifications').delete().eq('id', id)
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  async function loadMore() {
    setLoading(true)
    const { data } = await supabase
      .from('notifications')
      .select('id, title, body, type, is_read, created_at, link_url')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(notifications.length, notifications.length + 49)

    if (data) setNotifications(prev => [...prev, ...data])
    setLoading(false)
  }

  function handleClick(notif: Notification) {
    if (!notif.is_read) markOneRead(notif.id)
    if (notif.link_url) router.push(notif.link_url)
  }

  function formatTime(dateStr: string) {
    const date = new Date(dateStr)
    const now   = new Date()
    const diff  = now.getTime() - date.getTime()
    const mins  = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days  = Math.floor(diff / 86400000)

    if (mins < 1)   return 'Just now'
    if (mins < 60)  return `${mins}m ago`
    if (hours < 24) return `${hours}h ago`
    if (days === 1) return 'Yesterday'
    if (days < 7)   return date.toLocaleDateString([], { weekday: 'long' })
    return date.toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  // Apply filter
  const filtered = notifications.filter(n => {
    if (filter === 'all')    return true
    if (filter === 'unread') return !n.is_read
    return n.type === filter
  })

  // Group by date
  function getDateGroup(dateStr: string) {
    const date = new Date(dateStr)
    const now  = new Date()
    const diff = Math.floor((now.getTime() - date.getTime()) / 86400000)
    if (diff === 0) return 'Today'
    if (diff === 1) return 'Yesterday'
    if (diff < 7)  return 'This Week'
    if (diff < 30) return 'This Month'
    return 'Older'
  }

  // Build grouped list
  const groups: Record<string, Notification[]> = {}
  filtered.forEach(n => {
    const g = getDateGroup(n.created_at)
    if (!groups[g]) groups[g] = []
    groups[g].push(n)
  })
  const groupOrder = ['Today', 'Yesterday', 'This Week', 'This Month', 'Older']

  return (
    <div className={styles.page}>

      {/* Header */}
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.push(dashboardPath)}>←</button>
        <div className={styles.headerCenter}>
          <h1 className={styles.headerTitle}>Notifications</h1>
          {localUnread > 0 && (
            <span className={styles.unreadBadge}>{localUnread}</span>
          )}
        </div>
        <div className={styles.headerRight}>
          <button className={styles.iconBtn} onClick={() => {
            const next = theme === 'dark' ? 'light' : 'dark'
            setTheme(next)
            localStorage.setItem('schoolos_theme', next)
            document.documentElement.setAttribute('data-theme', next === 'light' ? 'light' : '')
          }}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>

          {/* ── Push toggle ── */}
          {push.supported && !push.loading && push.permission !== 'denied' && (
            <button
              className={styles.markAllBtn}
              style={{
                background:  push.subscribed ? 'rgba(34,197,94,0.15)' : 'var(--card-bg)',
                color:       push.subscribed ? '#4ade80' : 'var(--text)',
                borderColor: push.subscribed ? 'rgba(34,197,94,0.4)' : 'var(--border)',
              }}
              onClick={push.subscribed ? push.unsubscribe : push.subscribe}
              title={push.subscribed ? 'Disable push alerts' : 'Enable push alerts on this device'}
            >
              {push.subscribed ? '🔔 On' : '🔕 Alerts'}
            </button>
          )}
          {localUnread > 0 && (
            <button className={styles.markAllBtn} onClick={markAllRead}>
              ✓ All read
            </button>
          )}
        </div>
      </header>

      {/* Filter tabs */}
      <div className={styles.filterTabs}>
        {FILTERS.map(f => {
          const count = f.key === 'unread'
            ? localUnread
            : f.key === 'all'
            ? notifications.length
            : notifications.filter(n => n.type === f.key).length

          return (
            <button
              key={f.key}
              className={`${styles.filterTab} ${filter === f.key ? styles.filterTabActive : ''}`}
              onClick={() => setFilter(f.key)}
            >
              <span>{f.emoji}</span>
              <span>{f.label}</span>
              {count > 0 && (
                <span className={styles.filterCount}>{count}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Notifications */}
      <div className={styles.list}>
        {filtered.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyEmoji}>🔔</p>
            <p className={styles.emptyTitle}>
              {filter === 'all' ? 'No notifications yet' : `No ${filter} notifications`}
            </p>
            <p className={styles.emptyHint}>
              {filter === 'all'
                ? 'Results, payments, and announcements will appear here'
                : `Switch to "All" to see everything`
              }
            </p>
          </div>
        ) : (
          groupOrder.map(group => {
            const items = groups[group]
            if (!items || items.length === 0) return null

            return (
              <div key={group}>
                <p className={styles.dateGroup}>{group}</p>
                {items.map(notif => (
                  <button
                    key={notif.id}
                    className={`${styles.notifItem} ${!notif.is_read ? styles.unread : ''}`}
                    onClick={() => handleClick(notif)}
                  >
                    <div className={`${styles.notifIcon} ${!notif.is_read ? styles.notifIconUnread : ''}`}>
                      {TYPE_EMOJIS[notif.type] ?? '🔔'}
                    </div>

                    <div className={styles.notifContent}>
                      <p className={styles.notifTitle}>{notif.title}</p>
                      <p className={styles.notifBody}>{notif.body}</p>
                      <p className={styles.notifTime}>{formatTime(notif.created_at)}</p>
                    </div>

                    <div className={styles.notifRight}>
                      {!notif.is_read && <div className={styles.unreadDot} />}
                      <button
                        className={styles.deleteBtn}
                        onClick={e => deleteNotif(notif.id, e)}
                        title="Delete"
                      >
                        ✕
                      </button>
                    </div>
                  </button>
                ))}
              </div>
            )
          })
        )}

        {/* Load more */}
        {filtered.length >= 50 && (
          <button
            className={styles.loadMoreBtn}
            onClick={loadMore}
            disabled={loading}
          >
            {loading ? '⏳ Loading...' : 'Load more notifications'}
          </button>
        )}

        <div style={{ height: '100px' }} />
      </div>

      {/* Bottom Nav */}
      <nav className="bottom-nav">
        <a href={dashboardPath} className="nav-item">
          <span style={{ fontSize: '1.2rem' }}>🏠</span>
          <span>Home</span>
        </a>
        <a href={`${dashboardPath}/notifications`} className="nav-item active">
          <span style={{ fontSize: '1.2rem' }}>🔔</span>
          <span>Alerts</span>
        </a>
        <a href={dashboardPath} className="nav-home">
          <span style={{ fontSize: '1.3rem' }}>
            {role === 'student' ? '🎓' : role === 'teacher' ? '👨‍🏫' : '👤'}
          </span>
        </a>
        <a href={`${dashboardPath}/chat`} className="nav-item">
          <span style={{ fontSize: '1.2rem' }}>💬</span>
          <span>Chat</span>
        </a>
        <a href={`${dashboardPath}/profile`} className="nav-item">
          <span style={{ fontSize: '1.2rem' }}>👤</span>
          <span>Profile</span>
        </a>
      </nav>
    </div>
  )
}
