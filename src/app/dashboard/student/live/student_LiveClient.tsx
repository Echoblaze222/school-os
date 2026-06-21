'use client'
// src/app/dashboard/student/live/LiveClient.tsx
// Reads real `online_classes` columns: is_live (boolean), meeting_url, ended_at.
// FIX (this round): added visible error banner — previously a failed query
// failed silently into an empty list, indistinguishable from "no classes yet".

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import DashboardHeader from '@/components/DashboardHeader'
import StudentNav from '@/components/StudentNav'
import { VideoIcon } from '@/components/Icons'
import styles from '../syllabus/page.module.css' // shared dashboard list/card styles

interface Props { profile: any; school: any; userId: string }

function deriveStatus(s: any): 'scheduled' | 'live' | 'ended' {
  if (s.is_live) return 'live'
  if (s.ended_at) return 'ended'
  return 'scheduled'
}

export default function LiveClient({ profile, school, userId }: Props) {
  const [sessions, setSessions] = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null) // FIX: visible error state
  const supabase    = createClient()
  const schoolColor = school?.primary_color ?? '#7C3AED'

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError(null)
    // Only show classes for the student's own class
    const { data, error: err } = await supabase
      .from('online_classes')
      .select('id, title, description, meeting_url, recording_url, is_live, scheduled_at, ended_at, teacher:profiles!teacher_id(full_name)')
      .eq('school_id', school?.id)
      .eq('class_id', profile?.class_id)
      .order('scheduled_at', { ascending: false })
      .limit(50)
    if (err) {
      console.error('[student live] load error:', err.message)
      setError(err.message)
    }
    if (data) setSessions(data)
    setLoading(false)
  }

  const STATUS_COLOR = { scheduled: '#F59E0B', live: '#10B981', ended: '#6B7280' } as const
  const STATUS_LABEL  = { scheduled: 'Upcoming', live: '🔴 LIVE', ended: 'Ended' } as const

  // Live first, then upcoming, then ended
  const ORDER = { live: 0, scheduled: 1, ended: 2 } as const
  const sorted = [...sessions].sort((a, b) => ORDER[deriveStatus(a)] - ORDER[deriveStatus(b)])

  return (
    <div className={styles.page}>
      <StudentNav userId={userId} profile={profile} school={school} schoolColor={schoolColor} />
      <div className={styles.content}>
        <DashboardHeader userId={userId} role="student" profile={profile} school={school}
          schoolColor={schoolColor} title="Live Classes" showBack />
        <main className={styles.main}>

          {/* FIX: visible error banner, dismissible */}
          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#EF444415', border: '1px solid #EF444440', borderRadius: 10, marginBottom: 'var(--space-4)' }}>
              <span style={{ fontSize: '0.8rem', color: '#EF4444', flex: 1 }}>⚠️ {error}</span>
              <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 800 }}>✕</button>
            </div>
          )}

          {loading ? <div className={styles.loading}><span /><span /><span /></div>
            : sorted.length === 0
              ? <div className={styles.empty}><VideoIcon size={40} color="var(--text-faint)" strokeWidth={1} /><p>No live classes scheduled yet</p></div>
              : <div className={styles.list}>
                {sorted.map(s => {
                  const status = deriveStatus(s)
                  return (
                    <div key={s.id} className={styles.card} style={{ flexDirection: 'column', alignItems: 'stretch', cursor: 'default' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-4)' }}>
                        <div className={styles.cardIcon} style={{ background: STATUS_COLOR[status] + '20' }}>
                          <VideoIcon size={16} color={STATUS_COLOR[status]} />
                        </div>
                        <div className={styles.cardBody}>
                          <p className={styles.cardTitle}>{s.title}</p>
                          {s.description && <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>{s.description}</p>}
                          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>
                            {s.teacher?.full_name ?? 'Teacher'}
                            {s.scheduled_at && ` · ${new Date(s.scheduled_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
                          </p>
                        </div>
                        <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: '0.68rem', fontWeight: 700, background: STATUS_COLOR[status] + '20', color: STATUS_COLOR[status], flexShrink: 0 }}>
                          {STATUS_LABEL[status]}
                        </span>
                      </div>

                      {(status === 'live' && s.meeting_url) && (
                        <a href={s.meeting_url} target="_blank" rel="noreferrer"
                          style={{ marginTop: 12, marginLeft: 56, display: 'inline-flex', alignSelf: 'flex-start', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#10B981', color: '#fff', borderRadius: 999, fontWeight: 700, fontSize: '0.8rem', textDecoration: 'none' }}>
                          🔴 Join Now
                        </a>
                      )}
                      {(status === 'ended' && s.recording_url) && (
                        <a href={s.recording_url} target="_blank" rel="noreferrer"
                          style={{ marginTop: 12, marginLeft: 56, display: 'inline-flex', alignSelf: 'flex-start', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)', borderRadius: 999, fontWeight: 700, fontSize: '0.8rem', textDecoration: 'none' }}>
                          🎬 Watch Recording
                        </a>
                      )}
                    </div>
                  )
                })}
              </div>
          }
          <div className={styles.spacer} />
        </main>
      </div>
    </div>
  )
}
