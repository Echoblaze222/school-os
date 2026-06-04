'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import styles from './notices.module.css'

type Priority = 'low' | 'normal' | 'urgent'
type Audience = 'all' | 'students' | 'teachers' | 'parents' | 'staff'

interface Notice {
  id: string
  title: string
  body: string
  audience: Audience
  priority: Priority
  created_at: string
  created_by?: string
}

const AUDIENCE_OPTS: Audience[] = ['all','students','teachers','parents','staff']
const PRIORITY_OPTS: Priority[]  = ['low','normal','urgent']
const PRIORITY_COLOR: Record<Priority,string> = { low:'#6B7280', normal:'#3B82F6', urgent:'#EF4444' }
const AUDIENCE_COLOR: Record<Audience,string>  = {
  all:'#800020', students:'#3B82F6', teachers:'#10B981', parents:'#F59E0B', staff:'#8B5CF6',
}

interface Props { profile: any; school: any; userId: string }

export default function NoticesClient({ profile, school, userId }: Props) {
  const supabase    = createClient()
  const sc          = school?.primary_color ?? '#7C3AED'
  const [notices,   setNotices]   = useState<Notice[]>([])
  const [loading,   setLoading]   = useState(true)
  const [showForm,  setShowForm]  = useState(false)
  const [expanded,  setExpanded]  = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState<Notice | null>(null)
  const [deleting,  setDeleting]  = useState<string | null>(null)
  const [saving,    setSaving]    = useState(false)
  const [toast,     setToast]     = useState<{ msg: string; ok: boolean } | null>(null)
  const [filter,    setFilter]    = useState<Audience | ''>('')
  const [form, setForm] = useState({ title:'', body:'', audience:'all' as Audience, priority:'normal' as Priority })

  useEffect(() => { load() }, [])

  async function load() {
    if (!school?.id) { setLoading(false); return }
    const { data } = await supabase
      .from('announcements')
      .select('id, title, body, audience, priority, created_at, created_by')
      .eq('school_id', school.id)
      .order('created_at', { ascending: false })
      .limit(60)
    if (data) setNotices(data as Notice[])
    setLoading(false)
  }

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  async function handleCreate() {
    if (!form.title.trim() || !form.body.trim()) return
    setSaving(true)
    const { data, error } = await supabase
      .from('announcements')
      .insert({
        title:      form.title.trim(),
        body:       form.body.trim(),
        audience:   form.audience,
        priority:   form.priority,
        school_id:  school.id,
        created_by: userId,
      })
      .select('id, title, body, audience, priority, created_at, created_by')
      .single()
    setSaving(false)
    if (error) { showToast(error.message, false); return }
    setNotices(prev => [data as Notice, ...prev])
    setForm({ title:'', body:'', audience:'all', priority:'normal' })
    setShowForm(false)
    showToast('Notice published')
  }

  async function handleDelete(notice: Notice) {
    setDeleting(notice.id)
    const { error } = await supabase.from('announcements').delete().eq('id', notice.id)
    setDeleting(null)
    setConfirmDel(null)
    if (error) { showToast('Failed to delete notice', false); return }
    setNotices(prev => prev.filter(n => n.id !== notice.id))
    showToast('Notice deleted')
  }

  function relTime(iso: string) {
    const diff = Date.now() - new Date(iso).getTime()
    const m = Math.floor(diff / 60000)
    if (m < 1) return 'just now'
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ago`
    const d = Math.floor(h / 24)
    if (d < 7) return `${d}d ago`
    return new Date(iso).toLocaleDateString('en-NG',{day:'numeric',month:'short'})
  }

  const filtered = filter ? notices.filter(n => n.audience === filter || n.audience === 'all') : notices
  const urgentCount = notices.filter(n => n.priority === 'urgent').length

  return (
    <RolePageWrapper userId={userId} role="principal" profile={profile} school={school} title="Notices">
      {toast && (
        <div className={`${styles.toast} ${toast.ok ? styles.toastOk : styles.toastErr}`}>
          {toast.ok ? '✓' : '✕'} {toast.msg}
        </div>
      )}

      {confirmDel && (
        <div className={styles.overlay}>
          <div className={styles.dialog}>
            <h3 className={styles.dialogTitle}>Delete Notice?</h3>
            <p className={styles.dialogBody}>
              "<strong>{confirmDel.title}</strong>" will be permanently deleted and removed from all feeds.
            </p>
            <div className={styles.dialogActions}>
              <button className={styles.cancelBtn} onClick={() => setConfirmDel(null)}>Cancel</button>
              <button className={styles.deleteBtn} onClick={() => handleDelete(confirmDel)} disabled={deleting === confirmDel.id}>
                {deleting === confirmDel.id ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={styles.container}>
        {/* Stats */}
        <div className={styles.statsRow}>
          <div className={styles.statCard}>
            <p className={styles.statVal} style={{ color: sc }}>{notices.length}</p>
            <p className={styles.statLbl}>Total</p>
          </div>
          <div className={styles.statCard}>
            <p className={styles.statVal} style={{ color: '#EF4444' }}>{urgentCount}</p>
            <p className={styles.statLbl}>Urgent</p>
          </div>
          <div className={styles.statCard}>
            <p className={styles.statVal} style={{ color: '#10B981' }}>{notices.filter(n => { const d = Date.now()-new Date(n.created_at).getTime(); return d < 86400000*7 }).length}</p>
            <p className={styles.statLbl}>This Week</p>
          </div>
        </div>

        {/* Toolbar */}
        <div className={styles.toolbar}>
          <div className={styles.filterTabs}>
            {(['','all','students','teachers','parents','staff'] as const).map(a => (
              <button
                key={a}
                className={`${styles.filterTab} ${filter === a ? styles.filterTabActive : ''}`}
                style={filter === a ? { borderColor: a ? AUDIENCE_COLOR[a as Audience] : sc, color: a ? AUDIENCE_COLOR[a as Audience] : sc } : {}}
                onClick={() => setFilter(a as any)}
              >
                {a === '' ? 'All' : a.charAt(0).toUpperCase() + a.slice(1)}
              </button>
            ))}
          </div>
          <button className={styles.addBtn} style={{ background: sc }} onClick={() => setShowForm(v => !v)}>
            {showForm ? '✕ Close' : '+ New Notice'}
          </button>
        </div>

        {/* Create form */}
        {showForm && (
          <div className={styles.formCard}>
            <p className={styles.formTitle}>Publish New Notice</p>
            <div className={styles.formGrid}>
              <div className={`${styles.fieldGroup} ${styles.fullWidth}`}>
                <label className={styles.fieldLabel}>Title *</label>
                <input className={styles.fieldInput} placeholder="e.g. School Closing Early Tomorrow" value={form.title} onChange={e => setForm(f=>({...f,title:e.target.value}))} maxLength={120}/>
              </div>
              <div className={`${styles.fieldGroup} ${styles.fullWidth}`}>
                <label className={styles.fieldLabel}>Message *</label>
                <textarea className={`${styles.fieldInput} ${styles.textarea}`} rows={4} placeholder="Write the full notice here…" value={form.body} onChange={e => setForm(f=>({...f,body:e.target.value}))} maxLength={1000}/>
                <span className={styles.charCount}>{form.body.length}/1000</span>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Audience *</label>
                <select className={styles.fieldInput} value={form.audience} onChange={e => setForm(f=>({...f,audience:e.target.value as Audience}))}>
                  {AUDIENCE_OPTS.map(a => <option key={a} value={a}>{a === 'all' ? 'Everyone' : a.charAt(0).toUpperCase()+a.slice(1)}</option>)}
                </select>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Priority</label>
                <select className={styles.fieldInput} value={form.priority} onChange={e => setForm(f=>({...f,priority:e.target.value as Priority}))}>
                  {PRIORITY_OPTS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>)}
                </select>
              </div>
            </div>
            <div className={styles.formActions}>
              <button className={styles.cancelFormBtn} onClick={() => setShowForm(false)}>Cancel</button>
              <button className={styles.saveBtn} style={{ background: sc }} onClick={handleCreate} disabled={saving || !form.title.trim() || !form.body.trim()}>
                {saving ? 'Publishing…' : 'Publish Notice'}
              </button>
            </div>
          </div>
        )}

        {/* Notices list */}
        {loading ? (
          <div className={styles.loadingList}>
            {[1,2,3].map(i => <div key={i} className={styles.skeleton}/>)}
          </div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth="1.2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/></svg>
            <p>No notices yet — publish one above</p>
          </div>
        ) : (
          <div className={styles.noticeList}>
            {filtered.map(notice => {
              const isExp = expanded === notice.id
              const pColor = PRIORITY_COLOR[notice.priority ?? 'normal']
              const aColor = AUDIENCE_COLOR[notice.audience ?? 'all']
              return (
                <div key={notice.id} className={`${styles.noticeCard} ${notice.priority === 'urgent' ? styles.urgentCard : ''}`}>
                  <div className={styles.noticeTop} onClick={() => setExpanded(isExp ? null : notice.id)}>
                    <div className={styles.noticeMeta}>
                      <span className={styles.priorityDot} style={{ background: pColor }}/>
                      <span className={styles.audiencePill} style={{ background: aColor + '20', color: aColor }}>
                        {notice.audience}
                      </span>
                      <span className={styles.noticeTime}>{relTime(notice.created_at)}</span>
                    </div>
                    <button className={styles.delIconBtn} onClick={e => { e.stopPropagation(); setConfirmDel(notice) }} title="Delete">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>
                    </button>
                  </div>
                  <h3 className={styles.noticeTitle} onClick={() => setExpanded(isExp ? null : notice.id)}>{notice.title}</h3>
                  <p className={styles.noticeBody} style={isExp ? { WebkitLineClamp: 'unset', display:'block' } : {}}>{notice.body}</p>
                  {!isExp && notice.body.length > 120 && (
                    <button className={styles.readMore} onClick={() => setExpanded(notice.id)}>Read more ↓</button>
                  )}
                  {isExp && (
                    <button className={styles.readMore} onClick={() => setExpanded(null)}>Show less ↑</button>
                  )}
                </div>
              )
            })}
          </div>
        )}
        <div style={{ height: 100 }}/>
      </div>
    </RolePageWrapper>
  )
}
