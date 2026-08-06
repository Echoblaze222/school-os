'use client'
// src/app/dashboard/student/live/LiveClient.tsx
//
// REDESIGN PASS (Lane 3 — Student): emoji → Icons, hardcoded status hex →
// design tokens, glass-card/motion treatment. Chrome was already on
// RolePageWrapper, so no chrome change needed here.

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import ReminderButton from '@/components/ReminderButton'
import { VideoIcon, StatusDotIcon, CalendarIcon, CheckCircleIcon, AlertIcon, XIcon } from '@/components/Icons'
import motion from '@/components/dashboard-motion.module.css'
import styles from '@/app/dashboard/student/records/page.module.css'

interface Props { profile: any; school: any; userId: string }

type Tab = 'scheduled' | 'live' | 'ended'

function deriveStatus(s: any): Tab {
  if (s.is_live) return 'live'
  if (s.ended_at) return 'ended'
  return 'scheduled'
}

const STATUS_COLOR: Record<Tab, string> = {
  live:      'var(--success)',
  scheduled: 'var(--warning)',
  ended:     'var(--text-muted)',
}
const STATUS_BG: Record<Tab, string> = {
  live:      'var(--success-subtle)',
  scheduled: 'var(--warning-subtle)',
  ended:     'var(--glass-bg)',
}

export default function LiveClient({ profile, school, userId }: Props) {
  const [sessions, setSessions] = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [tab,      setTab]      = useState<Tab>('scheduled')

  const supabase = createClient()
  const sc       = school?.primary_color ?? '#800020'

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError(null)

    if (!profile?.class_id) {
      setError('You have not been assigned to a class yet. Please contact your school administrator.')
      setLoading(false)
      return
    }

    const { data, error: err } = await supabase
      .from('online_classes')
      .select('id, title, description, meeting_url, recording_url, is_live, scheduled_at, ended_at, class_id, teacher_id')
      .eq('school_id', school?.id)
      .eq('class_id', profile.class_id)
      .order('scheduled_at', { ascending: false })
      .limit(50)

    if (err) { setError(err.message) }
    if (data) setSessions(data)
    setLoading(false)
  }

  const visibleSessions = sessions.filter(s => deriveStatus(s) === tab)

  const counts: Record<Tab, number> = { live: 0, scheduled: 0, ended: 0 }
  sessions.forEach(s => { counts[deriveStatus(s)]++ })

  return (
    <RolePageWrapper userId={userId} role="student" profile={profile} school={school} title="Live Classes">

      <div className={`${styles.tabs} ${motion.riseIn}`} style={{ marginBottom: 'var(--space-4)' }}>
        {(['live', 'scheduled', 'ended'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`${styles.tab} ${tab === t ? styles.tabActive : ''} ${motion.pressable}`}
            style={tab === t ? { background: STATUS_COLOR[t], color: '#fff', borderColor: STATUS_COLOR[t] } : {}}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              {t === 'live' ? <><span style={{ width: 8, height: 8, borderRadius: 999, background: tab === t ? '#fff' : 'var(--success)', display: 'inline-block' }} className={motion.pulseDot} /> Live</>
                : t === 'scheduled' ? <><CalendarIcon size={13} /> Upcoming</>
                : <><CheckCircleIcon size={13} /> Ended</>}
            </span>
            {counts[t] > 0 && (
              <span style={{
                marginLeft: 5, padding: '1px 6px', borderRadius: 999,
                fontSize: '0.65rem', fontWeight: 800,
                background: tab === t ? 'rgba(255,255,255,0.25)' : STATUS_BG[t],
                color: tab === t ? '#fff' : STATUS_COLOR[t],
              }}>
                {counts[t]}
              </span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <div className={`glass-card ${motion.riseIn}`} style={{ display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px', background: 'var(--danger-subtle)', borderColor: 'rgba(239,68,68,0.3)', marginBottom: 'var(--space-4)' }}>
          <AlertIcon size={16} color="var(--danger)" />
          <span style={{ fontSize: '0.8rem', color: 'var(--danger)', flex: 1 }}>{error}</span>
          <button onClick={() => setError(null)} className={motion.pressable}
            style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', display: 'flex', padding: 4 }}>
            <XIcon size={14} />
          </button>
        </div>
      )}

      {loading
        ? <div className={styles.loading}><span /><span /><span /></div>
        : visibleSessions.length === 0
          ? (
            <div className={`${styles.empty} ${motion.riseIn}`}>
              <VideoIcon size={40} color="var(--text-faint)" strokeWidth={1} />
              <p>
                {tab === 'live'      ? 'No class is live right now'    :
                 tab === 'scheduled' ? 'No upcoming classes scheduled' :
                                       'No ended classes yet'}
              </p>
            </div>
          )
          : (
            <div className={styles.list}>
              {visibleSessions.map((s, i) => {
                const status   = deriveStatus(s)
                const isFuture = s.scheduled_at && new Date(s.scheduled_at) > new Date()
                return (
                  <div key={s.id} className={`glass-card ${styles.card} ${motion.staggerItem}`}
                    style={{ flexDirection: 'column', alignItems: 'stretch', cursor: 'default', animationDelay: `${i * 40}ms` }}>

                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-4)' }}>
                      <div className={styles.cardIcon} style={{ background: STATUS_BG[status], flexShrink: 0 }}>
                        <VideoIcon size={16} color={STATUS_COLOR[status]} />
                      </div>
                      <div className={styles.cardBody} style={{ flex: 1, minWidth: 0 }}>
                        <p className={styles.cardTitle}>{s.title}</p>
                        {s.description && <p className={styles.cardText} style={{ margin: '2px 0 0' }}>{s.description}</p>}
                        {s.scheduled_at && (
                          <p className={styles.cardMeta} style={{ margin: '4px 0 0' }}>
                            {new Date(s.scheduled_at).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        )}
                      </div>
                      <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: '0.68rem', fontWeight: 700, flexShrink: 0,
                        background: STATUS_BG[status], color: STATUS_COLOR[status], display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {status === 'live' && <StatusDotIcon size={8} color="var(--success)" />}
                        {status === 'live' ? 'LIVE' : status === 'scheduled' ? 'Upcoming' : 'Ended'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: 8, marginTop: 10, marginLeft: 52, flexWrap: 'wrap', alignItems: 'center' }}>
                      {status === 'live' && s.meeting_url && (
                        <a href={s.meeting_url} target="_blank" rel="noreferrer" className={motion.pressable}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 16px',
                            background: 'var(--success)', color: '#fff', borderRadius: 999, fontWeight: 700, fontSize: '0.78rem', textDecoration: 'none' }}>
                          <StatusDotIcon size={8} color="#fff" /> Join Now
                        </a>
                      )}
                      {status === 'ended' && s.recording_url && (
                        <a href={s.recording_url} target="_blank" rel="noreferrer" className={motion.pressable}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 16px',
                            background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)',
                            borderRadius: 999, fontWeight: 700, fontSize: '0.78rem', textDecoration: 'none' }}>
                          <VideoIcon size={14} /> Watch Recording
                        </a>
                      )}
                      {(status === 'scheduled' || status === 'live') && isFuture && s.scheduled_at && (
                        <ReminderButton
                          sourceType="live_class"
                          sourceId={s.id}
                          eventTime={s.scheduled_at}
                          title={s.title}
                          body="Your live class starts in {n} minutes"
                          url="/dashboard/student/live"
                          color={sc}
                        />
                      )}
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
