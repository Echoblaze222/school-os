// src/components/notifications/NotificationsPageShared.tsx
//
// Single shared implementation of the per-role notifications page, used by
// every role's `dashboard/<role>/notifications/NotificationsPageClient.tsx`
// (each of which is now a one-line re-export of this file).
//
// Previously this ~570-line component existed as 13 separate copies, one
// per role folder, that had drifted into three different design
// generations (see the Phase 0 realtime-audit notes). This version
// standardizes on the richest of those three: per-type notification icons
// (including the counseling-specific types), the full broadcast panel, and
// the CSS module with :active press states.
//
// Notification-center fixes in this version:
//   - Unread count comes from the server, not from counting loaded rows.
//   - Mark read / mark all / delete are optimistic and roll back on failure.
//   - Deleting an unread item now lowers the unread count.
//   - New rows are de-duplicated; row updates sync read state across devices.
//   - "Load more" pages by time and shows only when more really exist.
//   - The delete control is no longer a button nested inside a button.
//   - Links are checked (in-app paths only) and both action_url and link_url
//     are honoured.
//   - The detail dialog closes on Escape and has dialog semantics.
//   - Day groups use calendar days (Today / Yesterday / weekday).
//   - A principal broadcast no longer sends every recipient two pushes (the
//     database trigger already pushes each inserted row), and large audiences
//     are inserted in chunks.
//   - ?open=<id> opens that notification (used by the bell for items that have
//     no link of their own).
'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { useRealtimeNotifications } from '@/hooks/useRealtimeNotifications'
import RoleNav from '@/components/RoleNav'
import {
  BellIcon, BellOffIcon, StatusDotIcon, BarChartIcon, WalletIcon, MegaphoneIcon,
  EditIcon, SettingsIcon, GraduationCapIcon, RefreshIcon, CalendarIcon, MessageIcon,
  ClockIcon, CheckIcon, CheckCircleIcon, XIcon, AlertIcon, UploadIcon, ArrowLeftIcon,
} from '@/components/Icons'
import styles from './notifications.module.css'

interface Notification {
  id: string
  title: string
  body: string
  type: string
  is_read: boolean
  created_at: string
  action_url: string | null
  link_url?: string | null
}

interface Props {
  initialNotifications: Notification[]
  unreadCount: number
  userId: string
  role: string
  schoolId?: string
  profile?: any
  school?: any
  schoolColor?: string
}

const PAGE_SIZE = 50
const COLUMNS   = 'id, title, body, type, is_read, created_at, action_url, link_url'
const INSERT_CHUNK = 500

const FILTERS = [
  { key: 'all',          label: 'All',         Icon: BellIcon },
  { key: 'unread',       label: 'Unread',      Icon: StatusDotIcon },
  { key: 'result',       label: 'Results',     Icon: BarChartIcon },
  { key: 'payment',      label: 'Payments',    Icon: WalletIcon },
  { key: 'announcement', label: 'News',        Icon: MegaphoneIcon },
  { key: 'assignment',   label: 'Assignments', Icon: EditIcon },
  { key: 'system',       label: 'System',      Icon: SettingsIcon },
]

const TYPE_ICONS: Record<string, any> = {
  result:       BarChartIcon,
  assignment:   EditIcon,
  payment:      WalletIcon,
  announcement: MegaphoneIcon,
  promotion:    GraduationCapIcon,
  transfer:     RefreshIcon,
  meeting:      CalendarIcon,
  chat:         MessageIcon,
  system:       SettingsIcon,
  reminder:     ClockIcon,
  counseling_referral:    AlertIcon,
  counseling_appointment: CalendarIcon,
}

// Union of every role that has ever appeared across the 13 per-role copies.
const ROLE_DASHBOARDS: Record<string, string> = {
  student:          '/dashboard/student',
  teacher:          '/dashboard/teacher',
  principal:        '/dashboard/principal',
  'vice-principal': '/dashboard/vice-principal',
  bursar:           '/dashboard/bursar',
  parent:           '/dashboard/parent',
  secretary:        '/dashboard/secretary',
  counselor:        '/dashboard/counselor',
  nurse:            '/dashboard/nurse',
  librarian:        '/dashboard/librarian',
  coach:            '/dashboard/coach',
  hostel:           '/dashboard/hostel',
  ict:              '/dashboard/ict',
  examination:      '/dashboard/examination',
}

const NOTIF_TYPES  = ['announcement','result','assignment','payment','meeting','reminder','system']
const TARGET_ROLES = ['all','students','teachers','parents','bursar','secretary']

// Notification links come from the database and rows can be created by client
// code, so only in-app absolute paths are ever followed.
function safeInternalHref(href: string | null | undefined): string | null {
  if (typeof href !== 'string') return null
  if (!href.startsWith('/') || href.startsWith('//') || href.includes('\\')) return null
  return href
}

function resolveTarget(n: Notification): string | null {
  return safeInternalHref(n.action_url) ?? safeInternalHref(n.link_url)
}

export default function NotificationsPageShared({
  initialNotifications,
  unreadCount,
  userId,
  role,
  schoolId,
  profile,
  school,
  schoolColor = '#800020',
}: Props) {
  const router   = useRouter()
  const [supabase] = useState(() => createClient())

  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications)
  const [filter,        setFilter]        = useState('all')
  const [loading,       setLoading]       = useState(false)
  const [hasMore,       setHasMore]       = useState(initialNotifications.length >= PAGE_SIZE)
  const [localUnread,   setLocalUnread]   = useState(unreadCount)
  const [selected,      setSelected]      = useState<Notification | null>(null)
  const notificationsRef = useRef<Notification[]>(initialNotifications)
  notificationsRef.current = notifications

  // Principal broadcast state
  const [showSend,   setShowSend]   = useState(false)
  const [sendTitle,  setSendTitle]  = useState('')
  const [sendBody,   setSendBody]   = useState('')
  const [sendType,   setSendType]   = useState('announcement')
  const [sendTarget, setSendTarget] = useState('all')
  const [sending,    setSending]    = useState(false)
  const [sendResult, setSendResult] = useState<'success' | 'error' | null>(null)
  const [sendError,  setSendError]  = useState('')

  const push = usePushNotifications()

  const dashboardPath = ROLE_DASHBOARDS[role] ?? '/dashboard/student'
  const isPrincipal   = role === 'principal'

  async function refreshUnreadCount() {
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false)
    if (!error && typeof count === 'number') setLocalUnread(count)
  }

  async function refetchLatest() {
    const { data } = await supabase
      .from('notifications')
      .select(COLUMNS)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)
    if (data) {
      setNotifications(data as Notification[])
      setHasMore(data.length >= PAGE_SIZE)
    }
    refreshUnreadCount()
  }

  // Open a specific notification when the URL says so (?open=<id>). The bell
  // uses this for items that carry no link of their own.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('open')
    if (!id) return
    const found = notificationsRef.current.find(n => n.id === id)
    if (found) {
      setSelected(found)
      if (!found.is_read) markOneRead(found.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Close the detail dialog on Escape
  useEffect(() => {
    if (!selected) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSelected(null)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [selected])

  // Realtime. Reconnection-aware: if the connection drops and comes back
  // (flaky wifi, backgrounded tab, etc.), refetches so nothing sent while
  // disconnected is silently missed.
  const { status: realtimeStatus } = useRealtimeNotifications({
    userId,
    onInsert: (n) => {
      if (!n || notificationsRef.current.some(x => x.id === n.id)) return
      setNotifications(prev => [n as Notification, ...prev])
      if (!n.is_read) setLocalUnread(prev => prev + 1)
    },
    onUpdate: (row) => {
      if (!row) return
      const existing = notificationsRef.current.find(n => n.id === row.id)
      // Already matches what we show (our own optimistic update echoing back).
      if (existing && existing.is_read === row.is_read) return
      if (existing) {
        setNotifications(prev =>
          prev.map(n => n.id === row.id ? { ...n, is_read: row.is_read } : n)
        )
      }
      refreshUnreadCount()
    },
    onReconnect: refetchLatest,
  })

  // Actions (optimistic, with rollback)
  async function markAllRead() {
    if (localUnread === 0) return
    const previousList  = notificationsRef.current
    const previousCount = localUnread

    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    setLocalUnread(0)

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false)

    if (error) {
      setNotifications(previousList)
      setLocalUnread(previousCount)
      return
    }
    // They've caught up, so reset the unread-digest backoff.
    supabase.rpc('clear_unread_digest_state').then(() => {}, () => {})
  }

  async function markOneRead(id: string) {
    const target = notificationsRef.current.find(n => n.id === id)
    if (!target || target.is_read) return

    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
    setLocalUnread(prev => Math.max(prev - 1, 0))

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id)
      .eq('user_id', userId)

    if (error) {
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: false } : n))
      setLocalUnread(prev => prev + 1)
    }
  }

  async function deleteNotif(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    const target = notificationsRef.current.find(n => n.id === id)
    if (!target) return

    setNotifications(prev => prev.filter(n => n.id !== id))
    if (!target.is_read) setLocalUnread(prev => Math.max(prev - 1, 0))
    if (selected?.id === id) setSelected(null)

    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)

    if (error) {
      setNotifications(prev =>
        [target, ...prev].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
      )
      if (!target.is_read) setLocalUnread(prev => prev + 1)
    }
  }

  async function loadMore() {
    const last = notificationsRef.current[notificationsRef.current.length - 1]
    if (!last) return
    setLoading(true)
    const { data } = await supabase
      .from('notifications')
      .select(COLUMNS)
      .eq('user_id', userId)
      .lt('created_at', last.created_at)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)
    if (data) {
      setNotifications(prev => {
        const seen = new Set(prev.map(p => p.id))
        return [...prev, ...(data as Notification[]).filter(d => !seen.has(d.id))]
      })
      setHasMore(data.length >= PAGE_SIZE)
    }
    setLoading(false)
  }

  async function sendBroadcast() {
    if (!sendTitle.trim() || !sendBody.trim()) return
    setSending(true); setSendResult(null); setSendError('')

    let query = supabase.from('profiles').select('id').eq('school_id', schoolId ?? '')
    if (sendTarget !== 'all') {
      const roleMap: Record<string, string> = { students: 'student', teachers: 'teacher', parents: 'parent' }
      query = query.eq('role', roleMap[sendTarget] ?? sendTarget)
    }
    const { data: targets, error: fetchErr } = await query
    if (fetchErr || !targets?.length) {
      setSending(false); setSendResult('error'); setSendError(fetchErr?.message ?? 'No users found'); return
    }

    const rows = targets.map(t => ({
      user_id:  t.id,
      school_id: schoolId,
      title:    sendTitle.trim(),
      body:     sendBody.trim(),
      type:     sendType,
      is_read:  false,
      action_url: null,
    }))

    // Insert in chunks so a large school never hits a request size limit.
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      const { error: insertErr } = await supabase.from('notifications').insert(rows.slice(i, i + INSERT_CHUNK))
      if (insertErr) {
        setSending(false); setSendResult('error')
        setSendError(i > 0 ? `Sent to ${i} people, then failed: ${insertErr.message}` : insertErr.message)
        return
      }
    }

    // No separate /api/push/send call here. The database trigger on the
    // notifications table already sends a push for every inserted row, so the
    // old extra call made every recipient get the same alert twice.

    setSending(false); setSendResult('success')
    setSendTitle(''); setSendBody(''); setSendType('announcement'); setSendTarget('all')
    setTimeout(() => { setSendResult(null); setShowSend(false) }, 2500)
  }

  function handleClick(notif: Notification) {
    if (!notif.is_read) markOneRead(notif.id)
    setSelected(notif)
  }

  function closeModal() {
    setSelected(null)
  }

  function viewLinkedItem() {
    const target = selected ? resolveTarget(selected) : null
    if (target) router.push(target)
    setSelected(null)
  }

  function formatTime(dateStr: string) {
    const date  = new Date(dateStr)
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

  // Calendar-day groups, so "Today" means since midnight and not "within 24 hours".
  function getDateGroup(dateStr: string) {
    const date = new Date(dateStr)
    const now  = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const t = date.getTime()
    if (t >= startOfToday) return 'Today'
    if (t >= startOfToday - 86400000) return 'Yesterday'
    if (t >= startOfToday - 6 * 86400000) return date.toLocaleDateString([], { weekday: 'long' })
    return date.toLocaleDateString('en-NG', { month: 'long', year: 'numeric' })
  }

  const filtered = notifications.filter(n => {
    if (filter === 'all')    return true
    if (filter === 'unread') return !n.is_read
    return n.type === filter
  })

  const groups: Record<string, Notification[]> = {}
  const groupOrder: string[] = []
  for (const n of filtered) {
    const g = getDateGroup(n.created_at)
    if (!groups[g]) { groups[g] = []; groupOrder.push(g) }
    groups[g].push(n)
  }

  function PushBtn() {
    if (!push.supported) return null
    if (push.loading) return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', opacity: 0.5 }}>
        <BellIcon size={14} />...
      </span>
    )
    if (push.permission === 'denied') return (
      <span
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', opacity: 0.5 }}
        title="Notifications blocked in browser settings"
      >
        <BellOffIcon size={14} /> Blocked
      </span>
    )
    return (
      <button
        className={styles.markAllBtn}
        style={{
          background:  push.subscribed ? 'var(--success-subtle)' : 'var(--glass-bg)',
          color:       push.subscribed ? 'var(--success)' : 'var(--text-primary)',
          borderColor: push.subscribed ? 'var(--success)' : 'var(--glass-border)',
          display: 'inline-flex', alignItems: 'center', gap: 8,
        }}
        onClick={push.subscribed ? push.unsubscribe : push.subscribe}
        title={push.subscribed ? 'Tap to disable push alerts' : 'Tap to enable push alerts on this device'}
      >
        {push.subscribed ? <><BellIcon size={14} /> Alerts On</> : <><BellOffIcon size={14} /> Enable Alerts</>}
      </button>
    )
  }

  const selectedTarget = selected ? resolveTarget(selected) : null

  return (
    <div className={styles.page}>

      {/* Header */}
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.push(dashboardPath)} aria-label="Back to dashboard"><ArrowLeftIcon size={18} /></button>
        <div className={styles.headerCenter}>
          <h1 className={styles.headerTitle}>Notifications</h1>
          {localUnread > 0 && <span className={`${styles.unreadBadge} tabular-nums`}>{localUnread}</span>}
        </div>
        <div className={styles.headerRight}>
          <PushBtn />
          {localUnread > 0 && (
            <button className={`${styles.markAllBtn} pressable`} onClick={markAllRead} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <CheckIcon size={14} /> All read
            </button>
          )}
          {isPrincipal && (
            <button
              className={styles.markAllBtn}
              style={{ background: 'var(--brand)', color: '#fff', borderColor: 'transparent', display: 'inline-flex', alignItems: 'center', gap: 8 }}
              onClick={() => setShowSend(v => !v)}
            >
              <UploadIcon size={14} /> Send
            </button>
          )}
        </div>
      </header>

      {/* Realtime disconnected banner */}
      {realtimeStatus === 'disconnected' && (
        <div style={{
          margin: '8px 16px', padding: '8px 16px', borderRadius: 10,
          background: 'var(--warning-subtle)', border: '1px solid var(--warning)',
          color: 'var(--warning)', fontSize: '0.78rem',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <AlertIcon size={13} /> Reconnecting, new notifications may be delayed
        </div>
      )}

      {/* Push error banner */}
      {push.error && (
        <div style={{
          margin: '8px 16px', padding: '12px 16px', borderRadius: 10,
          background: 'var(--danger-subtle)', border: '1px solid var(--danger)',
          color: 'var(--danger)', fontSize: '0.8rem',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <AlertIcon size={14} /> {push.error}
        </div>
      )}

      {/* Principal broadcast panel */}
      {isPrincipal && showSend && (
        <div className={styles.broadcastPanel}>
          <p className={styles.broadcastTitle} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <MegaphoneIcon size={15} /> Send Notification to School
          </p>
          {sendResult === 'success' && (
            <div className={`${styles.sendSuccess} animate-success-pop`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircleIcon size={14} /> Notification sent!
            </div>
          )}
          {sendResult === 'error' && (
            <div className={`${styles.sendError} animate-shake`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <XIcon size={14} /> {sendError || 'Failed to send'}
            </div>
          )}
          <div className={styles.broadcastGrid}>
            <div className={styles.bFieldGroup}>
              <label className={styles.bFieldLabel}>Title *</label>
              <input className={styles.bFieldInput} placeholder="e.g. Important Reminder"
                value={sendTitle} onChange={e => setSendTitle(e.target.value)} maxLength={120} />
            </div>
            <div className={styles.bFieldGroup} style={{ gridColumn: '1/-1' }}>
              <label className={styles.bFieldLabel}>Message *</label>
              <textarea className={styles.bFieldInput}
                style={{ resize: 'vertical', minHeight: 80, lineHeight: 1.6 }}
                rows={3} placeholder="Write the notification body..."
                value={sendBody} onChange={e => setSendBody(e.target.value)} maxLength={500} />
            </div>
            <div className={styles.bFieldGroup}>
              <label className={styles.bFieldLabel}>Type</label>
              <select className={styles.bFieldInput} value={sendType} onChange={e => setSendType(e.target.value)}>
                {NOTIF_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
            <div className={styles.bFieldGroup}>
              <label className={styles.bFieldLabel}>Send To</label>
              <select className={styles.bFieldInput} value={sendTarget} onChange={e => setSendTarget(e.target.value)}>
                {TARGET_ROLES.map(r => (
                  <option key={r} value={r}>{r === 'all' ? 'Everyone' : r.charAt(0).toUpperCase() + r.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>
          <div className={styles.broadcastActions}>
            <button className={`${styles.cancelBroadcast} pressable`} onClick={() => setShowSend(false)}>Cancel</button>
            <button className={`${styles.sendBroadcast} pressable`} onClick={sendBroadcast}
              disabled={sending || !sendTitle.trim() || !sendBody.trim()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              {sending ? 'Sending...' : <><UploadIcon size={14} /> Send to {sendTarget === 'all' ? 'Everyone' : sendTarget}</>}
            </button>
          </div>
        </div>
      )}

      {/* Filter tabs. Only the unread tab shows a number: it is the one count
          that is exact, the others would only reflect what has been loaded. */}
      <div className={styles.filterTabs}>
        {FILTERS.map(f => (
          <button
            key={f.key}
            className={`${styles.filterTab} ${filter === f.key ? styles.filterTabActive : ''}`}
            onClick={() => setFilter(f.key)}
          >
            <f.Icon size={15} />
            <span>{f.label}</span>
            {f.key === 'unread' && localUnread > 0 && (
              <span className={`${styles.filterCount} tabular-nums`}>{localUnread}</span>
            )}
          </button>
        ))}
      </div>

      {/* Notifications list */}
      <div className={styles.list}>
        {filtered.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyEmoji}><BellIcon size={40} /></p>
            <p className={styles.emptyTitle}>
              {filter === 'all' ? 'No notifications yet' : filter === 'unread' ? 'You are all caught up' : `No ${filter} notifications`}
            </p>
            <p className={styles.emptyHint}>
              {filter === 'all'
                ? 'Results, payments, and announcements will appear here'
                : hasMore
                ? 'Older notifications are not loaded yet. Load more below.'
                : 'Switch to "All" to see everything'}
            </p>
          </div>
        ) : (
          groupOrder.map(group => {
            const items = groups[group]
            if (!items?.length) return null
            return (
              <div key={group}>
                <p className={styles.dateGroup}>{group}</p>
                {items.map(notif => (
                  // A div with button semantics, not a <button>, because the delete
                  // control inside it is a real button and buttons cannot nest.
                  <div
                    key={notif.id}
                    role="button"
                    tabIndex={0}
                    className={`${styles.notifItem} ${!notif.is_read ? styles.unread : ''}`}
                    onClick={() => handleClick(notif)}
                    onKeyDown={e => {
                      if (e.target !== e.currentTarget) return
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handleClick(notif)
                      }
                    }}
                  >
                    <div className={`${styles.notifIcon} ${!notif.is_read ? styles.notifIconUnread : ''}`}>
                      {(() => { const Icon = TYPE_ICONS[notif.type] ?? BellIcon; return <Icon size={16} /> })()}
                    </div>
                    <div className={styles.notifContent}>
                      <p className={styles.notifTitle}>
                        {!notif.is_read && <span className="sr-only">Unread. </span>}
                        {notif.title}
                      </p>
                      <p className={styles.notifBody}>{notif.body}</p>
                      <p className={styles.notifTime}>{formatTime(notif.created_at)}</p>
                    </div>
                    <div className={styles.notifRight}>
                      {!notif.is_read && <div className={styles.unreadDot} aria-hidden="true" />}
                      <button
                        className={styles.deleteBtn}
                        onClick={e => deleteNotif(notif.id, e)}
                        title="Delete"
                        aria-label={`Delete notification: ${notif.title}`}
                      ><XIcon size={13} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )
          })
        )}

        {hasMore && (
          <button className={`${styles.loadMoreBtn} pressable`} onClick={loadMore} disabled={loading} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {loading ? <><RefreshIcon size={14} /> Loading...</> : 'Load more notifications'}
          </button>
        )}

        {/* Space for bottom nav */}
        <div style={{ height: '90px' }} />
      </div>

      {/* Notification detail dialog */}
      {selected && (
        <div
          onClick={closeModal}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '24px',
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={selected.title}
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--glass-border)',
              borderRadius: 16,
              maxWidth: 420,
              width: '100%',
              maxHeight: '80vh',
              overflowY: 'auto',
              padding: '20px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {(() => { const Icon = TYPE_ICONS[selected.type] ?? BellIcon; return <Icon size={22} /> })()}
                <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>{selected.title}</h2>
              </div>
              <button
                onClick={closeModal}
                aria-label="Close"
                style={{
                  background: 'transparent', border: 'none', color: 'inherit',
                  cursor: 'pointer', opacity: 0.6, lineHeight: 1,
                  display: 'flex', alignItems: 'center',
                }}
              ><XIcon size={17} /></button>
            </div>

            <p style={{
              margin: '16px 0', fontSize: '0.95rem', lineHeight: 1.6,
              whiteSpace: 'pre-wrap', opacity: 0.9,
            }}>
              {selected.body}
            </p>

            <p style={{ fontSize: '0.75rem', opacity: 0.5, margin: '0 0 4px' }}>
              {formatTime(selected.created_at)}
            </p>

            {selectedTarget && (
              <button
                onClick={viewLinkedItem}
                style={{
                  marginTop: 12, width: '100%', padding: '12px 16px',
                  borderRadius: 10, border: 'none', cursor: 'pointer',
                  background: 'var(--brand)', color: '#fff',
                  fontWeight: 600, fontSize: '0.9rem',
                }}
              >
                View Details
              </button>
            )}
          </div>
        </div>
      )}

      {/* Canonical RoleNav, same as every other dashboard page */}
      <RoleNav
        userId={userId}
        profile={profile}
        school={school}
        role={role}
        schoolColor={schoolColor}
      />
    </div>
  )
}
