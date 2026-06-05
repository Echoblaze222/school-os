'use client'

import { useState, useEffect, useCallback } from 'react'
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
  schoolId?: string
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

const NOTIF_TYPES = ['announcement','result','assignment','payment','meeting','reminder','system']
const TARGET_ROLES = ['all','students','teachers','parents','bursar','secretary']

export default function NotificationsPageClient({
  initialNotifications, unreadCount, userId, role, schoolId,
}: Props) {
  const router   = useRouter()
  const supabase = createClient()

  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications)
  const [filter,        setFilter]        = useState('all')
  const [loading,       setLoading]       = useState(false)
  const [theme,         setTheme]         = useState<'dark' | 'light'>('dark')
  const [localUnread,   setLocalUnread]   = useState(unreadCount)

  // Principal broadcast state
  const [showSend,    setShowSend]    = useState(false)
  const [sendTitle,   setSendTitle]   = useState('')
  const [sendBody,    setSendBody]    = useState('')
  const [sendType,    setSendType]    = useState('announcement')
  const [sendTarget,  setSendTarget]  = useState('all')
  const [sending,     setSending]     = useState(false)
  const [sendResult,  setSendResult]  = useState<'success' | 'error' | null>(null)
  const [sendError,   setSendError]   = useState('')

  const dashboardPath = ROLE_DASHBOARDS[role] ?? '/dashboard/student'
  const isPrincipal   = role === 'principal'

  useEffect(() => {
    const saved = localStorage.getItem('schoolos_theme') as any
    if (saved) {
      setTheme(saved)
      document.documentElement.setAttribute('data-theme', saved === 'light' ? 'light' : '')
    }

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

  async function sendBroadcast() {
    if (!sendTitle.trim() || !sendBody.trim()) return
    setSending(true); setSendResult(null); setSendError('')

    // Fetch target user IDs from this school
    let query = supabase
      .from('profiles')
      .select('id')
      .eq('school_id', schoolId ?? '')

    if (sendTarget !== 'all') {
      // 'students' → role=student, 'teachers' → role=teacher, etc.
      const roleMap: Record<string,string> = { students:'student', teachers:'teacher', parents:'parent' }
      query = query.eq('role', roleMap[sendTarget] ?? sendTarget)
    }

    const { data: targets, error: fetchErr } = await query
    if (fetchErr || !targets?.length) {
      setSending(false); setSendResult('error'); setSendError(fetchErr?.message ?? 'No users found'); return
    }

    const rows = targets.map(t => ({
      user_id:  t.id,
      title:    sendTitle.trim(),
      body:     sendBody.trim(),
      type:     sendType,
      is_read:  false,
      link_url: null,
    }))

    const { error } = await supabase.from('notifications').insert(rows)
    setSending(false)
    if (error) { setSendResult('error'); setSendError(error.message); return }

    setSendResult('success')
    setSendTitle(''); setSendBody(''); setSendType('announcement'); setSendTarget('all')
    setTimeout(() => { setSendResult(null); setShowSend(false) }, 2500)
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

  const filtered = notifications.filter(n => {
    if (filter === 'all')    return true
    if (filter === 'unread') return !n.is_read
    return n.type === filter
  })

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
          {localUnread > 0 && (
            <button className={styles.markAllBtn} onClick={markAllRead}>
              ✓ All read
            </button>
          )}
          {isPrincipal && (
            <button className={styles.markAllBtn} style={{ background:'var(--burgundy)', color:'#fff', borderColor:'transparent' }} onClick={() => setShowSend(v => !v)}>
              📤 Send
            </button>
          )}
        </div>
      </header>

      {/* Principal broadcast panel */}
      {isPrincipal && showSend && (
        <div className={styles.broadcastPanel}>
          <p className={styles.broadcastTitle}>📢 Send Notification to School</p>

          {sendResult === 'success' && (
            <div className={styles.sendSuccess}>✓ Notification sent successfully!</div>
          )}
          {sendResult === 'error' && (
            <div className={styles.sendError}>✕ {sendError || 'Failed to send'}</div>
          )}

          <div className={styles.broadcastGrid}>
            <div className={styles.bFieldGroup}>
              <label className={styles.bFieldLabel}>Title *</label>
              <input className={styles.bFieldInput} placeholder="e.g. Important Reminder" value={sendTitle} onChange={e => setSendTitle(e.target.value)} maxLength={120}/>
            </div>
            <div className={styles.bFieldGroup} style={{ gridColumn:'1/-1' }}>
              <label className={styles.bFieldLabel}>Message *</label>
              <textarea className={styles.bFieldInput} style={{ resize:'vertical', minHeight:80, lineHeight:1.6 }} rows={3} placeholder="Write the notification body…" value={sendBody} onChange={e => setSendBody(e.target.value)} maxLength={500}/>
            </div>
            <div className={styles.bFieldGroup}>
              <label className={styles.bFieldLabel}>Type</label>
              <select className={styles.bFieldInput} value={sendType} onChange={e => setSendType(e.target.value)}>
                {NOTIF_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
              </select>
            </div>
            <div className={styles.bFieldGroup}>
              <label className={styles.bFieldLabel}>Send To</label>
              <select className={styles.bFieldInput} value={sendTarget} onChange={e => setSendTarget(e.target.value)}>
                {TARGET_ROLES.map(r => <option key={r} value={r}>{r === 'all' ? 'Everyone' : r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
              </select>
            </div>
          </div>
          <div className={styles.broadcastActions}>
            <button className={styles.cancelBroadcast} onClick={() => setShowSend(false)}>Cancel</button>
            <button
              className={styles.sendBroadcast}
              onClick={sendBroadcast}
              disabled={sending || !sendTitle.trim() || !sendBody.trim()}
            >
              {sending ? 'Sending…' : `📤 Send to ${sendTarget === 'all' ? 'Everyone' : sendTarget}`}
            </button>
          </div>
        </div>
      )}

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
      <nav className="bottom-nav-mobile">
        <a href={dashboardPath} className="nav-item">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          <span>Home</span>
        </a>
        <a href={`${dashboardPath}/notifications`} className="nav-item active">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
          <span>Alerts</span>
        </a>
        <a href={dashboardPath} className="nav-home-btn" aria-label="Dashboard">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 010 14.14M4.93 4.93a10 10 0 000 14.14"/></svg>
        </a>
        <a href={`${dashboardPath}/chat`} className="nav-item">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
          <span>Chat</span>
        </a>
        <a href={`${dashboardPath}/profile`} className="nav-item">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          <span>Profile</span>
        </a>
      </nav>
    </div>
  )
}
