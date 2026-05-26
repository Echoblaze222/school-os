'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { VideoIcon, PeopleIcon, ClockIcon, BarChartIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'

type Tab = 'live' | 'upcoming' | 'history'
interface Props { profile: any; school: any; userId: string }

export default function LiveClient({ profile, school, userId }: Props) {
  const [tab,     setTab]     = useState<Tab>('live')
  const [rows,    setRows]    = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [counts,  setCounts]  = useState({ live: 0, today: 0, total: 0 })
  const pollRef   = useRef<ReturnType<typeof setInterval> | null>(null)
  const supabase  = createClient()
  const sc        = school?.primary_color ?? '#7C3AED'

  // ── load rows for the active tab ──────────────────────────
  async function load(t: Tab = tab) {
    if (!school?.id) { setLoading(false); return }
    setLoading(true)

    const now   = new Date().toISOString()
    const todayStart = new Date(); todayStart.setHours(0,0,0,0)

    let query = supabase
      .from('live_classes')
      .select('id, title, subject, class_level, teacher_name, status, scheduled_at, started_at, ended_at, duration_mins, student_count')
      .eq('school_id', school.id)

    if (t === 'live')     query = query.eq('status', 'live').order('started_at', { ascending: false })
    if (t === 'upcoming') query = query.eq('status', 'scheduled').gte('scheduled_at', now).order('scheduled_at')
    if (t === 'history')  query = query.eq('status', 'ended').order('ended_at', { ascending: false }).limit(40)

    const { data } = await query
    if (data) setRows(data)
    setLoading(false)
  }

  // ── load summary counts (for stats row) ──────────────────
  async function loadCounts() {
    if (!school?.id) return
    const todayStart = new Date(); todayStart.setHours(0,0,0,0)
    const [liveRes, todayRes, totalRes] = await Promise.all([
      supabase.from('live_classes').select('id', { count: 'exact', head: true })
        .eq('school_id', school.id).eq('status', 'live'),
      supabase.from('live_classes').select('id', { count: 'exact', head: true })
        .eq('school_id', school.id).gte('started_at', todayStart.toISOString()),
      supabase.from('live_classes').select('id', { count: 'exact', head: true })
        .eq('school_id', school.id),
    ])
    setCounts({
      live:  liveRes.count  ?? 0,
      today: todayRes.count ?? 0,
      total: totalRes.count ?? 0,
    })
  }

  // ── initial load + poll the live tab every 30 s ──────────
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

  // ── helpers ───────────────────────────────────────────────
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
    return mins < 60 ? `${mins}m` : `${Math.floor(mins/60)}h ${mins%60}m`
  }

  // ── status pill ───────────────────────────────────────────
  function StatusPill({ status }: { status: string }) {
    const map: Record<string, { bg: string; color: string; label: string }> = {
      live:      { bg: '#10B98120', color: '#10B981', label: '● LIVE' },
      scheduled: { bg: sc+'20',    color: sc,        label: 'Scheduled' },
      ended:     { bg: '#6B728020',color: '#9CA3AF', label: 'Ended' },
    }
    const s = map[status] ?? map.ended
    return (
      <span style={{ fontSize:'0.65rem', fontWeight:800, letterSpacing:'0.04em',
        background: s.bg, color: s.color, padding:'2px 8px', borderRadius:999 }}>
        {s.label}
      </span>
    )
  }

  // ── tab config ────────────────────────────────────────────
  const TABS: { key: Tab; label: string; badge?: number }[] = [
    { key: 'live',     label: 'Live Now',  badge: counts.live || undefined },
    { key: 'upcoming', label: 'Upcoming'  },
    { key: 'history',  label: 'History'   },
  ]

  const stats = [
    { label: 'Active Now',   value: counts.live,  color: '#10B981', Icon: VideoIcon   },
    { label: 'Today',        value: counts.today, color: sc,        Icon: ClockIcon   },
    { label: 'All Sessions', value: counts.total, color: '#F59E0B', Icon: BarChartIcon },
  ]

  return (
    <RolePageWrapper userId={userId} role="principal" profile={profile} school={school} title="Live Classes">

      {/* Stats row */}
      <div className={styles.statsRow} style={{ marginBottom:'var(--space-5)' }}>
        {stats.map(s => (
          <div key={s.label} className={styles.statCard}>
            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
              <s.Icon size={14} color={s.color}/>
              <p className={styles.statLbl} style={{ margin:0 }}>{s.label}</p>
            </div>
            <p className={styles.statVal} style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className={styles.tabs} style={{ marginBottom:'var(--space-4)' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`${styles.tab} ${tab === t.key ? styles.tabActive : ''}`}
            style={tab === t.key ? { background: sc, color:'#fff', borderColor: sc } : {}}>
            {t.label}
            {t.badge ? (
              <span style={{ marginLeft:5, background:'#10B981', color:'#fff',
                borderRadius:999, fontSize:'0.6rem', fontWeight:800, padding:'1px 6px' }}>
                {t.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading
        ? <div className={styles.loading}><span/><span/><span/></div>
        : rows.length === 0
          ? <div className={styles.empty}>
              <VideoIcon size={40} color="var(--text-faint)" strokeWidth={1}/>
              <p>
                {tab === 'live'     && 'No live sessions right now'}
                {tab === 'upcoming' && 'No sessions scheduled'}
                {tab === 'history'  && 'No past sessions yet'}
              </p>
            </div>
          : <div className={styles.list}>
              {rows.map((item: any) => (
                <div key={item.id} className={styles.card}>

                  {/* Icon */}
                  <div className={styles.cardIcon}
                    style={{ background: item.status === 'live' ? '#10B98120' : sc+'20' }}>
                    <VideoIcon size={16} color={item.status === 'live' ? '#10B981' : sc}/>
                  </div>

                  {/* Body */}
                  <div className={styles.cardBody}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:2 }}>
                      <p className={styles.cardTitle} style={{ margin:0 }}>{item.title}</p>
                      <StatusPill status={item.status}/>
                    </div>

                    <p className={styles.cardMeta} style={{ margin:'2px 0' }}>
                      {[item.subject, item.class_level].filter(Boolean).join(' · ')}
                      {item.teacher_name ? ` — ${item.teacher_name}` : ''}
                    </p>

                    {/* Live: show elapsed + student count */}
                    {item.status === 'live' && item.started_at && (
                      <div style={{ display:'flex', gap:12, marginTop:4 }}>
                        <span style={{ fontSize:'0.68rem', color:'#10B981', fontWeight:700 }}>
                          ⏱ {elapsed(item.started_at)}
                        </span>
                        {item.student_count > 0 && (
                          <span style={{ fontSize:'0.68rem', color:'var(--text-muted)', display:'flex', alignItems:'center', gap:3 }}>
                            <PeopleIcon size={11} color="var(--text-muted)"/> {item.student_count} joined
                          </span>
                        )}
                      </div>
                    )}

                    {/* History: show duration */}
                    {item.status === 'ended' && (
                      <span style={{ fontSize:'0.68rem', color:'var(--text-muted)', marginTop:3, display:'block' }}>
                        {item.duration_mins ? `${item.duration_mins} min session` : ''}
                        {item.ended_at ? ` · Ended ${fmtDate(item.ended_at)} ${fmtTime(item.ended_at)}` : ''}
                      </span>
                    )}
                  </div>

                  {/* Right: time */}
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    <p style={{ fontSize:'0.68rem', color:'var(--text-muted)', margin:0 }}>
                      {tab === 'upcoming' ? 'Scheduled' : tab === 'live' ? 'Started' : 'Date'}
                    </p>
                    <p style={{ fontSize:'0.78rem', fontWeight:700, color:'var(--text-primary)', margin:0 }}>
                      {tab === 'upcoming' ? fmtTime(item.scheduled_at) : fmtTime(item.started_at ?? item.scheduled_at)}
                    </p>
                    <p style={{ fontSize:'0.68rem', color:'var(--text-muted)', margin:0 }}>
                      {fmtDate(item.scheduled_at)}
                    </p>
                  </div>

                </div>
              ))}
            </div>
      }

      <div className={styles.spacer}/>
    </RolePageWrapper>
  )
}
