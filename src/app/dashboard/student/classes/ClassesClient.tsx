'use client'
// src/app/dashboard/student/classes/ClassesClient.tsx
// FIXED: online_classes has no `status` column and no `subject` column.
// Status is derived from is_live (boolean) + ended_at (timestamp).
// teacher join uses teacher_id FK (not profiles directly).

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import DashboardHeader from '@/components/DashboardHeader'
import StudentNav from '@/components/StudentNav'
import { VideoIcon } from '@/components/Icons'
import styles from './page.module.css'

interface Props { profile: any; school: any; userId: string }

type Tab = 'live' | 'upcoming' | 'recorded'

function deriveTab(s: any): Tab {
  if (s.is_live)  return 'live'
  if (s.ended_at) return 'recorded'
  return 'upcoming'
}

export default function ClassesClient({ profile, school, userId }: Props) {
  const [all,     setAll]     = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab,     setTab]     = useState<Tab>('live')
  const supabase    = createClient()
  const schoolColor = school?.primary_color ?? '#7C3AED'

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)

    if (!profile?.class_id) {
      setLoading(false)
      return
    }

    // Fetch all classes for this student's class — derive status client-side
    const { data } = await supabase
      .from('online_classes')
      .select('id, title, description, is_live, meeting_url, recording_url, scheduled_at, ended_at, teacher_id')
      .eq('school_id', school?.id)
      .eq('class_id', profile.class_id)
      .order('scheduled_at', { ascending: false })
      .limit(60)

    if (data) setAll(data)
    setLoading(false)
  }

  // Filter client-side by derived status
  const visible = all.filter(s => deriveTab(s) === tab)

  const TAB_CONFIG = {
    live:     { label: '🔴 Live Now', color: '#EF4444' },
    upcoming: { label: '📅 Upcoming', color: '#F59E0B' },
    recorded: { label: '🎬 Recorded', color: schoolColor },
  }

  return (
    <div className={styles.page}>
      <StudentNav userId={userId} profile={profile} school={school} schoolColor={schoolColor} />
      <div className={styles.content}>
        <DashboardHeader userId={userId} role="student" profile={profile} school={school}
          schoolColor={schoolColor} title="Classes" showBack />
        <main className={styles.main}>

          {/* No class assigned warning */}
          {!profile?.class_id && !loading && (
            <div style={{ padding: '10px 14px', background: '#F59E0B15', border: '1px solid #F59E0B40', borderRadius: 10, marginBottom: 'var(--space-4)', fontSize: '0.8rem', color: '#F59E0B' }}>
              You have not been assigned to a class yet. Please contact your school administrator.
            </div>
          )}

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-5)', flexWrap: 'wrap' }}>
            {(Object.keys(TAB_CONFIG) as Tab[]).map(t => (
              <button key={t} onClick={() => setTab(t)}
                style={{
                  padding: '6px 16px', borderRadius: '999px', fontSize: '0.78rem', fontWeight: 700,
                  background: tab === t ? TAB_CONFIG[t].color : 'var(--glass-bg)',
                  color:      tab === t ? '#fff' : 'var(--text-muted)',
                  border: `1px solid ${tab === t ? TAB_CONFIG[t].color : 'var(--glass-border)'}`,
                  cursor: 'pointer',
                }}>
                {TAB_CONFIG[t].label}
                {/* Count badge */}
                {all.filter(s => deriveTab(s) === t).length > 0 && (
                  <span style={{
                    marginLeft: 5, padding: '1px 6px', borderRadius: 999,
                    fontSize: '0.62rem', fontWeight: 800,
                    background: tab === t ? 'rgba(255,255,255,0.25)' : TAB_CONFIG[t].color + '20',
                    color: tab === t ? '#fff' : TAB_CONFIG[t].color,
                  }}>
                    {all.filter(s => deriveTab(s) === t).length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {loading
            ? <div className={styles.loading}><span /><span /><span /></div>
            : visible.length === 0
              ? (
                <div className={styles.empty}>
                  <VideoIcon size={40} color="var(--text-faint)" strokeWidth={1} />
                  <p>
                    {tab === 'live'     ? 'No class is live right now'     :
                     tab === 'upcoming' ? 'No upcoming classes scheduled'  :
                                          'No recorded classes yet'}
                  </p>
                </div>
              )
              : (
                <div className={styles.list}>
                  {visible.map(cls => {
                    const actionUrl   = tab === 'recorded' ? cls.recording_url : cls.meeting_url
                    const actionLabel = tab === 'live' ? '🔴 Join Now' : tab === 'upcoming' ? 'View Link' : '🎬 Watch'
                    const iconColor   = tab === 'live' ? '#EF4444' : tab === 'upcoming' ? '#F59E0B' : schoolColor
                    return (
                      <div key={cls.id} className={styles.card}>
                        <div className={styles.cardIcon} style={{ background: iconColor + '20' }}>
                          <VideoIcon size={16} color={iconColor} />
                        </div>
                        <div className={styles.cardBody}>
                          <p className={styles.cardTitle}>{cls.title}</p>
                          {cls.description && (
                            <p className={styles.cardText}>{cls.description}</p>
                          )}
                          <p className={styles.cardMeta}>
                            {cls.scheduled_at
                              ? new Date(cls.scheduled_at).toLocaleDateString('en-NG', {
                                  day: 'numeric', month: 'short',
                                  hour: '2-digit', minute: '2-digit',
                                })
                              : ''}
                          </p>
                        </div>
                        {actionUrl && (
                          <a href={actionUrl} target="_blank" rel="noreferrer"
                            style={{
                              padding: '7px 14px', background: iconColor,
                              color: '#fff', borderRadius: '999px',
                              fontSize: '0.72rem', fontWeight: 700,
                              textDecoration: 'none', flexShrink: 0,
                            }}>
                            {actionLabel}
                          </a>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
          }
          <div className={styles.spacer} />
        </main>
      </div>
    </div>
  )
                              }
                      
