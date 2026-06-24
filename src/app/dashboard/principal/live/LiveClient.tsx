'use client'
// src/app/dashboard/principal/live/LiveClient.tsx
// Rebuilt against real `online_classes` schema:
//   is_live (boolean), ended_at (timestamp), meeting_url, scheduled_at, class_id, teacher_id
// Status is derived (not a stored column): is_live→live, ended_at→ended, else→scheduled
// teacher_name/subject/duration_mins/student_count do not exist — removed.

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { VideoIcon, ClockIcon, BarChartIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'

type Status = 'live' | 'scheduled' | 'ended'
type Tab    = 'live' | 'upcoming' | 'history'

interface Props { profile: any; school: any; userId: string }

function deriveStatus(s: any): Status {
  if (s.is_live)  return 'live'
  if (s.ended_at) return 'ended'
  return 'scheduled'
}

const STATUS_COLOR: Record<Status, string> = {
  live:      '#10B981',
  scheduled: '#F59E0B',
  ended:     '#6B7280',
}
const STATUS_LABEL: Record<Status, string> = {
  live:      '● LIVE',
  scheduled: 'Scheduled',
  ended:     'Ended',
}

export default function LiveClient({ profile, school, userId }: Props) {
  const [tab,     setTab]     = useState<Tab>('live')
  const [rows,    setRows]    = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [counts,  setCounts]  = useState({ live: 0, today: 0, total: 0 })
  const pollRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const supabase = createClient()
  const sc       = school?.primary_color ?? '#7C3AED'

  // ── fetch rows for active tab ────────────────────────────
  async function load(t: Tab = tab) {
    if (!school?.id) { setLoading(false); return }
    setLoading(true)

    const now        = new Date().toISOString()
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)

    // Fetch all classes for this school then filter client-side by derived status
    // (avoids querying a non-existent `status` column)
    const { data } = await supabase
      .from('online_classes')
      .select('id, title, description, meeting_url, recording_url, is_live, scheduled_at, started_at, ended_at, class_id, teacher_id')
      .eq('school_id', school.id)
      .order('scheduled_at', { ascending: t !== 'history' })
      .limit(60)

    if (data) {
      const filtered = data.filter(s => {
        const status = deriveStatus(s)
        if (t === 'live')     return status === 'live'
        if (t === 'upcoming') return status === 'scheduled'
        if (t === 'history')  return status === 'ended'
        return true
      })
      // history: most recent first
      if (t === 'history') filtered.reverse()
      setRows(filtered)
    }
    setLoading(false)
  }

  // ── summary counts ───────────────────────────────────────
  async function loadCounts() {
    if (!school?.id) return
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)

    const { data } = await supabase
      .from('online_classes')
      .select('id, is_live, ended_at, started_at')
      .eq('school_id', school.id)

    if (!data) return
    const liveCount  = data.filter(s =>  s.is_live).length
    const todayCount = data.filter(s =>  s.started_at && new Date(s.started_at) >= todayStart).length
    setCounts({ live: liveCount, today: todayCount, total: data.length })
  }

  // ── poll live tab every 30s ──────────────────────────────
  useEffect(() => {
    load(tab)
    loadCounts()
  }, [tab])

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current)
    if (tab === 'live') {
      pollRef.current = setInterval(() => { load('live'); loadCounts() }, 30_000)
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [tab])

  // ── helpers ──────────────────────────────────────────────
  function fmtTime(iso: string | null) {
    if (!iso) return '—'
    return new Date(iso).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })
  }
  function fmtDate(iso: string | null) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })
  }
  function elapsed(started: string) {
    const mins = Math.floor((Date.now() - new Date(started).getTime()) / 60_000)
    return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`
  }

  const TABS: { key: Tab; label: string; badge?: number }[] = [
    { key: 'live',     label: '🔴 Live Now',  badge: counts.live || undefined },
    { key: 'upcoming', label: '📅 Upcoming' },
    { key: 'history',  label: '✅ History'  },
  ]

  const stats = [
    { label: 'Active Now',    value: counts.live,  color: '#10B981', Icon: VideoIcon    },
    { label: 'Today',         value: counts.today, color: sc,        Icon: ClockIcon    },
    { label: 'All Sessions',  value: counts.total, color: '#F59E0B', Icon: BarChartIcon },
  ]

  return (
    <RolePageWrapper userId={userId} role="principal" profile={profile} school={school} title="Live Classes">

      {/* Stats row */}
      <div className={styles.statsRow} style={{ marginBottom: 'var(--space-5)' }}>
        {stats.map(s => (
          <div key={s.label} className={styles.statCard}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <s.Icon size={14} color={s.color} />
              <p className={styles.statLbl} style={{ margin: 0 }}>{s.label}</p>
            </div>
            <p className={styles.statVal} style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className={styles.tabs} style={{ marginBottom: 'var(--space-4)' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`${styles.tab} ${tab === t.key ? styles.tabActive : ''}`}
            style={tab === t.key ? { background: sc, color: '#fff', borderColor: sc } : {}}>
            {t.label}
            {t.badge ? (
              <span style={{
                marginLeft: 5, background: '#10B981', color: '#fff',
                borderRadius: 999, fontSize: '0.6rem', fontWeight: 800, padding: '1px 6px',
              }}>
                {t.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading
        ? <div className={styles.loading}><span /><span /><span /></div>
        : rows.length === 0
          ? (
            <div className={styles.empty}>
              <VideoIcon size={40} color="var(--text-faint)" strokeWidth={1} />
              <p>
                {tab === 'live'     ? 'No live sessions right now'  :
                 tab === 'upcoming' ? 'No sessions scheduled'       :
                                      'No past sessions yet'}
              </p>
            </div>
          )
          : (
            <div className={styles.list}>
              {rows.map((item: any) => {
                const status = deriveStatus(item)
                const color  = STATUS_COLOR[status]
                return (
                  <div key={item.id} className={styles.card}>

                    {/* Icon */}
                    <div className={styles.cardIcon} style={{ background: color + '20', flexShrink: 0 }}>
                      <VideoIcon size={16} color={color} />
                    </div>

                    {/* Body */}
                    <div className={styles.cardBody} style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2, flexWrap: 'wrap' }}>
                        <p className={styles.cardTitle} style={{ margin: 0 }}>{item.title}</p>
                        <span style={{
                          fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.04em',
                          background: color + '20', color, padding: '2px 8px', borderRadius: 999,
                        }}>
                          {STATUS_LABEL[status]}
                        </span>
                      </div>

                      {item.description && (
                        <p className={styles.cardText} style={{ margin: '2px 0' }}>{item.description}</p>
                      )}

                      {/* Live: show elapsed time */}
                      {status === 'live' && item.started_at && (
                        <span style={{ fontSize: '0.68rem', color: '#10B981', fontWeight: 700, marginTop: 4, display: 'block' }}>
                          ⏱ {elapsed(item.started_at)}
                        </span>
                      )}

                      {/* Ended: show when it ended */}
                      {status === 'ended' && item.ended_at && (
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 3, display: 'block' }}>
                          Ended {fmtDate(item.ended_at)} at {fmtTime(item.ended_at)}
                        </span>
                      )}

                      {/* Recording link if available */}
                      {status === 'ended' && item.recording_url && (
                        <a href={item.recording_url} target="_blank" rel="noreferrer"
                          style={{ fontSize: '0.72rem', color: sc, fontWeight: 700, marginTop: 4, display: 'inline-block', textDecoration: 'none' }}>
                          🎬 View Recording
                        </a>
                      )}
                    </div>

                    {/* Right: time */}
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', margin: 0 }}>
                        {tab === 'upcoming' ? 'Scheduled' : tab === 'live' ? 'Started' : 'Date'}
                      </p>
                      <p style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                        {fmtTime(item.started_at ?? item.scheduled_at)}
                      </p>
                      <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', margin: 0 }}>
                        {fmtDate(item.scheduled_at)}
                      </p>
                    </div>

                  </div>
                )
              })}
            </div>
          )
      }

      <div className={styles.spacer} />
    </RolePageWrapper>
  )
}
  
