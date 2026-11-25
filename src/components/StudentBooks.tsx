'use client'
// src/components/StudentBooks.tsx
//
// Student "Books" tab: subject books shared with the student's CURRENT class,
// and (read-only) books from classes they were in before. Opening one shows the
// real-book reader with a contents page; PDF topics appear as pages.
// All data comes from /api/notebooks (checked on the server per student/class).

import { useCallback, useEffect, useState } from 'react'
import NoteBook from '@/components/NoteBook'
import { api, downloadBookPdf } from '@/lib/notebooks/client'
import { SkeletonList } from '@/components/motion/Skeleton'
import styles from './Books.module.css'

interface BookSummary {
  id: string; title: string; subject_name: string | null; description: string | null
  cover_color: string | null; academic_year: string | null; author: string | null
  entry_count: number; class_names: string[]; group?: 'current' | 'earlier'
}

export default function StudentBooks({ accent }: { accent: string }) {
  const [books, setBooks] = useState<BookSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<{ book: any; entries: any[] } | null>(null)
  const [opening, setOpening] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await api<{ books: BookSummary[] }>('/api/notebooks')
    if (r.ok) { setBooks(r.data.books); setError(null) } else setError(r.error)
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  async function openBook(id: string) {
    setOpening(id)
    const r = await api<{ book: any; entries: any[] }>(`/api/notebooks/${id}`)
    setOpening(null)
    if (r.ok) setOpen(r.data)
    else setError(r.error)
  }

  async function download() {
    if (!open) return
    setDownloading(true)
    const err = await downloadBookPdf(open.book.id, open.book.title)
    setDownloading(false)
    if (err) setError(err)
  }

  const current = books.filter(b => b.group !== 'earlier')
  const earlier = books.filter(b => b.group === 'earlier')

  const card = (b: BookSummary) => (
    <button key={b.id} type="button" className={styles.bookCard} onClick={() => openBook(b.id)} disabled={opening === b.id}>
      <span className={styles.spine} style={{ background: b.cover_color || accent }} />
      <span className={styles.bookBody}>
        <span className={styles.bookTitle}>{b.title}</span>
        <span className={styles.bookMeta}>
          {[b.subject_name, b.author, `${b.entry_count} topic${b.entry_count === 1 ? '' : 's'}`].filter(Boolean).join(' \u00B7 ')}
        </span>
        {b.description && <span className={styles.bookDesc}>{b.description}</span>}
      </span>
      <span className={styles.openTag} style={{ color: b.cover_color || accent }}>{opening === b.id ? '...' : 'Open'}</span>
    </button>
  )

  return (
    <>
      {error && (
        <div className={styles.error} role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss">{'\u2715'}</button>
        </div>
      )}

      {loading ? <SkeletonList count={3} variant="card" /> : books.length === 0 ? (
        <div className={styles.empty}><p>No books yet. When a teacher shares a book with your class, it shows up here.</p></div>
      ) : (
        <>
          {current.length > 0 && <div className={styles.list}>{current.map(card)}</div>}
          {earlier.length > 0 && (
            <>
              <p className={styles.sectionLabel}>Earlier classes</p>
              <div className={styles.list}>{earlier.map(card)}</div>
            </>
          )}
        </>
      )}

      {open && (
        <NoteBook
          title={open.book.title}
          subtitle={open.book.subject_name || undefined}
          entries={open.entries}
          accentColor={open.book.cover_color || accent}
          onDownload={download}
          downloading={downloading}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  )
}
