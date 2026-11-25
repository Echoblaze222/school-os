'use client'
// src/components/TeacherBooks.tsx
//
// Teacher "Books" tab. A book belongs to one subject, is shared with one or more of
// the teacher's classes, and holds topics (typed/pasted notes or an uploaded
// PDF/Word/PowerPoint file). Students see a book only when it is published and
// shared with their class. Data goes through /api/notebooks (checked server-side);
// only file uploads use the browser's storage client, same as the old notes.
//
// Needs sql/migrations/2026-11-22-note-books.sql.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import NoteBook from '@/components/NoteBook'
import NoteEditor from '@/components/NoteEditor'
import { api, downloadBookPdf } from '@/lib/notebooks/client'
import { SkeletonList } from '@/components/motion/Skeleton'
import styles from './Books.module.css'

interface Props { school: any; userId: string; accent: string }
interface TeacherClass { class_id: string; class_name: string; subject: string | null }
interface BookSummary {
  id: string; title: string; subject_name: string | null; description: string | null; cover_color: string | null
  academic_year: string | null; is_published: boolean; entry_count: number; class_names: string[]
}
interface Entry { id: string; title: string; content: string | null; file_url: string | null; file_name: string | null }

const YEAR = new Date().getFullYear()
const DEFAULT_YEAR = `${YEAR}/${YEAR + 1}`
const COLORS = ['#800020', '#1D4ED8', '#047857', '#B45309', '#7C3AED', '#0F766E', '#BE185D', '#374151']
const MAX_FILE_MB = 20

export default function TeacherBooks({ school, userId, accent }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [classes, setClasses] = useState<TeacherClass[]>([])
  const [books, setBooks] = useState<BookSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<{ mode: 'list' } | { mode: 'new' } | { mode: 'book'; id: string }>({ mode: 'list' })

  const loadBooks = useCallback(async () => {
    setLoading(true)
    const r = await api<{ books: BookSummary[] }>('/api/notebooks')
    if (r.ok) { setBooks(r.data.books); setError(null) } else setError(r.error)
    setLoading(false)
  }, [])

  useEffect(() => {
    loadBooks()
    ;(async () => {
      const { data } = await supabase.from('class_teachers').select('class_id, subject, classes(name)')
        .eq('teacher_id', userId).eq('school_id', school?.id)
      const seen = new Set<string>()
      const list: TeacherClass[] = []
      for (const r of (data ?? []) as any[]) {
        if (seen.has(r.class_id)) continue
        seen.add(r.class_id)
        list.push({ class_id: r.class_id, class_name: r.classes?.name ?? 'Class', subject: r.subject ?? null })
      }
      setClasses(list)
    })()
  }, [loadBooks, supabase, userId, school?.id])

  const errorBox = error && (
    <div className={styles.error} role="alert">
      <span>{error}</span>
      <button type="button" onClick={() => setError(null)} aria-label="Dismiss">{'\u2715'}</button>
    </div>
  )

  if (view.mode === 'new') {
    return (
      <>
        {errorBox}
        <NewBookForm
          classes={classes} accent={accent}
          onCancel={() => setView({ mode: 'list' })}
          onCreated={id => { loadBooks(); setView({ mode: 'book', id }) }}
          onError={setError}
        />
      </>
    )
  }

  if (view.mode === 'book') {
    return (
      <>
        {errorBox}
        <BookEditor
          bookId={view.id} classes={classes} accent={accent} school={school} userId={userId} supabase={supabase}
          onBack={() => { loadBooks(); setView({ mode: 'list' }) }}
          onError={setError}
        />
      </>
    )
  }

  return (
    <>
      {errorBox}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} style={{ background: accent }}
          onClick={() => setView({ mode: 'new' })} disabled={classes.length === 0}>
          + New Book
        </button>
      </div>
      {classes.length === 0 && !loading && (
        <p className={styles.hint} style={{ marginBottom: 12 }}>You are not assigned to a class yet, so you cannot create a book.</p>
      )}
      {loading ? <SkeletonList count={3} variant="card" /> : books.length === 0 ? (
        <div className={styles.empty}><p>No books yet. Create one for a subject, then add topics to it.</p></div>
      ) : (
        <div className={styles.list}>
          {books.map(b => (
            <button key={b.id} type="button" className={styles.bookCard} onClick={() => setView({ mode: 'book', id: b.id })}>
              <span className={styles.spine} style={{ background: b.cover_color || accent }} />
              <span className={styles.bookBody}>
                <span className={styles.bookTitle}>{b.title}</span>
                <span className={styles.bookMeta}>
                  {[b.subject_name, b.academic_year, `${b.entry_count} topic${b.entry_count === 1 ? '' : 's'}`].filter(Boolean).join(' \u00B7 ')}
                </span>
                <span className={styles.chips}>
                  <span className={`${styles.chip} ${b.is_published ? styles.badgeLive : styles.badgeDraft}`}>{b.is_published ? 'Published' : 'Draft'}</span>
                  {b.class_names.map(n => <span key={n} className={styles.chip}>{n}</span>)}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  )
}

/* ------------------------------ new book ------------------------------ */

function ClassPicker({ classes, value, onChange, accent }: { classes: TeacherClass[]; value: string[]; onChange: (v: string[]) => void; accent: string }) {
  return (
    <div className={styles.checkRow}>
      {classes.map(c => {
        const on = value.includes(c.class_id)
        return (
          <button key={c.class_id} type="button" aria-pressed={on}
            className={`${styles.checkItem} ${on ? styles.checkItemOn : ''}`} style={on ? { background: accent } : undefined}
            onClick={() => onChange(on ? value.filter(x => x !== c.class_id) : [...value, c.class_id])}>
            {c.class_name}{c.subject ? ` (${c.subject})` : ''}
          </button>
        )
      })}
    </div>
  )
}

function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className={styles.swatches}>
      {COLORS.map(c => (
        <button key={c} type="button" aria-label={`Cover colour ${c}`} aria-pressed={value === c}
          className={`${styles.swatch} ${value === c ? styles.swatchOn : ''}`} style={{ background: c }} onClick={() => onChange(c)} />
      ))}
    </div>
  )
}

function NewBookForm({ classes, accent, onCancel, onCreated, onError }: {
  classes: TeacherClass[]; accent: string; onCancel: () => void; onCreated: (id: string) => void; onError: (m: string) => void
}) {
  const [title, setTitle] = useState('')
  const [subject, setSubject] = useState(classes[0]?.subject ?? '')
  const [description, setDescription] = useState('')
  const [year, setYear] = useState(DEFAULT_YEAR)
  const [color, setColor] = useState(COLORS.includes(accent) ? accent : COLORS[0])
  const [classIds, setClassIds] = useState<string[]>(classes[0] ? [classes[0].class_id] : [])
  const [saving, setSaving] = useState(false)

  async function create() {
    setSaving(true)
    const r = await api<{ id: string }>('/api/notebooks', {
      method: 'POST',
      body: JSON.stringify({ title, subject_name: subject, description, academic_year: year, cover_color: color, class_ids: classIds }),
    })
    setSaving(false)
    if (r.ok) onCreated(r.data.id); else onError(r.error)
  }

  return (
    <div className={styles.panel}>
      <p className={styles.panelTitle}>New Book</p>
      <div className={styles.field}>
        <label className={styles.label}>Book name *</label>
        <input className={styles.input} value={title} maxLength={120} onChange={e => setTitle(e.target.value)} placeholder="e.g. Chemistry for JSS3" />
      </div>
      <div className={styles.field}>
        <label className={styles.label}>Subject</label>
        <input className={styles.input} value={subject} maxLength={80} onChange={e => setSubject(e.target.value)} placeholder="e.g. Chemistry" />
      </div>
      <div className={styles.field}>
        <label className={styles.label}>Share with class(es) *</label>
        <ClassPicker classes={classes} value={classIds} onChange={setClassIds} accent={accent} />
        <p className={styles.hint}>Students see this book while they are in these classes. When they are promoted, they will see the new class&apos;s books instead, and keep this one under Earlier classes.</p>
      </div>
      <div className={styles.field}>
        <label className={styles.label}>Session</label>
        <input className={styles.input} value={year} maxLength={20} onChange={e => setYear(e.target.value)} />
      </div>
      <div className={styles.field}>
        <label className={styles.label}>About this book</label>
        <textarea className={styles.textarea} rows={2} value={description} maxLength={600} onChange={e => setDescription(e.target.value)} />
      </div>
      <div className={styles.field}>
        <label className={styles.label}>Cover colour</label>
        <ColorPicker value={color} onChange={setColor} />
      </div>
      <div className={styles.btnRow}>
        <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} style={{ background: accent }}
          disabled={saving || !title.trim() || classIds.length === 0} onClick={create}>
          {saving ? 'Creating...' : 'Create book'}
        </button>
        <button type="button" className={styles.btn} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

/* ------------------------------ book editor ------------------------------ */

function BookEditor({ bookId, classes, accent, school, userId, supabase, onBack, onError }: {
  bookId: string; classes: TeacherClass[]; accent: string; school: any; userId: string; supabase: any
  onBack: () => void; onError: (m: string) => void
}) {
  const [book, setBook] = useState<any>(null)
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [reading, setReading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [sharing, setSharing] = useState<string[] | null>(null)
  const [editing, setEditing] = useState<'none' | 'new' | string>('none')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const r = await api<{ book: any; entries: Entry[] }>(`/api/notebooks/${bookId}`)
    if (r.ok) { setBook(r.data.book); setEntries(r.data.entries) } else onError(r.error)
    setLoading(false)
  }, [bookId, onError])
  useEffect(() => { load() }, [load])

  const color = book?.cover_color || accent

  async function patchBook(patch: Record<string, unknown>) {
    setBusy(true)
    const r = await api(`/api/notebooks/${bookId}`, { method: 'PATCH', body: JSON.stringify(patch) })
    setBusy(false)
    if (r.ok) await load(); else onError(r.error)
    return r.ok
  }

  async function removeBook() {
    if (!confirm('Delete this whole book and all its topics?')) return
    const r = await api(`/api/notebooks/${bookId}`, { method: 'DELETE' })
    if (r.ok) onBack(); else onError(r.error)
  }

  async function move(index: number, dir: -1 | 1) {
    const next = [...entries]
    const j = index + dir
    if (j < 0 || j >= next.length) return
    ;[next[index], next[j]] = [next[j], next[index]]
    setEntries(next)
    const r = await api(`/api/notebooks/${bookId}/entries`, { method: 'PATCH', body: JSON.stringify({ order: next.map(e => e.id) }) })
    if (!r.ok) { onError(r.error); load() }
  }

  async function removeEntry(id: string) {
    if (!confirm('Delete this topic?')) return
    const r = await api(`/api/notebooks/${bookId}/entries?entry_id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (r.ok) load(); else onError(r.error)
  }

  async function download() {
    setDownloading(true)
    const err = await downloadBookPdf(bookId, book.title)
    setDownloading(false)
    if (err) onError(err)
  }

  if (loading) return <SkeletonList count={2} variant="card" />
  if (!book) return <button type="button" className={styles.btn} onClick={onBack}>Back</button>

  const shared: string[] = sharing ?? book.class_ids
  const editingEntry = editing !== 'none' && editing !== 'new' ? entries.find(e => e.id === editing) ?? null : null

  return (
    <>
      <button type="button" className={`${styles.btn} ${styles.btnSmall}`} onClick={onBack} style={{ marginBottom: 12 }}>{'\u2190'} All books</button>

      <div className={styles.panel} style={{ borderLeft: `6px solid ${color}` }}>
        <p className={styles.panelTitle}>{book.title}</p>
        <p className={styles.bookMeta} style={{ marginBottom: 10 }}>
          {[book.subject_name, book.academic_year].filter(Boolean).join(' \u00B7 ')}{' '}
          <span className={`${styles.chip} ${book.is_published ? styles.badgeLive : styles.badgeDraft}`}>{book.is_published ? 'Published' : 'Draft'}</span>
        </p>
        <div className={styles.btnRow}>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} style={{ background: color }} onClick={() => setReading(true)} disabled={entries.length === 0}>Open as book</button>
          <button type="button" className={styles.btn} onClick={download} disabled={downloading || entries.length === 0}>{downloading ? 'Preparing...' : 'Download PDF'}</button>
          <button type="button" className={styles.btn} disabled={busy} onClick={() => patchBook({ is_published: !book.is_published })}>
            {book.is_published ? 'Unpublish' : 'Publish to students'}
          </button>
        </div>
        {!book.is_published && <p className={styles.hint}>Students cannot see this book until you publish it.</p>}
      </div>

      <div className={styles.panel}>
        <p className={styles.panelTitle}>Shared with</p>
        <ClassPicker classes={classes} value={shared} onChange={setSharing} accent={color} />
        <p className={styles.hint}>Teaching the same subject to a new class or next session? Add that class here instead of making a new book.</p>
        {sharing && (
          <div className={styles.btnRow} style={{ marginTop: 10 }}>
            <button type="button" className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSmall}`} style={{ background: color }}
              disabled={busy || sharing.length === 0} onClick={async () => { if (await patchBook({ class_ids: sharing })) setSharing(null) }}>
              Save classes
            </button>
            <button type="button" className={`${styles.btn} ${styles.btnSmall}`} onClick={() => setSharing(null)}>Cancel</button>
          </div>
        )}
      </div>

      <div className={styles.panel}>
        <p className={styles.panelTitle}>Topics ({entries.length})</p>
        {entries.length === 0 && <p className={styles.hint}>No topics yet. Add the first one below.</p>}
        {entries.map((e, i) => (
          <div key={e.id} className={styles.entry}>
            <div className={styles.entryText}>
              <p className={styles.entryTitle}>{i + 1}. {e.title}</p>
              <p className={styles.entryMeta}>{e.file_url ? `File: ${e.file_name || 'attachment'}` : 'Typed note'}</p>
            </div>
            <button type="button" className={styles.iconBtn} aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>{'\u2191'}</button>
            <button type="button" className={styles.iconBtn} aria-label="Move down" disabled={i === entries.length - 1} onClick={() => move(i, 1)}>{'\u2193'}</button>
            <button type="button" className={styles.iconBtn} aria-label="Edit topic" onClick={() => setEditing(e.id)}>{'\u270E'}</button>
            <button type="button" className={`${styles.iconBtn} ${styles.btnDanger}`} aria-label="Delete topic" onClick={() => removeEntry(e.id)}>{'\u2715'}</button>
          </div>
        ))}
        {editing === 'none' && (
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} style={{ background: color, marginTop: 12 }} onClick={() => setEditing('new')}>+ Add topic</button>
        )}
      </div>

      {editing !== 'none' && (
        <EntryForm
          key={editing} bookId={bookId} entry={editingEntry} color={color} school={school} userId={userId} supabase={supabase}
          onDone={() => { setEditing('none'); load() }} onCancel={() => setEditing('none')} onError={onError}
        />
      )}

      <button type="button" className={`${styles.btn} ${styles.btnDanger} ${styles.btnSmall}`} onClick={removeBook}>Delete this book</button>
      <div style={{ height: 80 }} />

      {reading && (
        <NoteBook title={book.title} subtitle={book.subject_name || undefined} entries={entries} accentColor={color}
          onDownload={download} downloading={downloading} onClose={() => setReading(false)} />
      )}
    </>
  )
}

/* ------------------------------ add / edit a topic ------------------------------ */

function EntryForm({ bookId, entry, color, school, userId, supabase, onDone, onCancel, onError }: {
  bookId: string; entry: Entry | null; color: string; school: any; userId: string; supabase: any
  onDone: () => void; onCancel: () => void; onError: (m: string) => void
}) {
  const [mode, setMode] = useState<'type' | 'upload'>(entry?.file_url ? 'upload' : 'type')
  const [title, setTitle] = useState(entry?.title ?? '')
  const [content, setContent] = useState(entry?.content ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function save() {
    setSaving(true)
    let fileUrl: string | null = mode === 'upload' ? entry?.file_url ?? null : null
    let fileName: string | null = mode === 'upload' ? entry?.file_name ?? null : null

    if (mode === 'upload' && file) {
      const ext = (file.name.split('.').pop() || 'pdf').toLowerCase()
      const path = `${school?.id}/${userId}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('notes').upload(path, file, { upsert: false })
      if (upErr) { setSaving(false); onError(`Upload failed: ${upErr.message}`); return }
      fileUrl = supabase.storage.from('notes').getPublicUrl(path).data?.publicUrl ?? null
      fileName = file.name
    }

    const payload = mode === 'type'
      ? { title, content, file_url: null, file_name: null }
      : { title, content: null, file_url: fileUrl, file_name: fileName }

    const r = entry
      ? await api(`/api/notebooks/${bookId}/entries`, { method: 'PATCH', body: JSON.stringify({ entry_id: entry.id, ...payload }) })
      : await api(`/api/notebooks/${bookId}/entries`, { method: 'POST', body: JSON.stringify(payload) })
    setSaving(false)
    if (r.ok) onDone(); else onError(r.error)
  }

  const canSave = !!title.trim() && (mode === 'type' ? !!content.trim() : !!(file || entry?.file_url))

  return (
    <div className={styles.panel}>
      <p className={styles.panelTitle}>{entry ? 'Edit topic' : 'Add topic'}</p>
      <div className={styles.field}>
        <label className={styles.label}>Topic title *</label>
        <input className={styles.input} value={title} maxLength={160} onChange={e => setTitle(e.target.value)} placeholder="e.g. Acids and Bases" />
      </div>
      <div className={styles.btnRow} style={{ marginBottom: 12 }}>
        <button type="button" className={`${styles.btn} ${styles.btnSmall} ${mode === 'type' ? styles.btnPrimary : ''}`} style={mode === 'type' ? { background: color } : undefined} onClick={() => setMode('type')}>Type or paste</button>
        <button type="button" className={`${styles.btn} ${styles.btnSmall} ${mode === 'upload' ? styles.btnPrimary : ''}`} style={mode === 'upload' ? { background: color } : undefined} onClick={() => setMode('upload')}>Upload a file</button>
      </div>

      {mode === 'type' ? (
        <div className={styles.field}>
          <label className={styles.label}>Note *</label>
          <NoteEditor value={content} onChange={setContent} accentColor={color} />
        </div>
      ) : (
        <div className={styles.field}>
          <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.ppt,.pptx" style={{ display: 'none' }}
            onChange={e => {
              const f = e.target.files?.[0] ?? null
              if (f && f.size > MAX_FILE_MB * 1024 * 1024) { onError(`That file is bigger than ${MAX_FILE_MB} MB.`); return }
              setFile(f)
            }} />
          <button type="button" className={styles.btn} style={{ height: 70, borderStyle: 'dashed' }} onClick={() => fileRef.current?.click()}>
            {file ? file.name : entry?.file_name ? `Current: ${entry.file_name} (tap to replace)` : 'Tap to choose a PDF, Word or PowerPoint file'}
          </button>
          <p className={styles.hint}>PDFs open inside the book as real pages. Word and PowerPoint files show as an Open button, so PDF is best.</p>
        </div>
      )}

      <div className={styles.btnRow}>
        <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} style={{ background: color }} disabled={saving || !canSave} onClick={save}>{saving ? 'Saving...' : 'Save topic'}</button>
        <button type="button" className={styles.btn} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
