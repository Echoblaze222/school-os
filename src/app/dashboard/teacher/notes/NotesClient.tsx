'use client'
// src/app/dashboard/teacher/notes/NotesClient.tsx
// FIXES:
//   1. `term` is a Postgres ENUM accepting only 'first' | 'second' | 'third' -
//      the UI was sending 'First Term' / 'Second Term' / 'Third Term' straight
//      through, which Postgres rejected with "invalid input value for enum term".
//      The dropdown still shows friendly labels; we map to the enum value only
//      when writing, and map back to a friendly label only when displaying.
//   2. Added visible error display on save failure - previously errors were
//      silently swallowed (only logged to console), so a failed save looked
//      identical to nothing happening at all.

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { BookIcon, PlusIcon, DownloadIcon, AlertIcon, XIcon, EditIcon, FileTextIcon, BookOpenIcon, PaperclipIcon } from '@/components/Icons'
import NoteBook from '@/components/NoteBook'
import DocumentViewer from '@/components/DocumentViewer'
import styles from '@/app/dashboard/student/records/page.module.css'
import { SkeletonList } from '@/components/motion/Skeleton'

interface Props { profile: any; school: any; userId: string }

interface TeacherClass {
  class_id: string
  class_name: string
  subject: string | null
  class_subject_id: string | null
}

// FIX: UI label ↔ DB enum value mapping.
// The enum `term` only accepts: 'first' | 'second' | 'third'
const TERM_OPTIONS: { label: string; value: string }[] = [
  { label: 'First Term',  value: 'first' },
  { label: 'Second Term', value: 'second' },
  { label: 'Third Term',  value: 'third' },
]
const TERM_LABEL: Record<string, string> = Object.fromEntries(TERM_OPTIONS.map(t => [t.value, t.label]))

const CURRENT_YEAR = new Date().getFullYear()
const ACADEMIC_YEAR = `${CURRENT_YEAR}/${CURRENT_YEAR + 1}`

export default function NotesClient({ profile, school, userId }: Props) {
  const [rows, setRows] = useState<any[]>([])
  const [teacherClasses, setTeacherClasses] = useState<TeacherClass[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadMode, setUploadMode] = useState<'type' | 'upload'>('type')
  const [error, setError] = useState<string | null>(null) // FIX: visible error state
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [previewBook, setPreviewBook] = useState<any>(null) // typed note preview → 3D flip-book
  const [previewDoc, setPreviewDoc] = useState<any>(null)   // uploaded file preview → in-portal viewer
  const fileRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({
    title: '',
    class_id: '',
    class_subject_id: '',
    term: 'first', // FIX: default to enum value, not the friendly label
    academic_year: ACADEMIC_YEAR,
    content: '',
  })

  const supabase = createClient()
  const sc = school?.primary_color ?? '#800020'

  useEffect(() => { loadTeacherClasses(); loadNotes() }, [])

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
    if (list[0]) {
      setForm(f => ({
        ...f,
        class_id: list[0].class_id,
        class_subject_id: list[0].class_subject_id ?? '',
      }))
    }
  }

  async function loadNotes() {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('school_notes')
      .select('id, title, description, file_url, term, academic_year, created_at, class_subject_id, uploaded_by')
      .eq('school_id', school?.id)
      .eq('uploaded_by', userId)
      .order('created_at', { ascending: false })
      .limit(40)
    if (err) console.error('[notes] load error:', err.message)
    if (data) setRows(data)
    setLoading(false)
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadedFile(file)
  }

  async function uploadFile(): Promise<string | null> {
    if (!uploadedFile) return null
    setUploading(true)
    const ext = uploadedFile.name.split('.').pop()
    const path = `${school?.id}/${userId}/${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage
      .from('notes')
      .upload(path, uploadedFile, { upsert: false })
    if (upErr) {
      console.error('[notes] upload error:', upErr.message)
      setError(`Upload failed: ${upErr.message}`)
      setUploading(false)
      return null
    }
    const { data: urlData } = supabase.storage.from('notes').getPublicUrl(path)
    setUploading(false)
    return urlData?.publicUrl ?? null
  }

  async function createNote() {
    if (!form.title) return
    if (uploadMode === 'upload' && !uploadedFile) return

    setSaving(true)
    setError(null) // FIX: clear previous error before retrying

    let fileUrl: string | null = null
    if (uploadMode === 'upload' && uploadedFile) {
      fileUrl = await uploadFile()
      if (!fileUrl) {
        setSaving(false)
        return
      }
    }

    const cls  = teacherClasses.find(c => c.class_id === form.class_id)
    const csId = cls?.class_subject_id ?? form.class_subject_id ?? null

    const { error: err } = await supabase.from('school_notes').insert({
      class_subject_id: csId,
      class_id:         form.class_id || null,
      visibility:       'class',
      title:            form.title,
      description:      uploadMode === 'type' ? form.content : null,
      file_url:         fileUrl ?? null,
      term:             form.term, // FIX: now already an enum value ('first'/'second'/'third')
      academic_year:    form.academic_year,
      uploaded_by:       userId,
      school_id:        school?.id,
    })

    if (err) {
      // FIX: surface the error to the UI instead of failing silently
      console.error('[notes] insert error:', err.message)
      setError("We couldn't save that note. Try again.")
      setSaving(false)
      return
    }

    setForm(f => ({ ...f, title: '', content: '' }))
    setUploadedFile(null)
    setShowForm(false)
    loadNotes()
    setSaving(false)
  }

  async function deleteNote(id: string) {
    if (!confirm('Delete this note?')) return
    const { error: err } = await supabase.from('school_notes').delete().eq('id', id).eq('uploaded_by', userId)
    if (err) { console.error('[notes] delete error:', err.message); setError("We couldn't delete that note. Try again."); return }
    setRows(prev => prev.filter(r => r.id !== id))
  }

  return (
    <RolePageWrapper userId={userId} role="teacher" profile={profile} school={school} title="Study Notes">

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-4)' }}>
        <button className="pressable" onClick={() => setShowForm(!showForm)}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', background: sc, color: '#fff', border: 'none', borderRadius: 999, fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
          <PlusIcon size={13} color="white" /> New Note
        </button>
      </div>

      {/* FIX: visible error banner, dismissible */}
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--danger-subtle)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, marginBottom: 'var(--space-4)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: 'var(--danger)', flex: 1 }}><AlertIcon size={14} color="var(--danger)" /> {error}</span>
          <button className="pressable" onClick={() => setError(null)} style={{ display: 'inline-flex', background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}><XIcon size={16} color="var(--danger)" /></button>
        </div>
      )}

      {showForm && (
        <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-5)', marginBottom: 'var(--space-5)' }}>
          <p style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 'var(--space-4)', fontSize: '0.9rem' }}>New Note</p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
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
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Term *</label>
              {/* FIX: option value is now the enum value; label is what the teacher sees */}
              <select value={form.term} onChange={e => setForm(f => ({ ...f, term: e.target.value }))}
                style={{ height: 40, padding: '0 12px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }}>
                {TERM_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Title *</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Chapter 5: Photosynthesis"
              style={{ height: 40, padding: '0 12px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }} />
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 'var(--space-3)' }}>
            {(['type', 'upload'] as const).map(mode => (
              <button className="pressable" key={mode} onClick={() => setUploadMode(mode)}
                style={{ flex: 1, height: 36, borderRadius: 8, border: `1px solid ${uploadMode === mode ? sc : 'var(--glass-border)'}`, background: uploadMode === mode ? sc + '20' : 'transparent', color: uploadMode === mode ? sc : 'var(--text-muted)', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
                {mode === 'type'
                  ? <><span style={{ display:'inline-flex', verticalAlign: 'middle', marginRight: 4 }}><EditIcon size={14} /></span>Type Note</>
                  : <><span style={{ display:'inline-flex', verticalAlign: 'middle', marginRight: 4 }}><FileTextIcon size={14} /></span>Upload PDF</>}
              </button>
            ))}
          </div>

          {uploadMode === 'type' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 'var(--space-3)' }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Note Content *</label>
              <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                placeholder="Write your note here..." rows={6}
                style={{ padding: '10px 12px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none', resize: 'vertical' }} />
            </div>
          ) : (
            <div style={{ marginBottom: 'var(--space-3)' }}>
              <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.ppt,.pptx" onChange={handleFileChange} style={{ display: 'none' }} />
              <button className="pressable" onClick={() => fileRef.current?.click()}
                style={{ width: '100%', height: 80, border: `2px dashed ${uploadedFile ? sc : 'var(--glass-border)'}`, borderRadius: 10, background: uploadedFile ? sc + '10' : 'transparent', color: uploadedFile ? sc : 'var(--text-muted)', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>
                {uploadedFile
                  ? <><span style={{ display:'inline-flex', verticalAlign: 'middle', marginRight: 4 }}><PaperclipIcon size={14} /></span>{uploadedFile.name}</>
                  : 'Tap to select PDF or document'}
              </button>
              {uploading && <p style={{ fontSize: '0.75rem', color: sc, marginTop: 6 }}>Uploading...</p>}
            </div>
          )}

          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button className="pressable" onClick={createNote}
              disabled={saving || !form.title || !form.class_id || (uploadMode === 'type' && !form.content) || (uploadMode === 'upload' && !uploadedFile)}
              style={{ flex: 1, height: 40, background: sc, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving...' : 'Save Note'}
            </button>
            <button className="pressable" onClick={() => { setShowForm(false); setUploadedFile(null) }}
              style={{ flex: 1, height: 40, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 8, color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? <SkeletonList count={4} variant="card" />
        : rows.length === 0
          ? <div className={styles.empty}><BookIcon size={40} color="var(--text-faint)" strokeWidth={1} /><p>No notes yet. Create your first note.</p></div>
          : <div className={styles.list}>
            {rows.map(item => (
              <div key={item.id} className={styles.card} style={{ flexDirection: 'column', gap: 'var(--space-2)', cursor: 'default' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-4)', width: '100%', cursor: 'pointer' }}
                  onClick={() => setExpanded(expanded === item.id ? null : item.id)}>
                  <div className={styles.cardIcon} style={{ background: sc + '20' }}>
                    <BookIcon size={16} color={sc} />
                  </div>
                  <div className={styles.cardBody}>
                    <p className={styles.cardTitle}>{item.title}</p>
                    {/* FIX: map stored enum value back to a friendly label for display */}
                    <p className={styles.cardMeta}>{TERM_LABEL[item.term] ?? item.term} · {item.academic_year}</p>
                    <p className={styles.cardText} style={{ fontSize: '0.7rem' }}>
                      {new Date(item.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: '0.65rem', fontWeight: 700, background: item.file_url ? 'color-mix(in srgb, var(--info) 13%, transparent)' : 'color-mix(in srgb, var(--success) 13%, transparent)', color: item.file_url ? 'var(--info)' : 'var(--success)', flexShrink: 0 }}>
                    {item.file_url ? 'PDF' : 'TEXT'}
                  </span>
                </div>
                {expanded === item.id && (
                  <div style={{ paddingLeft: 56, paddingRight: 8 }}>
                    {item.description && (
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap', marginBottom: 'var(--space-3)' }}>{item.description}</p>
                    )}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 'var(--space-2)' }}>
                      {item.description && (
                        <button className="pressable" onClick={() => setPreviewBook(item)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: sc, color: '#fff', border: 'none', borderRadius: 999, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
                          <BookOpenIcon size={13} color="#fff" /> Preview as Flip-Book
                        </button>
                      )}
                      {item.file_url && (
                        <>
                          <button className="pressable" onClick={() => setPreviewDoc(item)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: sc + '20', color: sc, border: 'none', borderRadius: 999, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
                            <FileTextIcon size={13} color={sc} /> Preview In-App
                          </button>
                          <a href={item.file_url} target="_blank" rel="noreferrer"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-muted)', borderRadius: 999, fontSize: '0.75rem', fontWeight: 700, textDecoration: 'none' }}>
                            <DownloadIcon size={13} color="var(--text-muted)" /> Download
                          </a>
                        </>
                      )}
                    </div>
                    <br />
                    <button className="pressable" onClick={() => deleteNote(item.id)}
                      style={{ marginTop: 6, padding: '5px 12px', background: 'transparent', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 999, fontWeight: 700, fontSize: '0.72rem', color: 'var(--danger)', cursor: 'pointer' }}>
                      Delete Note
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
      }
      <div className={styles.spacer} />

      {previewBook && (
        <NoteBook
          title={previewBook.title}
          content={previewBook.description || ''}
          accentColor={sc}
          onClose={() => setPreviewBook(null)}
        />
      )}
      {previewDoc && (
        <DocumentViewer
          fileUrl={previewDoc.file_url}
          title={previewDoc.title}
          accentColor={sc}
          onClose={() => setPreviewDoc(null)}
        />
      )}
    </RolePageWrapper>
  )
}
