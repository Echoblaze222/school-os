'use client'
// src/app/dashboard/student/live/LiveClient.tsx
// Rebuilt from teacher's working LiveClient.
// Queries: online_classes filtered by school_id + class_id (from student profile).
// No teacher-specific logic (no form, no start/end/delete).
// Tab order: live → scheduled → ended.

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { VideoIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'

interface Props { profile: any; school: any; userId: string }

type Tab = 'scheduled' | 'live' | 'ended'

function deriveStatus(s: any): Tab {
  if (s.is_live) return 'live'
  if (s.ended_at) return 'ended'
  return 'scheduled'
}

const STATUS_COLOR: Record<Tab, string> = {
  live:      '#10B981',
  scheduled: '#F59E0B',
  ended:     '#6B7280',
}

const STATUS_LABEL: Record<Tab, string> = {
  live:      '🔴 LIVE',
  scheduled: 'Upcoming',
  ended:     'Ended',
}

export default function LiveClient({ profile, school, userId }: Props) {
  const [sessions, setSessions] = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [tab,      setTab]      = useState<Tab>('scheduled')

  const supabase = createClient()
  const sc       = school?.primary_color ?? '#7C3AED'

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError(null)

    // Guard: student must be assigned to a class
    if (!profile?.class_id) {
      setError('You have not been assigned to a class yet. Please contact your school administrator.')
      setLoading(false)
      return
    }

    // Same table + same columns the teacher writes to
    const { data, error: err } = await supabase
      .from('online_classes')
      .select('id, title, description, meeting_url, recording_url, is_live, scheduled_at, ended_at, class_id, teacher_id')
      .eq('school_id', school?.id)
      .eq('class_id', profile.class_id)
      .order('scheduled_at', { ascending: false })
      .limit(50)

    if (err) {
      console.error('[student live] load error:', err.message)
      setError(err.message)
    }
    if (data) setSessions(data)
    setLoading(false)
  }

  const visibleSessions = sessions.filter(s => deriveStatus(s) === tab)

  // Count per tab for badge
  const counts: Record<Tab, number> = { live: 0, scheduled: 0, ended: 0 }
  sessions.forEach(s => { counts[deriveStatus(s)]++ })

  return (
    <RolePageWrapper userId={userId} role="student" profile={profile} school={school} title="Live Classes">

      {/* Tabs */}
      <div className={styles.tabs} style={{ marginBottom: 'var(--space-4)' }}>
        {(['live', 'scheduled', 'ended'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`}
            style={tab === t ? { background: STATUS_COLOR[t], color: '#fff', borderColor: STATUS_COLOR[t] } : {}}>
            {t === 'live' ? '🔴 Live' : t === 'scheduled' ? '📅 Upcoming' : '✅ Ended'}
            {counts[t] > 0 && (
              <span style={{
                marginLeft: 5, padding: '1px 6px', borderRadius: 999,
                fontSize: '0.65rem', fontWeight: 800,
                background: tab === t ? 'rgba(255,255,255,0.25)' : STATUS_COLOR[t] + '20',
                color: tab === t ? '#fff' : STATUS_COLOR[t],
              }}>
                {counts[t]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Error banner */}
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#EF444415', border: '1px solid #EF444440', borderRadius: 10, marginBottom: 'var(--space-4)' }}>
          <span style={{ fontSize: '0.8rem', color: '#EF4444', flex: 1 }}>⚠️ {error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 800 }}>✕</button>
        </div>
      )}

      {/* Session list */}
      {loading
        ? <div className={styles.loading}><span /><span /><span /></div>
        : visibleSessions.length === 0
          ? (
            <div className={styles.empty}>
              <VideoIcon size={40} color="var(--text-faint)" strokeWidth={1} />
              <p>
                {tab === 'live'      ? 'No class is live right now'  :
                 tab === 'scheduled' ? 'No upcoming classes scheduled' :
                                       'No ended classes yet'}
              </p>
            </div>
          )
          : (
            <div className={styles.list}>
              {visibleSessions.map(s => {
                const status = deriveStatus(s)
                return (
                  <div key={s.id} className={styles.card}
                    style={{ flexDirection: 'column', alignItems: 'stretch', cursor: 'default' }}>

                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-4)' }}>
                      <div className={styles.cardIcon}
                        style={{ background: STATUS_COLOR[status] + '20', flexShrink: 0 }}>
                        <VideoIcon size={16} color={STATUS_COLOR[status]} />
                      </div>

                      <div className={styles.cardBody} style={{ flex: 1, minWidth: 0 }}>
                        <p className={styles.cardTitle}>{s.title}</p>
                        {s.description && (
                          <p className={styles.cardText} style={{ margin: '2px 0 0' }}>
                            {s.description}
                          </p>
                        )}
                        {s.scheduled_at && (
                          <p className={styles.cardMeta} style={{ margin: '4px 0 0' }}>
                            {new Date(s.scheduled_at).toLocaleString('en-NG', {
                              day: 'numeric', month: 'short',
                              hour: '2-digit', minute: '2-digit',
                            })}
                          </p>
                        )}
                      </div>

                      <span style={{
                        padding: '3px 10px', borderRadius: 999,
                        fontSize: '0.68rem', fontWeight: 700, flexShrink: 0,
                        background: STATUS_COLOR[status] + '20',
                        color: STATUS_COLOR[status],
                      }}>
                        {STATUS_LABEL[status]}
                      </span>
                    </div>

                    {/* Join button — only when live and URL exists */}
                    {status === 'live' && s.meeting_url && (
                      <a href={s.meeting_url} target="_blank" rel="noreferrer"
                        style={{
                          marginTop: 12, marginLeft: 52,
                          display: 'inline-flex', alignSelf: 'flex-start',
                          alignItems: 'center', gap: 6,
                          padding: '8px 18px', background: '#10B981',
                          color: '#fff', borderRadius: 999,
                          fontWeight: 700, fontSize: '0.82rem', textDecoration: 'none',
                        }}>
                        🔴 Join Now
                      </a>
                    )}

                    {/* Recording button — only when ended and URL exists */}
                    {status === 'ended' && s.recording_url && (
                      <a href={s.recording_url} target="_blank" rel="noreferrer"
                        style={{
                          marginTop: 12, marginLeft: 52,
                          display: 'inline-flex', alignSelf: 'flex-start',
                          alignItems: 'center', gap: 6,
                          padding: '8px 18px',
                          background: 'var(--glass-bg)',
                          border: '1px solid var(--glass-border)',
                          color: 'var(--text-secondary)', borderRadius: 999,
                          fontWeight: 700, fontSize: '0.82rem', textDecoration: 'none',
                        }}>
                        🎬 Watch Recording
                      </a>
                    )}

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
              
