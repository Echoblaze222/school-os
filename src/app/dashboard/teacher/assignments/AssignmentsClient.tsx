'use client'
// FIXED: added View Submissions link, View/Edit details per assignment
// FIXED: posted_by (not teacher_id), class_subject_id resolved from class_teachers

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { ClipboardIcon, PlusIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'

interface Props { profile: any; school: any; userId: string }

interface TeacherClass {
  class_id: string
  class_name: string
  subject: string | null
  class_subject_id: string | null
}

export default function AssignmentsClient({ profile, school, userId }: Props) {
  const [items,         setItems]         = useState<any[]>([])
  const [teacherClasses, setTeacherClasses] = useState<TeacherClass[]>([])
  const [loading,       setLoading]       = useState(true)
  const [showForm,      setShowForm]      = useState(false)
  const [saving,        setSaving]        = useState(false)
  const [uploading,     setUploading]     = useState(false)
  const [tab,           setTab]           = useState<'active' | 'past'>('active')
  const [submCounts,    setSubmCounts]    = useState<Record<string, number>>({})
  const [attachFile,    setAttachFile]    = useState<File | null>(null)
  const [editingId,     setEditingId]     = useState<string | null>(null) // assignment being edited
  const fileRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({
    title: '', description: '', due_date: '',
    class_id: '', class_subject_id: '', max_score: 100,
  })
  const searchParams = useSearchParams()
  const supabase = createClient()
  const sc = school?.primary_color ?? '#7C3AED'

  useEffect(() => { loadTeacherClasses() }, [])
  useEffect(() => { loadAssignments() }, [tab])

  useEffect(() => {
    const classId = searchParams.get('class_id')
    if (classId) {
      setForm(prev => ({ ...prev, class_id: classId }))
      setShowForm(true)
    }
  }, [searchParams])

  async function loadTeacherClasses() {
    const { data: ct } = await supabase
      .from('class_teachers')
      .select('class_id, subject, classes(name)')
      .eq('teacher_id', userId)
      .eq('school_id', school?.id)

    if (!ct?.length) return

    const list: TeacherClass[] = await Promise.all(
      ct.map(async (row: any) => {
        const { data: cs } = await supabase
          .from('class_subjects')
          .select('id')
          .eq('class_id', row.class_id)
          .limit(1)
          .maybeSingle()
        return {
          class_id: row.class_id,
          class_name: row.classes?.name ?? '',
          subject: row.subject,
          class_subject_id: cs?.id ?? null,
        }
      })
    )
    setTeacherClasses(list)
  }

  async function loadAssignments() {
    setLoading(true)
    const { data } = await supabase
      .from('assignments')
      .select('id, title, description, due_date, class_id, file_url, max_score, created_at, class_subject_id, classes(name)')
      .eq('posted_by', userId)
      .eq('school_id', school?.id)
      .order('due_date', { ascending: tab === 'active' })
    if (data) {
      const now = new Date()
      const filtered = tab === 'active'
        ? data.filter((a: any) => new Date(a.due_date) >= now)
        : data.filter((a: any) => new Date(a.due_date) < now)
      setItems(filtered)

      const ids = filtered.map((a: any) => a.id)
      if (ids.length) {
        const { data: subs } = await supabase
          .from('assignment_submissions')
          .select('assignment_id')
          .in('assignment_id', ids)
        if (subs) {
          const counts: Record<string, number> = {}
          subs.forEach((s: any) => { counts[s.assignment_id] = (counts[s.assignment_id] ?? 0) + 1 })
          setSubmCounts(counts)
        }
      }
    }
    setLoading(false)
  }

  async function uploadAttachment(): Promise<string | null> {
    if (!attachFile) return null
    setUploading(true)
    const ext  = attachFile.name.split('.').pop()
    const path = `${school?.id}/assignments/${userId}/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('assignments').upload(path, attachFile, { upsert: false })
    if (error) { console.error('Upload error:', error); setUploading(false); return null }
    const { data: urlData } = supabase.storage.from('assignments').getPublicUrl(path)
    setUploading(false)
    return urlData?.publicUrl ?? null
  }

  function openCreate() {
    setEditingId(null)
    setForm({ title: '', description: '', due_date: '', class_id: '', class_subject_id: '', max_score: 100 })
    setAttachFile(null)
    setShowForm(true)
  }

  function openEdit(item: any) {
    setEditingId(item.id)
    setForm({
      title:           item.title ?? '',
      description:     item.description ?? '',
      due_date:        item.due_date ? item.due_date.slice(0, 10) : '',
      class_id:        item.class_id ?? '',
      class_subject_id: item.class_subject_id ?? '',
      max_score:       item.max_score ?? 100,
    })
    setAttachFile(null)
    setShowForm(true)
  }

  async function saveAssignment() {
    if (!form.title || !form.due_date || !form.class_id) return
    const cls = teacherClasses.find(c => c.class_id === form.class_id)
    setSaving(true)

    let fileUrl: string | null = null
    if (attachFile) fileUrl = await uploadAttachment()

    if (editingId) {
      // Update existing
      await supabase.from('assignments').update({
        title:           form.title,
        description:     form.description,
        due_date:        form.due_date,
        class_id:        form.class_id,
        class_subject_id: cls?.class_subject_id ?? null,
        max_score:       form.max_score,
        ...(fileUrl ? { file_url: fileUrl } : {}), // only overwrite file_url if a new file was chosen
      }).eq('id', editingId)
    } else {
      // Create new
      await supabase.from('assignments').insert({
        title:           form.title,
        description:     form.description,
        due_date:        form.due_date,
        class_id:        form.class_id,
        class_subject_id: cls?.class_subject_id ?? null,
        max_score:       form.max_score,
        file_url:        fileUrl,
        posted_by:       userId,
        school_id:       school?.id,
      })
    }

    setForm({ title: '', description: '', due_date: '', class_id: '', class_subject_id: '', max_score: 100 })
    setAttachFile(null)
    setShowForm(false)
    setEditingId(null)
    loadAssignments()
    setSaving(false)
  }

  return (
    <RolePageWrapper userId={userId} role="teacher" profile={profile} school={school} title="Assignments">
      <div className={styles.tabs} style={{ marginBottom: 'var(--space-4)' }}>
        {(['active', 'past'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`}
            style={tab === t ? { background: sc, color: '#fff', borderColor: sc } : {}}>
            {t === 'active' ? 'Active' : 'Past'}
          </button>
        ))}
        <button onClick={openCreate}
          style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px',
            background: sc, color: '#fff', border: 'none', borderRadius: 999, fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
          <PlusIcon size={13} color="white" /> New
        </button>
      </div>

      {showForm && (
        <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-5)', marginBottom: 'var(--space-5)' }}>
          <p style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 'var(--space-4)', fontSize: '0.9rem' }}>
            {editingId ? 'Edit Assignment' : 'New Assignment'}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Title *</label>
              <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Chapter 3 Exercise"
                style={{ height: 40, padding: '0 12px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Class *</label>
              <select value={form.class_id}
                onChange={e => {
                  const cls = teacherClasses.find(c => c.class_id === e.target.value)
                  setForm(f => ({ ...f, class_id: e.target.value, class_subject_id: cls?.class_subject_id ?? '' }))
                }}
                style={{ height: 40, padding: '0 12px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }}>
                <option value="">Select class</option>
                {teacherClasses.map(cls => (
                  <option key={cls.class_id} value={cls.class_id}>
                    {cls.class_name}{cls.subject ? ` (${cls.subject})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Due Date *</label>
              <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                style={{ height: 40, padding: '0 12px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Max Score</label>
              <input type="number" min={1} value={form.max_score} onChange={e => setForm(f => ({ ...f, max_score: Number(e.target.value) }))}
                style={{ height: 40, padding: '0 12px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }} />
            </div>

            <div style={{ gridColumn: '1/-1', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Description</label>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Assignment details..." rows={3}
                style={{ padding: '8px 12px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none', resize: 'vertical' }} />
            </div>

            <div style={{ gridColumn: '1/-1' }}>
              <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.txt"
                onChange={e => setAttachFile(e.target.files?.[0] ?? null)} style={{ display: 'none' }} />
              <button onClick={() => fileRef.current?.click()}
                style={{ width: '100%', height: 44, border: `1.5px dashed ${attachFile ? sc : 'var(--glass-border)'}`,
                  borderRadius: 8, background: attachFile ? sc + '10' : 'transparent',
                  color: attachFile ? sc : 'var(--text-muted)', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}>
                {attachFile ? `📎 ${attachFile.name}` : editingId ? '📎 Replace file (optional)' : '📎 Attach file (optional)'}
              </button>
              {uploading && <p style={{ fontSize: '0.72rem', color: sc, marginTop: 4 }}>Uploading...</p>}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
            <button onClick={saveAssignment} disabled={saving || !form.title || !form.due_date || !form.class_id}
              style={{ flex: 1, height: 40, background: sc, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Create Assignment'}
            </button>
            <button onClick={() => { setShowForm(false); setAttachFile(null); setEditingId(null) }}
              style={{ height: 40, padding: '0 16px', background: 'transparent', border: '1px solid var(--glass-border)', borderRadius: 8, color: 'var(--text-muted)', fontSize: '0.85rem', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className={styles.loading}><span /><span /><span /></div>
      ) : items.length === 0 ? (
        <div className={styles.empty}>
          <ClipboardIcon size={40} color="var(--text-faint)" strokeWidth={1} />
          <p>No {tab} assignments</p>
        </div>
      ) : (
        <div className={styles.list}>
          {items.map((item: any) => (
            <div key={item.id} className={styles.card} style={{ flexDirection: 'column', gap: 8 }}>
              {/* ── Top row ── */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
                <div className={styles.cardIcon} style={{ background: sc + '20' }}>
                  <ClipboardIcon size={18} color={sc} />
                </div>
                <div className={styles.cardBody}>
                  <p className={styles.cardTitle}>{item.title}</p>
                  <p className={styles.cardMeta}>
                    {item.classes?.name ?? '—'}
                    {' · Due '}{new Date(item.due_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                    {item.file_url ? ' · 📎' : ''}
                  </p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {submCounts[item.id] ?? 0} submitted
                  </span>
                </div>
              </div>

              {/* ── Action row ── */}
              <div style={{ display: 'flex', gap: 8, paddingLeft: 52, flexWrap: 'wrap' }}>
                {/* FIXED: link to submissions page */}
                <Link href={`/dashboard/teacher/assignments/${item.id}/submissions`}
                  style={{ padding: '5px 12px', background: sc + '15', color: sc, borderRadius: 8,
                    fontSize: '0.72rem', fontWeight: 700, textDecoration: 'none' }}>
                  View Submissions ({submCounts[item.id] ?? 0})
                </Link>

                {/* FIXED: edit button */}
                <button onClick={() => openEdit(item)}
                  style={{ padding: '5px 12px', background: 'var(--glass-bg)', color: 'var(--text-secondary)',
                    border: '1px solid var(--glass-border)', borderRadius: 8,
                    fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}>
                  Edit
                </button>

                {item.file_url && (
                  <a href={item.file_url} target="_blank" rel="noreferrer"
                    style={{ padding: '5px 12px', background: 'var(--glass-bg)', color: 'var(--text-muted)',
                      border: '1px solid var(--glass-border)', borderRadius: 8,
                      fontSize: '0.72rem', fontWeight: 700, textDecoration: 'none' }}>
                    📎 View File
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ height: 100 }} />
    </RolePageWrapper>
  )
}
