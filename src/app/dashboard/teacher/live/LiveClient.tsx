'use client'
// src/app/dashboard/teacher/live/LiveClient.tsx
// FIX: Real `online_classes` table has `is_live` (boolean) + `meeting_url`,
// NOT a `status` text column or `meeting_link`. The old client read/wrote
// `status` and `meeting_link` everywhere, so every query silently failed —
// nothing ever loaded, created, started, or ended.
// "scheduled" / "live" / "ended" are now derived from is_live + scheduled_at + ended_at.
//
// FIX (this round): every Supabase call's error was either ignored or only
// console.error'd — so a failed insert/update looked identical to nothing
// happening at all. Added a visible error banner and error checks on every
// DB call (load, create, startClass, endClass, deleteSession) so failures
// are no longer silent.

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { VideoIcon, PlusIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'

interface Props { profile: any; school: any; userId: string }

type Tab = 'scheduled' | 'live' | 'ended'

function deriveStatus(s: any): Tab {
  if (s.is_live) return 'live'
  if (s.ended_at) return 'ended'
  return 'scheduled'
}

export default function LiveClient({ profile, school, userId }: Props) {
  const [sessions, setSessions] = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [tab,      setTab]      = useState<Tab>('scheduled')
  const [error,    setError]    = useState<string | null>(null) // FIX: visible error state
  const [form,     setForm]     = useState({
    title: '', description: '', meeting_url: '', scheduled_at: '',
  })
  const supabase = createClient()
  const sc       = school?.primary_color ?? '#7C3AED'

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('online_classes')
      .select('id, title, description, meeting_url, recording_url, is_live, scheduled_at, created_at')
      .eq('school_id', school?.id)
      .eq('teacher_id', userId)
      .order('scheduled_at', { ascending: false })
      .limit(50)
    if (err) {
      console.error('[live] load error:', err.message)
      setError(err.message)
    }
    if (data) setSessions(data)
    setLoading(false)
  }

  const visibleSessions = sessions.filter(s => deriveStatus(s) === tab)

  async function create() {
    if (!form.title) return
    setSaving(true)
    setError(null) // FIX: clear previous error before retrying
    const { error: err } = await supabase.from('online_classes').insert({
      title:         form.title,
      description:   form.description || null,
      meeting_url:   form.meeting_url || null,
      scheduled_at:  form.scheduled_at ? new Date(form.scheduled_at).toISOString() : new Date().toISOString(),
      school_id:     school?.id,
      teacher_id:    userId,
      created_by:    userId,
      is_live:       false,
    })
    if (!err) {
      setForm({ title: '', description: '', meeting_url: '', scheduled_at: '' })
      setShowForm(false)
      setTab('scheduled')
      load()
    } else {
      // FIX: surface to UI, not just console
      console.error('[live] insert error:', err.message)
      setError(err.message)
    }
    setSaving(false)
  }

  async function startClass(id: string) {
    setError(null)
    const { error: err } = await supabase.from('online_classes')
      .update({ is_live: true }).eq('id', id)
    if (err) { console.error('[live] start error:', err.message); setError(err.message); return }
    setTab('live')
    load()
  }

  async function endClass(id: string) {
    setError(null)
    const { error: err } = await supabase.from('online_classes')
      .update({ is_live: false, ended_at: new Date().toISOString() })
      .eq('id', id)
    if (err) { console.error('[live] end error:', err.message); setError(err.message); return }
    setTab('ended')
    load()
  }

  async function deleteSession(id: string) {
    setError(null)
    const { error: err } = await supabase.from('online_classes').delete().eq('id', id)
    if (err) { console.error('[live] delete error:', err.message); setError(err.message); return }
    setSessions(prev => prev.filter(s => s.id !== id))
  }

  const STATUS_COLOR: Record<Tab, string> = {
    scheduled: '#F59E0B', live: '#10B981', ended: '#6B7280',
  }

  return (
    <RolePageWrapper userId={userId} role="teacher" profile={profile} school={school} title="Live Classes">

      <div className={styles.tabs} style={{ marginBottom: 'var(--space-4)' }}>
        {(['scheduled', 'live', 'ended'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`}
            style={tab === t ? { background: sc, color: '#fff', borderColor: sc } : {}}>
            {t === 'scheduled' ? '📅 Upcoming' : t === 'live' ? '🔴 Live' : '✅ Ended'}
          </button>
        ))}
        <button onClick={() => setShowForm(!showForm)}
          style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', background: sc, color: '#fff', border: 'none', borderRadius: 999, fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
          <PlusIcon size={13} color="white" /> Schedule
        </button>
      </div>

      {/* FIX: visible error banner, dismissible */}
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#EF444415', border: '1px solid #EF444440', borderRadius: 10, marginBottom: 'var(--space-4)' }}>
          <span style={{ fontSize: '0.8rem', color: '#EF4444', flex: 1 }}>⚠️ {error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 800 }}>✕</button>
        </div>
      )}

      {showForm && (
        <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-5)', marginBottom: 'var(--space-5)' }}>
          <p style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 'var(--space-4)', fontSize: '0.9rem' }}>Schedule Live Class</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            <div style={{ gridColumn: '1/-1', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Title *</label>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Chapter 5 Revision"
                style={{ height: 40, padding: '0 12px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }} />
            </div>
            <div style={{ gridColumn: '1/-1', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Description</label>
              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="e.g. Mathematics — JSS 2"
                style={{ height: 40, padding: '0 12px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Date & Time</label>
              <input type="datetime-local" value={form.scheduled_at}
                onChange={e => setForm(f => ({ ...f, scheduled_at: e.target.value }))}
                style={{ height: 40, padding: '0 12px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }} />
            </div>
            <div style={{ gridColumn: '1/-1', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Meeting Link (Google Meet, Jitsi, Zoom…)</label>
              <input type="url" value={form.meeting_url}
                onChange={e => setForm(f => ({ ...f, meeting_url: e.target.value }))}
                placeholder="https://meet.google.com/abc-xyz"
                style={{ height: 40, padding: '0 12px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
            <button onClick={create} disabled={saving || !form.title}
              style={{ flex: 1, height: 40, background: sc, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Scheduling...' : 'Schedule Class'}
            </button>
            <button onClick={() => setShowForm(false)}
              style={{ flex: 1, height: 40, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 8, color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? <div className={styles.loading}><span /><span /><span /></div>
        : visibleSessions.length === 0
          ? <div className={styles.empty}><VideoIcon size={40} color="var(--text-faint)" strokeWidth={1} /><p>No {tab} classes</p></div>
          : <div className={styles.list}>
            {visibleSessions.map(s => {
              const status = deriveStatus(s)
              return (
                <div key={s.id} className={styles.card} style={{ flexDirection: 'column', gap: 'var(--space-3)', cursor: 'default' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-4)', width: '100%' }}>
                    <div className={styles.cardIcon} style={{ background: (STATUS_COLOR[status] ?? sc) + '20' }}>
                      <VideoIcon size={16} color={STATUS_COLOR[status] ?? sc} />
                    </div>
                    <div className={styles.cardBody}>
                      <p className={styles.cardTitle}>{s.title}</p>
                      {s.description && <p className={styles.cardText}>{s.description}</p>}
                      {s.scheduled_at && (
                        <p className={styles.cardMeta}>
                          {new Date(s.scheduled_at).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      )}
                    </div>
                    <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: '0.68rem', fontWeight: 700, background: (STATUS_COLOR[status] ?? '#6B7280') + '20', color: STATUS_COLOR[status] ?? '#6B7280', flexShrink: 0 }}>
                      {status === 'scheduled' ? 'Upcoming' : status === 'live' ? '🔴 LIVE' : 'Ended'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--space-2)', paddingLeft: 56, flexWrap: 'wrap' }}>
                    {status === 'scheduled' && (
                      <button onClick={() => startClass(s.id)}
                        style={{ padding: '6px 14px', background: '#10B981', color: '#fff', border: 'none', borderRadius: 999, fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer' }}>
                        🔴 Start Now
                      </button>
                    )}
                    {status === 'live' && (
                      <button onClick={() => endClass(s.id)}
                        style={{ padding: '6px 14px', background: '#EF4444', color: '#fff', border: 'none', borderRadius: 999, fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer' }}>
                        ⏹ End Class
                      </button>
                    )}
                    {s.meeting_url && (
                      <a href={s.meeting_url} target="_blank" rel="noreferrer"
                        style={{ padding: '6px 14px', background: sc + '20', color: sc, border: `1px solid ${sc}40`, borderRadius: 999, fontWeight: 700, fontSize: '0.75rem', textDecoration: 'none' }}>
                        🔗 Open Meeting
                      </a>
                    )}
                    {s.recording_url && status === 'ended' && (
                      <a href={s.recording_url} target="_blank" rel="noreferrer"
                        style={{ padding: '6px 14px', background: 'var(--glass-bg)', color: 'var(--text-secondary)', border: '1px solid var(--glass-border)', borderRadius: 999, fontWeight: 700, fontSize: '0.75rem', textDecoration: 'none' }}>
                        🎬 Recording
                      </a>
                    )}
                    {status !== 'live' && (
                      <button onClick={() => deleteSession(s.id)}
                        style={{ padding: '6px 14px', background: 'transparent', color: '#EF4444', border: '1px solid #EF444440', borderRadius: 999, fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer' }}>
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
      }
      <div className={styles.spacer} />
    </RolePageWrapper>
  )
}
