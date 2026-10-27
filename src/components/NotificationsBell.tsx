'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeNotifications } from '@/hooks/useRealtimeNotifications'
import { BellIcon, CheckCircleIcon } from './Icons'
import styles from './NotificationsBell.module.css'

interface NotificationItem {
  id:          string
  title:       string
  body:        string
  type:        string
  is_read:     boolean
  created_at:  string
  action_url?: string | null
  link_url?:   string | null
}

interface Props {
  userId: string
  role?:  string
}

const PAGE_SIZE = 20

// Theme tokens instead of hardcoded hex, so the dots follow light/dark mode
// and the school's brand instead of a leftover violet.
const TYPE_COLORS: Record<string, string> = {
  announcement: 'var(--info)',
  assignment:   'var(--warning)',
  result:       'var(--success)',
  quiz:         'var(--brand-light)',
  chat:         'var(--brand-light)',
  payment:      'var(--danger)',
  system:       'var(--text-muted)',
  default:      'var(--brand)',
}

// Notification links come from the database, and rows can be created by
// client code. Only follow in-app absolute paths so a bad or malicious
// action_url/link_url can never send someone to an outside site.
function safeInternalHref(href: string | null | undefined): string | null {
  if (typeof href !== 'string') return null
  if (!href.startsWith('/') || href.startsWith('//') || href.includes('\\')) return null
  return href
}

// Both columns exist and different call sites fill different ones, so a
// notification with only link_url used to be a dead tap. Check both.
function resolveTarget(n: NotificationItem): string | null {
  return safeInternalHref(n.action_url) ?? safeInternalHref(n.link_url)
}

function dayLabel(iso: string): string {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const t = new Date(iso).getTime()
  if (t >= startOfToday) return 'Today'
  if (t >= startOfToday - 86400000) return 'Yesterday'
  return 'Earlier'
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

export default function NotificationsBell({ userId, role = 'student' }: Props) {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  // The badge number comes from the server, not from counting the 20 loaded
  // rows, so a user with 57 unread sees 57 and not a number capped at 20.
  const [unreadCount, setUnreadCount] = useState(0)
  const [open,        setOpen]        = useState(false)
  // Only true for the very first load, so later refetches never flash the
  // loading dots over a list the person is reading.
  const [loading,     setLoading]     = useState(true)
  const [loadError,   setLoadError]   = useState(false)
  // Track button position so the fixed panel renders in the right spot
  const [panelPos,    setPanelPos]    = useState({ top: 0, right: 0 })
  const panelRef = useRef<HTMLDivElement>(null)
  const btnRef   = useRef<HTMLButtonElement>(null)
  const notificationsRef = useRef<NotificationItem[]>([])
  notificationsRef.current = notifications

  const loadNotifications = useCallback(async () => {
    const [listRes, countRes] = await Promise.all([
      supabase
        .from('notifications')
        .select('id, title, body, type, is_read, created_at, action_url, link_url')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE),
      supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_read', false),
    ])

    if (listRes.error || !listRes.data) {
      setLoadError(true)
    } else {
      setNotifications(listRes.data as NotificationItem[])
      setLoadError(false)
    }
    if (!countRes.error && typeof countRes.count === 'number') {
      setUnreadCount(countRes.count)
    }
    setLoading(false)
  }, [supabase, userId])

  const refreshUnreadCount = useCallback(async () => {
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false)
    if (!error && typeof count === 'number') setUnreadCount(count)
  }, [supabase, userId])

  // Load notifications
  useEffect(() => {
    setLoading(true)
    loadNotifications()
  }, [loadNotifications])

  // Real-time. New rows are added straight to the top of the list (no
  // refetch, no flicker). Row updates keep read state in sync across
  // devices and tabs. A dropped connection that reconnects refetches, so
  // nothing sent while offline is silently missed.
  useRealtimeNotifications({
    userId,
    onInsert: (row) => {
      if (!row || notificationsRef.current.some(n => n.id === row.id)) return
      setNotifications(prev => [row as NotificationItem, ...prev].slice(0, PAGE_SIZE))
      if (!row.is_read) setUnreadCount(c => c + 1)
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
    onReconnect: () => loadNotifications(),
  })

  // Close the panel on outside press or Escape (and hand focus back to the bell)
  useEffect(() => {
    if (!open) return
    function handlePress(e: PointerEvent) {
      if (
        panelRef.current &&
        btnRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
        btnRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', handlePress)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('pointerdown', handlePress)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  function resetDigestBackoff() {
    // They've caught up, so reset the unread-digest backoff. A future quiet
    // period then starts the nudge schedule fresh rather than picking up at
    // whatever stage they'd reached before.
    supabase.rpc('clear_unread_digest_state').then(() => {}, () => {})
  }

  async function markAllRead() {
    if (unreadCount === 0) return
    const previousList  = notificationsRef.current
    const previousCount = unreadCount

    // Optimistic: the UI changes instantly and rolls back if the server says no.
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    setUnreadCount(0)

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false)

    if (error) {
      setNotifications(previousList)
      setUnreadCount(previousCount)
      return
    }
    resetDigestBackoff()
  }

  async function markOneRead(n: NotificationItem) {
    if (n.is_read) return
    const wasLastUnread = unreadCount <= 1

    setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x))
    setUnreadCount(c => Math.max(0, c - 1))

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', n.id)
      .eq('user_id', userId)

    if (error) {
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, is_read: false } : x))
      setUnreadCount(c => c + 1)
      return
    }
    if (wasLastUnread) resetDigestBackoff()
  }

  function handleItemClick(n: NotificationItem) {
    const target = resolveTarget(n)
    markOneRead(n)
    if (target) {
      setOpen(false)
      router.push(target)
    }
  }

  function togglePanel() {
    if (open) {
      setOpen(false)
      return
    }
    // Calculate viewport position so the fixed panel appears below the button,
    // clamped so it can never overflow the left or right edge of the screen.
    // (Aligning strictly to the button's right edge breaks when the bell isn't
    // the rightmost icon in its header, e.g. the main dashboard hero header,
    // since the 340px panel then spills off the left side of the viewport.)
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      const panelWidth = 340
      const margin = 8
      let right = window.innerWidth - rect.right
      const maxRight = window.innerWidth - panelWidth - margin
      if (right > maxRight) right = maxRight
      if (right < margin) right = margin
      setPanelPos({ top: rect.bottom + 10, right })
    }
    setOpen(true)
  }

  let previousGroup = ''

  return (
    <div className={styles.wrapper}>
      {/* Bell button */}
      <button
        ref={btnRef}
        className={styles.bellBtn}
        onClick={togglePanel}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <BellIcon size={18} />
        {unreadCount > 0 && (
          <span className={`${styles.badge} tabular-nums`}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Panel: position:fixed to escape the sticky header's backdrop-filter
           stacking context. backdrop-filter creates a new stacking context that traps
           any absolutely-positioned children regardless of their z-index.
           Fixed positioning breaks out of it and renders at viewport level. */}
      {open && (
        <div
          ref={panelRef}
          className={styles.panel}
          style={{ top: panelPos.top, right: panelPos.right }}
          role="dialog"
          aria-label="Notifications"
        >
          {/* Header */}
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.panelTitle}>Notifications</p>
              {unreadCount > 0 && (
                <p className={`${styles.panelSub} tabular-nums`}>{unreadCount} unread</p>
              )}
            </div>
            {unreadCount > 0 && (
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
            ) : loadError && notifications.length === 0 ? (
              <div className={styles.empty}>
                <BellIcon size={28} color="var(--text-faint)" />
                <p>Couldn&apos;t load notifications</p>
                <button className={styles.markAllBtn} onClick={() => { setLoading(true); loadNotifications() }}>
                  Try again
                </button>
              </div>
            ) : notifications.length === 0 ? (
              <div className={styles.empty}>
                <BellIcon size={28} color="var(--text-faint)" />
                <p>No notifications yet</p>
              </div>
            ) : (
              notifications.map(n => {
                const group = dayLabel(n.created_at)
                const showGroup = group !== previousGroup
                previousGroup = group
                return (
                  <div key={n.id}>
                    {showGroup && (
                      <p className="section-label" style={{ margin: 0, padding: '10px 14px 4px' }}>
                        {group}
                      </p>
                    )}
                    <button
                      className={`${styles.notifItem} ${!n.is_read ? styles.notifUnread : ''}`}
                      onClick={() => handleItemClick(n)}
                    >
                      {/* Type indicator */}
                      <div
                        className={styles.typeDot}
                        style={{ background: TYPE_COLORS[n.type] ?? TYPE_COLORS.default }}
                        aria-hidden="true"
                      />
                      <div className={styles.notifContent}>
                        <p className={styles.notifTitle}>
                          {!n.is_read && <span className="sr-only">Unread. </span>}
                          {n.title}
                        </p>
                        <p className={styles.notifBody}>{n.body}</p>
                        <p className={styles.notifTime}>{formatTime(n.created_at)}</p>
                      </div>
                      {!n.is_read && <div className={styles.unreadDot} aria-hidden="true" />}
                    </button>
                  </div>
                )
              })
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className={styles.panelFooter}>
              <Link
                href={`/dashboard/${role}/notifications`}
                className={styles.viewAll}
                onClick={() => setOpen(false)}
              >
                View all notifications &rarr;
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
