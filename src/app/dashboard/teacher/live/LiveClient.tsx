'use client'
// FIXED:
// 1. Error surfaced via banner — create/update/delete errors now visible to user
// 2. Edit scheduled session: tap pencil on any scheduled session to edit title/subject/time/link
// 3. school_id guard before queries
// 4. Own CSS module — no more borrowing mismatched student/records styles
// 5. school brand colour applied uniformly

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { VideoIcon, PlusIcon } from '@/components/Icons'
import styles from './live.module.css'

interface Props { profile: any; school: any; userId: string }

interface Session {
  id: string
  title: string
  subject: string
  class_level: string | null
  meeting_link: string | null
  scheduled_at: string | null
  started_at: string | null
  ended_at: string | null
  status: 'scheduled' | 'live' | 'ended'
}

const EMPTY_FORM = { title: '', subject: '', meeting_link: '', scheduled_at: '', class_level: '' }

const STATUS_COLOR: Record<string, string> = {
  scheduled: '#F59E0B',
  live: '#10B981',
  ended: '#6B7280',
}

export default function LiveClient({ profile, school, userId }: Props) {
  const [sessions,  setSessions]  = useState<Session[]>([])
  const [loading,   setLoading]   = useState(true)
  const [showForm,  setShowForm]  = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [tab,       setTab]       = useState<'scheduled' | 'live' | 'ended'>('scheduled')
  const [form,      setForm]      = useState(EMPTY_FORM)
  const [editId,    setEditId]    = useState<string | null>(null)
  const supabase = createClient()
  const sc = school?.primary_color ?? '#7C3AED'

  useEffect(() => { load() }, [tab])

  async function load() {
    if (!school?.id) return
    setLoading(true)
    const { data, error: err } = await supabase
      .from('online_classes')
      .select('*')
      .eq('school_id', school.id)
      .eq('teacher_id', userId)
      .eq('status', tab)
      .order('scheduled_at', { ascending: tab !== 'ended' })
      .limit(30)
    if (err) setError(err.message)
    else setSessions(data ?? [])
    setLoading(false)
  }

  function openCreate() {
    setEditId(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
    setError(null)
  }

  function openEdit(s: Session) {
    setEditId(s.id)
    setForm({
      title: s.title,
      subject: s.subject,
      class_level: s.class_level ?? '',
      meeting_link: s.meeting_link ?? '',
      scheduled_at: s.scheduled_at ? s.scheduled_at.slice(0, 16) : '',
    })
    setShowForm(true)
    setError(null)
  }

  async function save() {
    if (!form.title.trim() || !form.subject.trim()) {
      setError('Title and Subject are required')
      return
    }
    setSaving(true)
    setError(null)

    if (editId) {
      const { error: err } = await supabase.from('online_classes').update({
        title: form.title,
        subject: form.subject,
        class_level: form.class_level || null,
        meeting_link: form.meeting_link || null,
        scheduled_at: form.scheduled_at || null,
      }).eq('id', editId)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      const { error: err } = await supabase.from('online_classes').insert({
        ...form,
        class_level: form.class_level || null,
        meeting_link: form.meeting_link || null,
        scheduled_at: form.scheduled_at || null,
        school_id: school?.id,
        teacher_id: userId,
        status: 'scheduled',
      })
      if (err) { setError(err.message); setSaving(false); return }
    }

    setForm(EMPTY_FORM)
    setShowForm(false)
    setEditId(null)
    setTab('scheduled')
    await load()
    setSaving(false)
  }

  async function startClass(id: string) {
    const { error: err } = await supabase.from('online_classes')
      .update({ status: 'live', started_at: new Date().toISOString() }).eq('id', id)
    if (err) { setError(err.message); return }
    await load()
  }

  async function endClass(id: string) {
    const { error: err } = await supabase.from('online_classes')
      .update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', id)
    if (err) { setError(err.message); return }
    await load()
  }

  async function deleteSession(id: string) {
    if (!confirm('Delete this session?')) return
    const { error: err } = await supabase.from('online_classes').delete().eq('id', id)
    if (err) { setError(err.message); return }
    setSessions(prev => prev.filter(s => s.id !== id))
  }

  return (
    <RolePageWrapper userId={userId} role="teacher" profile={profile} school={school} title="Live Classes">

      {/* Tab bar + Schedule button */}
      <div className={styles.topBar}>
        <div className={styles.tabs}>
          {(['scheduled', 'live', 'ended'] as const).map(t => (
            <button key={t} onClick={() => { setTab(t); setShowForm(false) }}
              className={styles.tab}
              style={tab === t ? { background: sc, color: '#fff', borderColor: sc } : { borderColor: sc + '40', color: sc }}>
              {t === 'scheduled' ? '📅 Upcoming' : t === 'live' ? '🔴 Live' : '✅ Ended'}
            </button>
          ))}
        </div>
        <button onClick={openCreate} className={styles.addBtn} style={{ background: sc }}>
          <PlusIcon size={13} color="#fff" /> Schedule
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className={styles.errorBanner}>
          ⚠️ {error}
          <button onClick={() => setError(null)} className={styles.errorClose}>✕</button>
        </div>
      )}

      {/* Create / Edit form */}
      {showForm && (
        <div className={styles.formCard}>
          <p className={styles.formTitle}>
            {editId ? 'Edit Session' : 'Schedule Live Class'}
          </p>
          <div className={styles.formGrid}>
            {[
              { key: 'title',       label: 'Title *',     placeholder: 'e.g. Chapter 5 Revision' },
              { key: 'subject',     label: 'Subject *',   placeholder: 'e.g. Mathematics'        },
              { key: 'class_level', label: 'Class Level', placeholder: 'e.g. JSS 2'              },
              { key: 'scheduled_at',label: 'Date & Time', type: 'datetime-local'                 },
            ].map(f => (
              <div key={f.key} className={styles.fieldWrap}>
                <label className={styles.fieldLabel}>{f.label}</label>
                <input
                  type={(f as any).type ?? 'text'}
                  value={(form as any)[f.key]}
                  onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={(f as any).placeholder ?? ''}
                  className={styles.input}
                />
              </div>
            ))}
            <div className={styles.fieldWrap} style={{ gridColumn: '1/-1' }}>
              <label className={styles.fieldLabel}>Meeting Link (Google Meet, Jitsi, Zoom…)</label>
              <input type="url" value={form.meeting_link}
                onChange={e => setForm(prev => ({ ...prev, meeting_link: e.target.value }))}
                placeholder="https://meet.google.com/abc-xyz"
                className={styles.input}
              />
            </div>
          </div>
          <div className={styles.formActions}>
            <button onClick={save} disabled={saving || !form.title || !form.subject}
              className={styles.btnPrimary} style={{ background: sc }}>
              {saving ? 'Saving...' : editId ? 'Save Changes' : 'Schedule Class'}
            </button>
            <button onClick={() => { setShowForm(false); setEditId(null) }} className={styles.btnSecondary}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Sessions list */}
      {loading
        ? <div className={styles.loader}><span /><span /><span /></div>
        : sessions.length === 0
          ? (
            <div className={styles.empty}>
              <VideoIcon size={40} color="var(--text-faint)" strokeWidth={1} />
              <p>No {tab} classes</p>
              {tab === 'scheduled' && (
                <button onClick={openCreate}
                  style={{ marginTop: 8, padding: '6px 16px', background: sc, color: '#fff', border: 'none', borderRadius: 999, fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>
                  + Schedule First Class
                </button>
              )}
            </div>
          )
          : (
            <div className={styles.sessionList}>
              {sessions.map(s => {
                const stColor = STATUS_COLOR[s.status] ?? '#6B7280'
                return (
                  <div key={s.id} className={styles.sessionCard}>
                    <div className={styles.sessionTop}>
                      <div className={styles.sessionIcon} style={{ background: stColor + '20' }}>
                        <VideoIcon size={16} color={stColor} />
                      </div>
                      <div className={styles.sessionInfo}>
                        <p className={styles.sessionTitle}>{s.title}</p>
                        <p className={styles.sessionSubject}>{s.subject}{s.class_level ? ` · ${s.class_level}` : ''}</p>
                        {s.scheduled_at && (
                          <p className={styles.sessionTime}>
                            {new Date(s.scheduled_at).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        )}
                      </div>
                      <div className={styles.sessionRight}>
                        <span className={styles.statusBadge} style={{ background: stColor + '20', color: stColor }}>
                          {s.status === 'scheduled' ? 'Upcoming' : s.status === 'live' ? '🔴 LIVE' : 'Ended'}
                        </span>
                        {/* Edit button only for scheduled sessions */}
                        {s.status === 'scheduled' && (
                          <button onClick={() => openEdit(s)} className={styles.editBtn} style={{ color: sc }} title="Edit session">
                            ✏️
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Action row */}
                    <div className={styles.sessionActions}>
                      {s.status === 'scheduled' && (
                        <button onClick={() => startClass(s.id)} className={styles.actionBtn}
                          style={{ background: '#10B981', color: '#fff', border: 'none' }}>
                          🔴 Start Now
                        </button>
                      )}
                      {s.status === 'live' && (
                        <button onClick={() => endClass(s.id)} className={styles.actionBtn}
                          style={{ background: '#EF4444', color: '#fff', border: 'none' }}>
                          ⏹ End Class
                        </button>
                      )}
                      {s.meeting_link && (
                        <a href={s.meeting_link} target="_blank" rel="noreferrer"
                          className={styles.meetLink}
                          style={{ background: sc + '20', color: sc, border: `1px solid ${sc}40` }}>
                          🔗 Open Meeting
                        </a>
                      )}
                      {s.status !== 'live' && (
                        <button onClick={() => deleteSession(s.id)} className={styles.deleteBtn}>
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )
      }
      <div style={{ height: 80 }} />
    </RolePageWrapper>
  )
}
