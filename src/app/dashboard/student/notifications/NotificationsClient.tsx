'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import DashboardHeader from '@/components/DashboardHeader'
import StudentNav from '@/components/StudentNav'
import { BellIcon, CheckCircleIcon } from '@/components/Icons'
import styles from './page.module.css'

interface Props { profile: any; school: any; userId: string }

const TYPE_CONFIG: Record<string, { color: string; emoji: string }> = {
  announcement: { color: '#3B82F6', emoji: '📢' },
  assignment:   { color: '#F59E0B', emoji: '📋' },
  result:       { color: '#10B981', emoji: '📊' },
  quiz:         { color: '#8B5CF6', emoji: '🏆' },
  chat:         { color: '#7C3AED', emoji: '💬' },
  payment:      { color: '#EF4444', emoji: '💰' },
  system:       { color: '#6B7280', emoji: '⚙️' },
}

export default function NotificationsClient({ profile, school, userId }: Props) {
  const [items,     setItems]     = useState<any[]>([])
  const [loading,   setLoading]   = useState(true)
  const [filter,    setFilter]    = useState<'all'|'unread'>('all')
  const supabase    = createClient()
  const schoolColor = school?.primary_color ?? '#7C3AED'

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase
      .from('notifications')
      .select('id, title, body, type, is_read, created_at, action_url')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50)
    if (data) setItems(data)
    setLoading(false)
  }

  async function markAllRead() {
    await supabase.from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId).eq('is_read', false)
    setItems(prev => prev.map(n => ({ ...n, is_read: true })))
  }

  async function markRead(id: string) {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id)
    setItems(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
  }

  async function deleteOne(id: string) {
    await supabase.from('notifications').delete().eq('id', id)
    setItems(prev => prev.filter(n => n.id !== id))
  }

  const displayed  = filter === 'unread' ? items.filter(n => !n.is_read) : items
  const unreadCount = items.filter(n => !n.is_read).length

  function timeAgo(d: string) {
    const diff = Date.now() - new Date(d).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1)   return 'Just now'
    if (mins < 60)  return `${mins}m ago`
    if (mins < 1440)return `${Math.floor(mins/60)}h ago`
    return `${Math.floor(mins/1440)}d ago`
  }

  return (
    <div className={styles.page}>
      <StudentNav userId={userId} profile={profile} school={school} schoolColor={schoolColor} />
      <div className={styles.content}>
        <DashboardHeader userId={userId} role="student" profile={profile} school={school}
          schoolColor={schoolColor} title="Notifications" showBack />
        <main className={styles.main}>

          {/* Toolbar */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'var(--space-4)', gap:'var(--space-3)', flexWrap:'wrap' }}>
            <div style={{ display:'flex', gap:'var(--space-2)' }}>
              {(['all','unread'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  style={{ padding:'6px 14px', borderRadius:999, fontSize:'0.75rem', fontWeight:700,
                    background: filter===f ? schoolColor : 'var(--glass-bg)',
                    color: filter===f ? '#fff' : 'var(--text-muted)',
                    border: `1px solid ${filter===f ? schoolColor : 'var(--glass-border)'}`, cursor:'pointer' }}>
                  {f === 'all' ? `All (${items.length})` : `Unread (${unreadCount})`}
                </button>
              ))}
            </div>
            {unreadCount > 0 && (
              <button onClick={markAllRead}
                style={{ display:'flex', alignItems:'center', gap:5, padding:'6px 12px', background:'var(--brand-subtle)', border:'1px solid var(--brand-border)', borderRadius:999, color:'var(--brand-light)', fontSize:'0.72rem', fontWeight:700, cursor:'pointer' }}>
                <CheckCircleIcon size={13}/> Mark all read
              </button>
            )}
          </div>

          {loading ? <div className={styles.loading}><span/><span/><span/></div>
          : displayed.length === 0
            ? <div className={styles.empty}>
                <BellIcon size={40} color="var(--text-faint)" strokeWidth={1}/>
                <p>{filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}</p>
              </div>
            : <div className={styles.list}>
                {displayed.map(n => {
                  const cfg = TYPE_CONFIG[n.type] ?? TYPE_CONFIG.system
                  return (
                    <div key={n.id}
                      className={`${styles.card} ${!n.is_read ? styles.cardUnread : ''}`}
                      style={!n.is_read ? { borderLeftColor: cfg.color, borderLeftWidth: 3 } : {}}
                      onClick={() => { markRead(n.id); if (n.action_url) window.location.href = n.action_url }}>
                      <div className={styles.cardIcon} style={{ background: cfg.color + '18', fontSize:'1.1rem' }}>
                        {cfg.emoji}
                      </div>
                      <div className={styles.cardBody}>
                        <div style={{ display:'flex', justifyContent:'space-between', gap:'var(--space-2)' }}>
                          <p className={styles.cardTitle}>{n.title}</p>
                          <span style={{ fontSize:'0.62rem', color:'var(--text-muted)', whiteSpace:'nowrap', flexShrink:0 }}>
                            {timeAgo(n.created_at)}
                          </span>
                        </div>
                        <p className={styles.cardText}>{n.body}</p>
                      </div>
                      {!n.is_read && (
                        <div style={{ width:8, height:8, borderRadius:'50%', background: cfg.color, flexShrink:0, marginTop:4 }}/>
                      )}
                    </div>
                  )
                })}
              </div>
          }
          <div className={styles.spacer}/>
        </main>
      </div>
    </div>
  )
}
