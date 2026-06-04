'use client'
// src/app/dashboard/secretary/notices/NoticesClient.tsx

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import styles from '../secretary.module.css'

const CATEGORIES = ['General', 'Academic', 'Event', 'Holiday', 'Emergency', 'Finance']
const CAT_COLORS: Record<string, string> = {
  General: '#6B7280', Academic: '#3B82F6', Event: '#10B981',
  Holiday: '#F59E0B', Emergency: '#EF4444', Finance: '#8B5CF6',
}

interface Notice { id: string; title: string; body: string; category: string; pinned: boolean; created_at: string; author_name?: string }
interface Props { notices: Notice[]; profile: any; school: any; userId: string }

export default function NoticesClient({ notices: init, profile, school, userId }: Props) {
  const [notices, setNotices] = useState(init)
  const [modal,   setModal]   = useState(false)
  const [editItem, setEditItem] = useState<Notice | null>(null)
  const [delItem, setDelItem] = useState<Notice | null>(null)
  const [saving,  setSaving]  = useState(false)
  const [msg,     setMsg]     = useState('')
  const [form,    setForm]    = useState({ title: '', body: '', category: 'General', pinned: false })

  const supabase = createClient()
  const sc       = school?.primary_color ?? '#7C3AED'

  function openAdd()          { setForm({ title: '', body: '', category: 'General', pinned: false }); setEditItem(null); setMsg(''); setModal(true) }
  function openEdit(n: Notice) { setForm({ title: n.title, body: n.body, category: n.category, pinned: n.pinned }); setEditItem(n); setMsg(''); setModal(true) }

  async function save() {
    if (!form.title.trim() || !form.body.trim()) { setMsg('Title and body are required.'); return }
    setSaving(true); setMsg('')

    if (editItem) {
      const { error } = await supabase.from('notices').update({ title: form.title, body: form.body, category: form.category, pinned: form.pinned }).eq('id', editItem.id)
      if (!error) {
        setNotices(p => p.map(n => n.id === editItem.id ? { ...n, ...form } : n))
        setModal(false)
      } else setMsg(error.message)
    } else {
      const { data, error } = await supabase.from('notices').insert({
        title: form.title, body: form.body, category: form.category, pinned: form.pinned,
        school_id: school?.id, author_id: userId, author_name: profile?.full_name,
        created_at: new Date().toISOString(),
      }).select().single()

      if (!error && data) {
        setNotices(p => [data, ...p]); setModal(false)
      } else setMsg(error?.message ?? 'Failed')
    }
    setSaving(false)
  }

  async function deleteNotice() {
    if (!delItem) return
    setSaving(true)
    await supabase.from('notices').delete().eq('id', delItem.id)
    setNotices(p => p.filter(n => n.id !== delItem.id))
    setDelItem(null); setSaving(false)
  }

  async function togglePin(n: Notice) {
    const next = !n.pinned
    await supabase.from('notices').update({ pinned: next }).eq('id', n.id)
    setNotices(p => p.map(x => x.id === n.id ? { ...x, pinned: next } : x))
  }

  function formatDate(d: string) { return new Date(d).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' }) }

  const pinned   = notices.filter(n => n.pinned)
  const unpinned = notices.filter(n => !n.pinned)

  return (
    <RolePageWrapper userId={userId} role="secretary" profile={profile} school={school} title="Notices">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-5)' }}>
        <button className={styles.btnPrimary} onClick={openAdd}>📢 Post Notice</button>
      </div>

      {notices.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyEmoji}>📢</p>
          <p className={styles.emptyTitle}>No notices yet</p>
          <p className={styles.emptyHint}>Post school-wide announcements and events here</p>
        </div>
      ) : (
        <>
          {pinned.length > 0 && (
            <>
              <p className={styles.sectionLabel}>📌 Pinned</p>
              {pinned.map(n => <NoticeCard key={n.id} notice={n} onEdit={openEdit} onPin={togglePin} onDelete={setDelItem} />)}
            </>
          )}
          {unpinned.length > 0 && (
            <>
              <p className={styles.sectionLabel} style={{ marginTop: pinned.length ? 'var(--space-5)' : 0 }}>All Notices</p>
              {unpinned.map(n => <NoticeCard key={n.id} notice={n} onEdit={openEdit} onPin={togglePin} onDelete={setDelItem} />)}
            </>
          )}
        </>
      )}

      {/* Create/Edit Modal */}
      {modal && (
        <div className={styles.modalOverlay} onClick={() => setModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>{editItem ? 'Edit Notice' : 'Post New Notice'}</h2>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Title *</label>
              <input className={styles.formInput} value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Notice title" />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Category</label>
              <select className={styles.formSelect} value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Body *</label>
              <textarea className={styles.formTextarea} value={form.body} onChange={e => setForm(p => ({ ...p, body: e.target.value }))} placeholder="Notice content…" rows={5} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', fontSize: '0.85rem', color: 'var(--text-secondary)', cursor: 'pointer', marginBottom: 'var(--space-4)' }}>
              <input type="checkbox" checked={form.pinned} onChange={e => setForm(p => ({ ...p, pinned: e.target.checked })} />
              📌 Pin to top
            </label>
            {msg && <p style={{ fontSize: '0.78rem', color: '#EF4444', margin: '0 0 var(--space-3)' }}>{msg}</p>}
            <div className={styles.modalActions}>
              <button className={styles.btnGhost} onClick={() => setModal(false)}>Cancel</button>
              <button className={styles.btnPrimary} onClick={save} disabled={saving}>{saving ? 'Posting…' : editItem ? 'Save' : 'Post'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {delItem && (
        <div className={styles.modalOverlay} onClick={() => setDelItem(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Delete Notice?</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 'var(--space-5)' }}>
              "<strong>{delItem.title}</strong>" will be permanently removed.
            </p>
            <div className={styles.modalActions}>
              <button className={styles.btnGhost} onClick={() => setDelItem(null)}>Cancel</button>
              <button className={styles.btnDanger} onClick={deleteNotice} disabled={saving}>{saving ? 'Deleting…' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ height: 110 }} />
    </RolePageWrapper>
  )
}

function NoticeCard({ notice, onEdit, onPin, onDelete }: { notice: Notice; onEdit: (n: Notice) => void; onPin: (n: Notice) => void; onDelete: (n: Notice) => void }) {
  const color = CAT_COLORS[notice.category] ?? '#6B7280'
  return (
    <div style={{ background: 'var(--glass-bg)', border: `1px solid var(--glass-border)`, borderLeft: `3px solid ${color}`, borderRadius: 'var(--radius-lg)', padding: 'var(--space-4) var(--space-5)', marginBottom: 'var(--space-3)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 4 }}>
            <span style={{ fontSize: '0.6rem', fontWeight: 700, color, background: color + '22', padding: '2px 8px', borderRadius: 'var(--radius-full)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{notice.category}</span>
            {notice.pinned && <span style={{ fontSize: '0.7rem' }}>📌</span>}
          </div>
          <p style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>{notice.title}</p>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{notice.body}</p>
          <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 6 }}>{notice.author_name ?? 'Secretary'} · {new Date(notice.created_at).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexShrink: 0 }}>
          <button onClick={() => onPin(notice)} title={notice.pinned ? 'Unpin' : 'Pin'} style={{ width: 30, height: 30, borderRadius: 'var(--radius-md)', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', cursor: 'pointer', fontSize: '0.75rem' }}>{notice.pinned ? '📌' : '📍'}</button>
          <button onClick={() => onEdit(notice)} style={{ width: 30, height: 30, borderRadius: 'var(--radius-md)', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', cursor: 'pointer', fontSize: '0.75rem' }}>✏️</button>
          <button onClick={() => onDelete(notice)} style={{ width: 30, height: 30, borderRadius: 'var(--radius-md)', background: 'var(--danger-subtle)', border: '1px solid rgba(239,68,68,0.2)', cursor: 'pointer', fontSize: '0.75rem' }}>🗑️</button>
        </div>
      </div>
    </div>
  )
}
