'use client'
// src/app/dashboard/secretary/documents/DocumentsClient.tsx

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import styles from '../secretary.module.css'

const DOC_CATS = ['General', 'Admissions', 'Academic', 'Finance', 'Legal', 'HR', 'Other']
const CAT_COLORS: Record<string, string> = {
  General: '#6B7280', Admissions: '#3B82F6', Academic: '#10B981',
  Finance: '#F59E0B', Legal: '#EF4444', HR: '#8B5CF6', Other: '#EC4899',
}
const FILE_ICONS: Record<string, string> = { pdf: '📕', doc: '📘', docx: '📘', xls: '📗', xlsx: '📗', ppt: '📙', pptx: '📙', png: '🖼️', jpg: '🖼️', jpeg: '🖼️', default: '📄' }

// schema: id, school_id, title, content, category, created_by, created_at, file_url, file_size
interface Doc { id: string; title: string; category: string; file_url: string | null; file_size: number | null; created_at: string; created_by?: string }
interface Props { docs: Doc[]; profile: any; school: any; userId: string }

export default function DocumentsClient({ docs: init, profile, school, userId }: Props) {
  const [docs,    setDocs]   = useState(init)
  const [catTab,  setCatTab] = useState('all')
  const [search,  setSearch] = useState('')
  const [modal,   setModal]  = useState(false)
  const [saving,  setSaving] = useState(false)
  const [msg,     setMsg]    = useState('')
  const [form,    setForm]   = useState({ title: '', category: 'General' })
  const [file,    setFile]   = useState<File | null>(null)

  const fileRef  = useRef<HTMLInputElement>(null)
  const supabase = createClient()
  const sc       = school?.primary_color ?? '#7C3AED'

  const filtered = docs.filter(d => {
    const matchCat    = catTab === 'all' || d.category === catTab
    const matchSearch = d.title?.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  async function upload() {
    if (!file || !form.title.trim()) { setMsg('Name and file are required.'); return }
    setSaving(true); setMsg('')

    const ext  = file.name.split('.').pop() ?? 'bin'
    const path = `school_docs/${school?.id}/${Date.now()}.${ext}`

    const { error: upErr } = await supabase.storage.from('documents').upload(path, file, { upsert: false })
    if (upErr) { setMsg(upErr.message); setSaving(false); return }

    const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path)

    const { data, error } = await supabase.from('school_documents').insert({
      title: form.title,
      category: form.category,
      file_url: urlData.publicUrl,
      file_size: file.size,
      school_id: school?.id,
      created_by: userId,
    }).select().single()

    if (!error && data) { setDocs(p => [data, ...p]); setModal(false); setFile(null) }
    else setMsg(error?.message ?? 'Failed')
    setSaving(false)
  }

  async function deleteDoc(id: string) {
    await supabase.from('school_documents').delete().eq('id', id)
    setDocs(p => p.filter(d => d.id !== id))
  }

  function fileIcon(url: string | null) {
    const ext = url?.split('.')?.pop()?.toLowerCase() ?? ''
    return FILE_ICONS[ext] ?? FILE_ICONS.default
  }

  function formatSize(bytes: number | null) {
    if (!bytes) return '—'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024*1024) return `${(bytes/1024).toFixed(0)} KB`
    return `${(bytes/1024/1024).toFixed(1)} MB`
  }

  return (
    <RolePageWrapper userId={userId} role="secretary" profile={profile} school={school} title="Documents">
      <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
        <div className={styles.searchBar} style={{ flex: 1, marginBottom: 0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input className={styles.searchInput} placeholder="Search documents…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button className={styles.btnPrimary} onClick={() => { setMsg(''); setFile(null); setForm({ title: '', category: 'General' }); setModal(true) }} style={{ height: 44, padding: '0 var(--space-4)', whiteSpace: 'nowrap' }}>⬆ Upload</button>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-5)', overflowX: 'auto', paddingBottom: 4 }}>
        {['all', ...DOC_CATS].map(c => (
          <button key={c} onClick={() => setCatTab(c)}
            style={{ padding: '6px 14px', borderRadius: 'var(--radius-full)', border: '1px solid', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
              background: catTab === c ? (CAT_COLORS[c] ?? sc) + '22' : 'var(--glass-bg)',
              borderColor: catTab === c ? (CAT_COLORS[c] ?? sc) : 'var(--glass-border)',
              color: catTab === c ? (CAT_COLORS[c] ?? sc) : 'var(--text-muted)',
            }}>{c}</button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className={styles.emptyState}><p className={styles.emptyEmoji}>📁</p><p className={styles.emptyTitle}>No documents</p><p className={styles.emptyHint}>Upload school documents, forms, and policies</p></div>
      ) : (
        filtered.map(d => (
          <div key={d.id} className={styles.listItem}>
            <div className={styles.listIconBox} style={{ background: (CAT_COLORS[d.category] ?? sc) + '22' }}>
              <span style={{ fontSize: '1.3rem' }}>{fileIcon(d.file_url)}</span>
            </div>
            <div className={styles.listContent}>
              <p className={styles.listTitle}>{d.title}</p>
              <p className={styles.listSub}>{formatSize(d.file_size)} · {new Date(d.created_at).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
            </div>
            <span className={styles.listBadge} style={{ background: (CAT_COLORS[d.category] ?? '#6B7280') + '22', color: CAT_COLORS[d.category] ?? '#6B7280' }}>{d.category}</span>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              {d.file_url && (
                <a href={d.file_url} target="_blank" rel="noopener noreferrer" style={{ width: 30, height: 30, borderRadius: 'var(--radius-md)', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>⬇️</a>
              )}
              <button onClick={() => deleteDoc(d.id)} style={{ width: 30, height: 30, borderRadius: 'var(--radius-md)', background: 'var(--danger-subtle)', border: '1px solid rgba(239,68,68,0.2)', cursor: 'pointer', fontSize: '0.75rem' }}>🗑️</button>
            </div>
          </div>
        ))
      )}

      {modal && (
        <div className={styles.modalOverlay} onClick={() => setModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Upload Document</h2>
            <div className={styles.formGroup}><label className={styles.formLabel}>Document Name *</label><input className={styles.formInput} value={form.title} onChange={e => setForm(p => ({...p, title: e.target.value}))} placeholder="e.g. Admission Policy 2025" /></div>
            <div className={styles.formGroup}><label className={styles.formLabel}>Category</label>
              <select className={styles.formSelect} value={form.category} onChange={e => setForm(p => ({...p, category: e.target.value}))}>
                {DOC_CATS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>File *</label>
              <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={e => setFile(e.target.files?.[0] ?? null)} />
              <button onClick={() => fileRef.current?.click()}
                style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', width: '100%', height: 48, padding: '0 var(--space-4)', background: 'var(--glass-bg)', border: '2px dashed var(--glass-border)', borderRadius: 'var(--radius-md)', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                📎 {file ? file.name : 'Choose file…'}
              </button>
              {file && <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>{formatSize(file.size)}</p>}
            </div>
            {msg && <p style={{ fontSize: '0.78rem', color: '#EF4444', margin: '0 0 var(--space-3)' }}>{msg}</p>}
            <div className={styles.modalActions}><button className={styles.btnGhost} onClick={() => setModal(false)}>Cancel</button><button className={styles.btnPrimary} onClick={upload} disabled={saving}>{saving ? 'Uploading…' : 'Upload'}</button></div>
          </div>
        </div>
      )}
      <div style={{ height: 110 }} />
    </RolePageWrapper>
  )
}
