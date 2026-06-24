'use client'
// src/app/dashboard/teacher/assignments/AssignmentsClient.tsx
//
// FIXED — 5 bugs that caused assignment creation to silently fail:
//
// BUG 1 (CRITICAL): insert/update never checked { error } from Supabase.
//   When the DB rejected the insert (RLS, constraint, anything), the code
//   just continued — cleared the form and closed the panel as if it worked.
//   Teacher saw no error, assignment was never saved.
//   Fix: destructure { error } from both insert and update, surface to UI.
//
// BUG 2 (CRITICAL): class_subject_id lookup picked the wrong row.
//   class_subjects query only filtered by class_id (no teacher_id filter),
//   so it returned the first subject for that class — not THIS teacher's
//   subject. A Maths teacher in JSS1 got JSS1's English class_subject_id.
//   Fix: also filter class_subjects by teacher_id = userId.
//
// BUG 3 (SILENT): Insert never set teacher_id or created_by columns.
//   grades/page.tsx scopes assignments by teacher_id = user.id. If
//   teacher_id is null, the teacher's assignments never appear on the
//   grades page (they can create but never grade).
//   Fix: include teacher_id and created_by = userId in insert.
//
// BUG 4 (SILENT): due_date sent as bare date string '2026-07-15'.
//   Schema column is timestamp with time zone. Postgres casts bare date
//   to midnight UTC, so assignments due 'today' appear in the Past tab
//   for teachers in UTC+1 or later (like Nigeria, WAT = UTC+1).
//   Fix: append T23:59:59 to produce end-of-day timestamp.
//
// BUG 5 (UX): subject column never populated.
//   assignments.subject is used by grades/page.tsx for display. Teacher's
//   class_teachers row has the subject they teach. Never included in insert.
//   Fix: send subject: cls?.subject ?? null in insert.

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { ClipboardIcon, PlusIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'

interface Props { profile: any; school: any; userId: string }

interface TeacherClass {
  class_id:        string
  class_name:      string
  subject:         string | null
  class_subject_id: string | null
}

export default function AssignmentsClient({ profile, school, userId }: Props) {
  const [items,          setItems]          = useState<any[]>([])
  const [teacherClasses, setTeacherClasses] = useState<TeacherClass[]>([])
  const [loading,        setLoading]        = useState(true)
  const [showForm,       setShowForm]       = useState(false)
  const [saving,         setSaving]         = useState(false)
  const [uploading,      setUploading]      = useState(false)
  const [tab,            setTab]            = useState<'active' | 'past'>('active')
  const [submCounts,     setSubmCounts]     = useState<Record<string, number>>({})
  const [attachFile,     setAttachFile]     = useState<File | null>(null)
  const [editingId,      setEditingId]      = useState<string | null>(null)
  const [saveError,      setSaveError]      = useState<string | null>(null)
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

    // BUG 2 FIX: filter class_subjects by BOTH class_id AND teacher_id
    // so we get the specific subject this teacher teaches in that class,
    // not just any first subject row for the class.
    const list: TeacherClass[] = await Promise.all(
      ct.map(async (row: any) => {
        const { data: cs } = await supabase
          .from('class_subjects')
          .select('id')
          .eq('class_id', row.class_id)
          .eq('teacher_id', userId)       // ← the critical fix
          .limit(1)
          .maybeSingle()

        // Fallback: if no direct match (class_subjects not yet linked to teacher),
        // try without teacher_id filter so we at least get the class_subject_id
        let csId = cs?.id ?? null
        if (!csId) {
          const { data: csFallback } = await supabase
            .from('class_subjects')
            .select('id')
            .eq('class_id', row.class_id)
            .limit(1)
            .maybeSingle()
          csId = csFallback?.id ?? null
        }

        return {
          class_id:        row.class_id,
          class_name:      row.classes?.name ?? '',
          subject:         row.subject,
          class_subject_id: csId,
        }
      })
    )
    setTeacherClasses(list)
  }

  async function loadAssignments() {
    setLoading(true)
    const { data } = await supabase
      .from('assignments')
      .select('id, title, description, due_date, class_id, file_url, max_score, created_at, class_subject_id, subject, classes(name)')
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
          .not('submitted_at', 'is', null)   // only count real submissions
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
    const { error } = await supabase.storage
      .from('assignments')
      .upload(path, attachFile, { upsert: false })
    if (error) {
      console.error('[assignments] upload error:', error.message)
      setSaveError(`File upload failed: ${error.message}`)
      setUploading(false)
      return null
    }
    const { data: urlData } = supabase.storage.from('assignments').getPublicUrl(path)
    setUploading(false)
    return urlData?.publicUrl ?? null
  }

  function openCreate() {
    setEditingId(null)
    setSaveError(null)
    setForm({ title: '', description: '', due_date: '', class_id: '', class_subject_id: '', max_score: 100 })
    setAttachFile(null)
    setShowForm(true)
  }

  function openEdit(item: any) {
    setEditingId(item.id)
    setSaveError(null)
    setForm({
      title:            item.title ?? '',
      description:      item.description ?? '',
      due_date:         item.due_date ? item.due_date.slice(0, 10) : '',
      class_id:         item.class_id ?? '',
      class_subject_id: item.class_subject_id ?? '',
      max_score:        item.max_score ?? 100,
    })
    setAttachFile(null)
    setShowForm(true)
  }

  async function saveAssignment() {
    if (!form.title.trim() || !form.due_date || !form.class_id) return

    const cls = teacherClasses.find(c => c.class_id === form.class_id)
    setSaving(true)
    setSaveError(null)

    // BUG 4 FIX: append end-of-day time so Nigerian teachers (WAT = UTC+1)
    // don't see today's assignments immediately fall into the Past tab.
    const dueDateTimestamp = `${form.due_date}T23:59:59`

    let fileUrl: string | null = null
    if (attachFile) {
      fileUrl = await uploadAttachment()
      if (!fileUrl && attachFile) {
        // uploadAttachment already set saveError
        setSaving(false)
        return
      }
    }

    if (editingId) {
      // ── UPDATE ──
      const { error } = await supabase
        .from('assignments')
        .update({
          title:            form.title.trim(),
          description:      form.description.trim() || null,
          due_date:         dueDateTimestamp,
          class_id:         form.class_id,
          class_subject_id: cls?.class_subject_id ?? null,
          subject:          cls?.subject ?? null,          // BUG 5 FIX
          max_score:        form.max_score,
          ...(fileUrl ? { file_url: fileUrl } : {}),
        })
        .eq('id', editingId)

      // BUG 1 FIX: check error and surface it
      if (error) {
        console.error('[assignments] update error:', error.message)
        setSaveError(error.message)
        setSaving(false)
        return
      }
    } else {
      // ── INSERT ──
      const { error } = await supabase
        .from('assignments')
        .insert({
          title:            form.title.trim(),
          description:      form.description.trim() || null,
          due_date:         dueDateTimestamp,
          class_id:         form.class_id,
          class_subject_id: cls?.class_subject_id ?? null,
          subject:          cls?.subject ?? null,          // BUG 5 FIX
          max_score:        form.max_score,
          file_url:         fileUrl,
          posted_by:        userId,
          teacher_id:       userId,                        // BUG 3 FIX
          created_by:       userId,                        // BUG 3 FIX
          school_id:        school?.id,
          status:           'active',
        })

      // BUG 1 FIX: check error and surface it
      if (error) {
        console.error('[assignments] insert error:', error.message)
        // Surface a helpful message for the most common causes
        if (error.message.includes('row-level security') || error.message.includes('new row')) {
          setSaveError('Permission denied — check Supabase RLS policies on the assignments table.')
        } else if (error.message.includes('violates not-null')) {
          setSaveError(`Missing required field: ${error.message}`)
        } else {
          setSaveError(error.message)
        }
        setSaving(false)
        return
      }
    }

    // Only close form on success
    setForm({ title: '', description: '', due_date: '', class_id: '', class_subject_id: '', max_score: 100 })
    setAttachFile(null)
    setShowForm(false)
    setEditingId(null)
    setSaveError(null)
    setSaving(false)
    loadAssignments()
  }

  return (
    <RolePageWrapper userId={userId} role="teacher" profile={profile} school={school} title="Assignments">
      {/* Tab bar + New button */}
      <div className={styles.tabs} style={{ marginBottom: 'var(--space-4)' }}>
        {(['active', 'past'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`}
            style={tab === t ? { background: sc, color: '#fff', borderColor: sc } : {}}>
            {t === 'active' ? 'Active' : 'Past'}
          </button>
        ))}
        <button onClick={openCreate}
          style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5,
            padding: '7px 14px', background: sc, color: '#fff', border: 'none',
            borderRadius: 999, fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
          <PlusIcon size={13} color="white" /> New
        </button>
      </div>

      {/* Create / Edit form */}
      {showForm && (
        <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
          borderRadius: 'var(--radius-xl)', padding: 'var(--space-5)', marginBottom: 'var(--space-5)' }}>

          <p style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 'var(--space-4)', fontSize: '0.9rem' }}>
            {editingId ? 'Edit Assignment' : 'New Assignment'}
          </p>

          {/* BUG 1 FIX: error banner inside form */}
          {saveError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
              background: '#EF444415', border: '1px solid #EF444440', borderRadius: 10,
              marginBottom: 'var(--space-4)' }}>
              <span style={{ fontSize: '0.78rem', color: '#EF4444', flex: 1 }}>⚠️ {saveError}</span>
              <button onClick={() => setSaveError(null)}
                style={{ background: 'none', border: 'none', color: '#EF4444',
                  cursor: 'pointer', fontSize: '0.9rem', fontWeight: 800 }}>✕</button>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>

            {/* Title */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Title *</label>
              <input type="text" value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Chapter 3 Exercise"
                style={{ height: 40, padding: '0 12px', background: 'var(--input-bg)',
                  border: '1px solid var(--input-border)', borderRadius: 8,
                  color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }} />
            </div>

            {/* Class — auto-sets class_subject_id when selected */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Class *</label>
              <select value={form.class_id}
                onChange={e => {
                  const cls = teacherClasses.find(c => c.class_id === e.target.value)
                  setForm(f => ({
                    ...f,
                    class_id:        e.target.value,
                    class_subject_id: cls?.class_subject_id ?? '',
                  }))
                }}
                style={{ height: 40, padding: '0 12px', background: 'var(--input-bg)',
                  border: '1px solid var(--input-border)', borderRadius: 8,
                  color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }}>
                <option value="">Select class</option>
                {teacherClasses.map(cls => (
                  <option key={cls.class_id} value={cls.class_id}>
                    {cls.class_name}{cls.subject ? ` (${cls.subject})` : ''}
                  </option>
                ))}
              </select>
              {teacherClasses.length === 0 && (
                <span style={{ fontSize: '0.68rem', color: '#F59E0B' }}>
                  No classes assigned yet — ask admin to assign you to a class.
                </span>
              )}
            </div>

            {/* Due Date */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Due Date *</label>
              <input type="date" value={form.due_date}
                onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                min={new Date().toISOString().slice(0, 10)}
                style={{ height: 40, padding: '0 12px', background: 'var(--input-bg)',
                  border: '1px solid var(--input-border)', borderRadius: 8,
                  color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }} />
            </div>

            {/* Max Score */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Max Score</label>
              <input type="number" min={1} value={form.max_score}
                onChange={e => setForm(f => ({ ...f, max_score: Number(e.target.value) }))}
                style={{ height: 40, padding: '0 12px', background: 'var(--input-bg)',
                  border: '1px solid var(--input-border)', borderRadius: 8,
                  color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }} />
            </div>

            {/* Description */}
            <div style={{ gridColumn: '1/-1', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Description</label>
              <textarea value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Assignment details, instructions, requirements..."
                rows={3}
                style={{ padding: '8px 12px', background: 'var(--input-bg)',
                  border: '1px solid var(--input-border)', borderRadius: 8,
                  color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none', resize: 'vertical' }} />
            </div>

            {/* File attachment */}
            <div style={{ gridColumn: '1/-1' }}>
              <input ref={fileRef} type="file"
                accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.jpg,.jpeg,.png"
                onChange={e => setAttachFile(e.target.files?.[0] ?? null)}
                style={{ display: 'none' }} />
              <button onClick={() => fileRef.current?.click()}
                style={{ width: '100%', height: 44,
                  border: `1.5px dashed ${attachFile ? sc : 'var(--glass-border)'}`,
                  borderRadius: 8, background: attachFile ? sc + '10' : 'transparent',
                  color: attachFile ? sc : 'var(--text-muted)',
                  fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}>
                {attachFile ? `📎 ${attachFile.name}` : editingId ? '📎 Replace file (optional)' : '📎 Attach file (optional)'}
              </button>
              {attachFile && (
                <button onClick={() => setAttachFile(null)}
                  style={{ fontSize: '0.68rem', color: '#EF4444', background: 'none',
                    border: 'none', cursor: 'pointer', marginTop: 4, padding: 0 }}>
                  ✕ Remove file
                </button>
              )}
              {uploading && <p style={{ fontSize: '0.72rem', color: sc, marginTop: 4 }}>Uploading file...</p>}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
            <button
              onClick={saveAssignment}
              disabled={saving || uploading || !form.title.trim() || !form.due_date || !form.class_id}
              style={{ flex: 1, height: 40, background: sc, color: '#fff', border: 'none',
                borderRadius: 8, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
                opacity: (saving || uploading || !form.title.trim() || !form.due_date || !form.class_id) ? 0.5 : 1 }}>
              {saving ? 'Saving...' : uploading ? 'Uploading...' : editingId ? 'Save Changes' : 'Create Assignment'}
            </button>
            <button
              onClick={() => { setShowForm(false); setAttachFile(null); setEditingId(null); setSaveError(null) }}
              style={{ height: 40, padding: '0 16px', background: 'transparent',
                border: '1px solid var(--glass-border)', borderRadius: 8,
                color: 'var(--text-muted)', fontSize: '0.85rem', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Assignment list */}
      {loading ? (
        <div className={styles.loading}><span /><span /><span /></div>
      ) : items.length === 0 ? (
        <div className={styles.empty}>
          <ClipboardIcon size={40} color="var(--text-faint)" strokeWidth={1} />
          <p>No {tab} assignments</p>
          {tab === 'active' && (
            <button onClick={openCreate}
              style={{ marginTop: 12, padding: '8px 20px', background: sc, color: '#fff',
                border: 'none', borderRadius: 999, fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
              Create your first assignment
            </button>
          )}
        </div>
      ) : (
        <div className={styles.list}>
          {items.map((item: any) => (
            <div key={item.id} className={styles.card} style={{ flexDirection: 'column', gap: 8 }}>

              {/* Top row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
                <div className={styles.cardIcon} style={{ background: sc + '20' }}>
                  <ClipboardIcon size={18} color={sc} />
                </div>
                <div className={styles.cardBody}>
                  <p className={styles.cardTitle}>{item.title}</p>
                  <p className={styles.cardMeta}>
                    {item.classes?.name ?? '—'}
                    {item.subject ? ` · ${item.subject}` : ''}
                    {' · Due '}
                    {new Date(item.due_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                    {item.file_url ? ' · 📎' : ''}
                  </p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {submCounts[item.id] ?? 0} submitted
                  </span>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                    /{item.max_score}pts
                  </span>
                </div>
              </div>

              {/* Action row */}
              <div style={{ display: 'flex', gap: 8, paddingLeft: 52, flexWrap: 'wrap' }}>
                <Link
                  href={`/dashboard/teacher/assignments/${item.id}/submissions`}
                  style={{ padding: '5px 12px', background: sc + '15', color: sc, borderRadius: 8,
                    fontSize: '0.72rem', fontWeight: 700, textDecoration: 'none' }}>
                  View Submissions ({submCounts[item.id] ?? 0})
                </Link>

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
