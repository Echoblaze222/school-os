'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { VideoIcon, PlusIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'

interface Props { profile: any; school: any; userId: string }

export default function LiveClient({ profile, school, userId }: Props) {
  const [sessions, setSessions] = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [tab,      setTab]      = useState<'scheduled'|'live'|'ended'>('scheduled')
  const [form,     setForm]     = useState({
    title: '', subject: '', meeting_link: '', scheduled_at: '', class_level: '',
  })
  const supabase = createClient()
  const sc       = school?.primary_color ?? '#7C3AED'

  useEffect(() => { load() }, [tab])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('online_classes')
      .select('*')
      .eq('school_id', school?.id)
      .eq('teacher_id', userId)
      .eq('status', tab)
      .order('scheduled_at', { ascending: tab !== 'ended' })
      .limit(30)
    if (data) setSessions(data)
    setLoading(false)
  }

  async function create() {
    if (!form.title || !form.subject) return
    setSaving(true)
    await supabase.from('online_classes').insert({
      ...form, school_id: school?.id, teacher_id: userId, status: 'scheduled',
    })
    setForm({ title: '', subject: '', meeting_link: '', scheduled_at: '', class_level: '' })
    setShowForm(false)
    setTab('scheduled')
    load()
    setSaving(false)
  }

  async function startClass(id: string) {
    await supabase.from('online_classes')
      .update({ status: 'live', started_at: new Date().toISOString() }).eq('id', id)
    load()
  }

  async function endClass(id: string) {
    await supabase.from('online_classes')
      .update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', id)
    load()
  }

  async function deleteSession(id: string) {
    await supabase.from('online_classes').delete().eq('id', id)
    setSessions(prev => prev.filter(s => s.id !== id))
  }

  const STATUS_COLOR: Record<string, string> = {
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

      {showForm && (
        <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-5)', marginBottom: 'var(--space-5)' }}>
          <p style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 'var(--space-4)', fontSize: '0.9rem' }}>Schedule Live Class</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            {[
              { key: 'title',        label: 'Title *',       placeholder: 'e.g. Chapter 5 Revision' },
              { key: 'subject',      label: 'Subject *',     placeholder: 'e.g. Mathematics'        },
              { key: 'class_level',  label: 'Class Level',   placeholder: 'e.g. JSS 2'              },
              { key: 'scheduled_at', label: 'Date & Time',   type: 'datetime-local'                 },
            ].map(f => (
              <div key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>{f.label}</label>
                <input type={(f as any).type ?? 'text'}
                  value={(form as any)[f.key]}
                  onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={(f as any).placeholder ?? ''}
                  style={{ height: 40, padding: '0 12px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }} />
              </div>
            ))}
            <div style={{ gridColumn: '1/-1', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Meeting Link (Google Meet, Jitsi, Zoom…)</label>
              <input type="url" value={form.meeting_link}
                onChange={e => setForm(prev => ({ ...prev, meeting_link: e.target.value }))}
                placeholder="https://meet.google.com/abc-xyz"
                style={{ height: 40, padding: '0 12px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
            <button onClick={create} disabled={saving || !form.title || !form.subject}
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
        : sessions.length === 0
          ? <div className={styles.empty}><VideoIcon size={40} color="var(--text-faint)" strokeWidth={1} /><p>No {tab} classes</p></div>
          : <div className={styles.list}>
            {sessions.map(s => (
              <div key={s.id} className={styles.card} style={{ flexDirection: 'column', gap: 'var(--space-3)', cursor: 'default' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-4)', width: '100%' }}>
                  <div className={styles.cardIcon} style={{ background: (STATUS_COLOR[s.status] ?? sc) + '20' }}>
                    <VideoIcon size={16} color={STATUS_COLOR[s.status] ?? sc} />
                  </div>
                  <div className={styles.cardBody}>
                    <p className={styles.cardTitle}>{s.title}</p>
                    <p className={styles.cardText}>{s.subject}{s.class_level ? ` · ${s.class_level}` : ''}</p>
                    {s.scheduled_at && (
                      <p className={styles.cardMeta}>
                        {new Date(s.scheduled_at).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                  </div>
                  <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: '0.68rem', fontWeight: 700, background: (STATUS_COLOR[s.status] ?? '#6B7280') + '20', color: STATUS_COLOR[s.status] ?? '#6B7280', flexShrink: 0 }}>
                    {s.status === 'scheduled' ? 'Upcoming' : s.status === 'live' ? '🔴 LIVE' : 'Ended'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-2)', paddingLeft: 56, flexWrap: 'wrap' }}>
                  {s.status === 'scheduled' && (
                    <button onClick={() => startClass(s.id)}
                      style={{ padding: '6px 14px', background: '#10B981', color: '#fff', border: 'none', borderRadius: 999, fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer' }}>
                      🔴 Start Now
                    </button>
                  )}
                  {s.status === 'live' && (
                    <button onClick={() => endClass(s.id)}
                      style={{ padding: '6px 14px', background: '#EF4444', color: '#fff', border: 'none', borderRadius: 999, fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer' }}>
                      ⏹ End Class
                    </button>
                  )}
                  {s.meeting_link && (
                    <a href={s.meeting_link} target="_blank" rel="noreferrer"
                      style={{ padding: '6px 14px', background: sc + '20', color: sc, border: `1px solid ${sc}40`, borderRadius: 999, fontWeight: 700, fontSize: '0.75rem', textDecoration: 'none' }}>
                      🔗 Open Meeting
                    </a>
                  )}
                  {s.status !== 'live' && (
                    <button onClick={() => deleteSession(s.id)}
                      style={{ padding: '6px 14px', background: 'transparent', color: '#EF4444', border: '1px solid #EF444440', borderRadius: 999, fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer' }}>
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
      }
      <div className={styles.spacer} />
    </RolePageWrapper>
  )
}
