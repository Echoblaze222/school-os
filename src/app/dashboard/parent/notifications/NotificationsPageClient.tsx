// src/app/dashboard/parent/notifications/NotificationsPageClient.tsx
// Parent-specific variant - no broadcast panel (parents can't send to school)
// Uses the same RoleSubHeader + BottomDock as every other parent page
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import RoleSubHeader from '@/components/RoleSubHeader'
import { PARENT_FEATURE_GROUPS } from '@/app/dashboard/parent/featureGroups'
import {
  AlertIcon, CheckCircleIcon, BellIcon, BellOffIcon, StatusDotIcon, BarChartIcon,
  WalletIcon, MegaphoneIcon, ClipboardIcon, SettingsIcon, GraduationCapIcon,
  TransferIcon, CalendarIcon, MessageIcon, ClockIcon, XIcon,
} from '@/components/Icons'
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
  profile?: any
  school?: any
  schoolColor?: string
}

const FILTERS: { key: string; label: string; Icon: typeof BellIcon }[] = [
  { key: 'all',          label: 'All',         Icon: BellIcon },
  { key: 'unread',       label: 'Unread',      Icon: StatusDotIcon },
  { key: 'result',       label: 'Results',     Icon: BarChartIcon },
  { key: 'payment',      label: 'Payments',    Icon: WalletIcon },
  { key: 'announcement', label: 'News',        Icon: MegaphoneIcon },
  { key: 'assignment',   label: 'Assignments', Icon: ClipboardIcon },
  { key: 'system',       label: 'System',      Icon: SettingsIcon },
]

const TYPE_ICONS: Record<string, typeof BellIcon> = {
  result:       BarChartIcon,
  assignment:   ClipboardIcon,
  payment:      WalletIcon,
  announcement: MegaphoneIcon,
  promotion:    GraduationCapIcon,
  transfer:     TransferIcon,
  meeting:      CalendarIcon,
  chat:         MessageIcon,
  system:       SettingsIcon,
  reminder:     ClockIcon,
}

export default function ParentNotificationsPageClient({
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
  const supabase = createClient()

  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications)
  const [filter,        setFilter]        = useState('all')
  const [loading,       setLoading]       = useState(false)
  const [localUnread,   setLocalUnread]   = useState(unreadCount)
  const [selected,      setSelected]      = useState<Notification | null>(null)

  const push = usePushNotifications()

  // ── Realtime new notifications ─────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel(`parent-notifs:${userId}`)
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

  // ── Actions ──────────────────────────────────────────
  async function markAllRead() {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false)
    if (error) return
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    setLocalUnread(0)
  }

  async function markOneRead(id: string) {
    // Scoped to this user's own id, matching the ownership check every other
    // mutation in this app uses - never trust the row id alone.
    const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id).eq('user_id', userId)
    if (error) return
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
    setLocalUnread(prev => Math.max(prev - 1, 0))
  }

  async function deleteNotif(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    const { error } = await supabase.from('notifications').delete().eq('id', id).eq('user_id', userId)
    if (error) return
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
    setSelected(notif)
  }

  function closeModal() {
    setSelected(null)
  }

  function viewLinkedItem() {
    if (selected?.link_url) router.push(selected.link_url)
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

  function getDateGroup(dateStr: string) {
    const date = new Date(dateStr)
    const now  = new Date()
    const diff = Math.floor((now.getTime() - date.getTime()) / 86400000)
    if (diff === 0) return 'Today'
    if (diff === 1) return 'Yesterday'
    if (diff < 7)   return date.toLocaleDateString([], { weekday: 'long' })
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
        <BellIcon size={14} />…
      </span>
    )
    if (push.permission === 'denied') return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', opacity: 0.5 }} title="Notifications blocked in browser settings">
        <BellOffIcon size={14} /> Blocked
      </span>
    )
    return (
      <button
        className={`${styles.markAllBtn} pressable`}
        style={{
          background:  push.subscribed ? 'rgba(34,197,94,0.15)' : 'var(--card-bg)',
          color:       push.subscribed ? '#4ade80' : 'var(--text)',
          borderColor: push.subscribed ? 'rgba(34,197,94,0.4)' : 'var(--border)',
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}
        onClick={push.subscribed ? push.unsubscribe : push.subscribe}
        title={push.subscribed ? 'Tap to disable push alerts' : 'Tap to enable push alerts'}
      >
        {push.subscribed ? <><BellIcon size={14} /> Alerts On</> : <><BellOffIcon size={14} /> Enable Alerts</>}
      </button>
    )
  }

  return (
    <RoleSubHeader userId={userId} role="parent" profile={profile} school={school} title="Notifications" featureGroups={PARENT_FEATURE_GROUPS}>

      {/* Controls row - unread badge, push toggle, mark-all-read */}
      <div className="glass-card-flat" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 14px', marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>Notifications</span>
          {localUnread > 0 && <span className={styles.unreadBadge}>{localUnread}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <PushBtn />
          {localUnread > 0 && (
            <button className={`${styles.markAllBtn} pressable`} onClick={markAllRead}><CheckCircleIcon size={13} /> All read</button>
          )}
        </div>
      </div>

      {/* Push error banner */}
      {push.error && (
        <div style={{
          margin: '8px 16px', padding: '10px 14px', borderRadius: 10,
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
          color: '#f87171', fontSize: '0.8rem',
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><AlertIcon size={14} /> {push.error}</span>
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
              className={`${styles.filterTab} ${filter === f.key ? styles.filterTabActive : ''} pressable`}
              onClick={() => setFilter(f.key)}
            >
              <span><f.Icon size={14} /></span>
              <span>{f.label}</span>
              {count > 0 && <span className={styles.filterCount}>{count}</span>}
            </button>
          )
        })}
      </div>

      {/* Notifications list */}
      <div className={styles.list}>
        {filtered.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyEmoji}><BellIcon size={40} strokeWidth={1} /></p>
            <p className={styles.emptyTitle}>
              {filter === 'all' ? 'No notifications yet' : `No ${filter} notifications`}
            </p>
            <p className={styles.emptyHint}>
              {filter === 'all'
                ? "Results, fees, and school announcements will appear here"
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
                {items.map(notif => {
                  const NotifIcon = TYPE_ICONS[notif.type] ?? BellIcon
                  return (
                  <button
                    key={notif.id}
                    className={`${styles.notifItem} ${!notif.is_read ? styles.unread : ''} pressable`}
                    onClick={() => handleClick(notif)}
                  >
                    <div className={`${styles.notifIcon} ${!notif.is_read ? styles.notifIconUnread : ''}`}>
                      <NotifIcon size={18} />
                    </div>
                    <div className={styles.notifContent}>
                      <p className={styles.notifTitle}>{notif.title}</p>
                      <p className={styles.notifBody}>{notif.body}</p>
                      <p className={styles.notifTime}>{formatTime(notif.created_at)}</p>
                    </div>
                    <div className={styles.notifRight}>
                      {!notif.is_read && <div className={styles.unreadDot} />}
                      <button
                        className={`${styles.deleteBtn} pressable`}
                        onClick={e => deleteNotif(notif.id, e)}
                        title="Delete"
                      ><XIcon size={14} /></button>
                    </div>
                  </button>
                  )
                })}
              </div>
            )
          })
        )}

        {filtered.length >= 50 && (
          <button className={`${styles.loadMoreBtn} pressable`} onClick={loadMore} disabled={loading}>
            {loading ? 'Loading…' : 'Load more notifications'}
          </button>
        )}

        {/* Space for bottom nav */}
        <div style={{ height: '90px' }} />
      </div>

      {/* Notification detail modal */}
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
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--card-bg, #1a1a1f)',
              border: '1px solid var(--border, rgba(255,255,255,0.1))',
              borderRadius: 16,
              maxWidth: 420,
              width: '100%',
              maxHeight: '80vh',
              overflowY: 'auto',
              padding: '20px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ display: 'inline-flex', color: schoolColor }}>
                  {(() => { const M = TYPE_ICONS[selected.type] ?? BellIcon; return <M size={22} /> })()}
                </span>
                <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>{selected.title}</h2>
              </div>
              <button className="pressable"
                onClick={closeModal}
                style={{
                  background: 'transparent', border: 'none', color: 'inherit',
                  fontSize: '1.1rem', cursor: 'pointer', opacity: 0.6, lineHeight: 1,
                  display: 'inline-flex', alignItems: 'center',
                }}
              ><XIcon size={18} /></button>
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

            {selected.link_url && (
              <button className="pressable"
                onClick={viewLinkedItem}
                style={{
                  marginTop: 12, width: '100%', padding: '10px 16px',
                  borderRadius: 10, border: 'none', cursor: 'pointer',
                  background: 'var(--burgundy, #800020)', color: '#fff',
                  fontWeight: 600, fontSize: '0.9rem',
                }}
              >
                View Details
              </button>
            )}
          </div>
        </div>
      )}
    </RoleSubHeader>
  )
}
