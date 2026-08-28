'use client'

import { useEffect, useState } from 'react'
import RolePageWrapper from '@/components/RolePageWrapper'
import { BookIcon, PlusIcon, XIcon, SearchIcon } from '@/components/Icons'
import { SkeletonList } from '@/components/motion/Skeleton'
import EmptyState from '@/components/motion/EmptyState'
import ActionButton from '@/components/motion/ActionButton'
import { Toast, useToast } from '@/components/motion/Toast'
import styles from '../librarian.module.css'
import motion from '@/components/dashboard-motion.module.css'

const CATEGORIES = ['General', 'Fiction', 'Non-Fiction', 'Textbook', 'Reference', 'Periodical']

interface Props { profile: any; school: any; userId: string }

export default function CatalogClient({ profile, school, userId }: Props) {
  const { toast, showToast } = useToast()
  const [books, setBooks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [isbn, setIsbn] = useState('')
  const [category, setCategory] = useState('General')
  const [totalCopies, setTotalCopies] = useState('1')
  const [shelfLocation, setShelfLocation] = useState('')

  async function loadBooks(q?: string) {
    setLoading(true)
    try {
      const res = await fetch(`/api/librarian/books${q ? `?search=${encodeURIComponent(q)}` : ''}`)
      const json = await res.json()
      setBooks(json.ok ? json.books : [])
    } finally { setLoading(false) }
  }

  useEffect(() => { loadBooks() }, [])
  useEffect(() => {
    const t = setTimeout(() => loadBooks(search), 300)
    return () => clearTimeout(t)
  }, [search])

  async function submitBook() {
    if (!title.trim()) { showToast('Title is required.'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/librarian/books', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, author, isbn, category, totalCopies: Number(totalCopies || 1), shelfLocation }),
      })
      const json = await res.json()
      if (!json.ok) { showToast(json.error ?? 'Could not add book.'); return }
      showToast('Book added.')
      setShowForm(false); setTitle(''); setAuthor(''); setIsbn(''); setCategory('General'); setTotalCopies('1'); setShelfLocation('')
      loadBooks(search)
    } finally { setSaving(false) }
  }

  return (
    <RolePageWrapper userId={userId} role="librarian" profile={profile} school={school} title="Catalog">
      <main className={styles.main}>
        <ActionButton onClick={() => setShowForm(true)} icon={<PlusIcon size={16} />} fullWidth>
          Add a Book
        </ActionButton>

        <div style={{ position: 'relative', margin: '14px 0' }}>
          <span style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-muted)' }}><SearchIcon size={14} /></span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search title or author"
            style={{ width: '100%', padding: '10px 12px 10px 32px', borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)' }} />
        </div>

        {loading ? <SkeletonList count={5} variant="row" /> : books.length === 0 ? (
          <EmptyState icon={<BookIcon size={28} />} title="No books in the catalog yet" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {books.map(b => (
              <div key={b.id} className={`glass-card ${motion.pressable}`} style={{ padding: 12, borderRadius: 'var(--radius-lg)', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div>
                  <p style={{ fontWeight: 700, fontSize: '0.84rem', margin: 0 }}>{b.title}</p>
                  <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                    {b.author ?? 'Unknown author'}{b.category ? ` · ${b.category}` : ''}{b.shelf_location ? ` · ${b.shelf_location}` : ''}
                  </p>
                </div>
                <span style={{ fontSize: '0.74rem', fontWeight: 700, color: b.available_copies > 0 ? 'var(--status-ok, #10B981)' : 'var(--status-warn, #E4572E)', whiteSpace: 'nowrap' }}>
                  {b.available_copies}/{b.total_copies} available
                </span>
              </div>
            ))}
          </div>
        )}
        <div style={{ height: 100 }} />
      </main>

      {showForm && (
        <div onClick={() => setShowForm(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', zIndex: 100 }}>
          <div onClick={e => e.stopPropagation()} className="glass-card" style={{ width: '100%', maxHeight: '88vh', overflowY: 'auto', padding: 20, borderRadius: '20px 20px 0 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <p style={{ fontWeight: 800, fontSize: '1rem', margin: 0 }}>Add a Book</p>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><XIcon size={18} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input placeholder="Title" value={title} onChange={e => setTitle(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)' }} />
              <input placeholder="Author" value={author} onChange={e => setAuthor(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)' }} />
              <input placeholder="ISBN (optional)" value={isbn} onChange={e => setIsbn(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)' }} />
              <select value={category} onChange={e => setCategory(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)' }}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <div style={{ display: 'flex', gap: 10 }}>
                <input placeholder="Copies" type="number" value={totalCopies} onChange={e => setTotalCopies(e.target.value)}
                  style={{ flex: 1, padding: 10, borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)' }} />
                <input placeholder="Shelf location" value={shelfLocation} onChange={e => setShelfLocation(e.target.value)}
                  style={{ flex: 1, padding: 10, borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)' }} />
              </div>
              <ActionButton onClick={submitBook} loading={saving} loadingLabel="Saving…" fullWidth>Add Book</ActionButton>
            </div>
          </div>
        </div>
      )}

      <Toast toast={toast} />
    </RolePageWrapper>
  )
}
