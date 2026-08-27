'use client'

import { useEffect, useState } from 'react'
import RolePageWrapper from '@/components/RolePageWrapper'
import { RefreshIcon, PlusIcon, XIcon, SearchIcon, UserIcon, BookIcon } from '@/components/Icons'
import { SkeletonList } from '@/components/motion/Skeleton'
import EmptyState from '@/components/motion/EmptyState'
import ActionButton from '@/components/motion/ActionButton'
import { Toast, useToast } from '@/components/motion/Toast'
import styles from '../librarian.module.css'
import motion from '@/components/dashboard-motion.module.css'

interface Props { profile: any; school: any; userId: string }

function one<T>(v: T | T[] | null): T | null { return Array.isArray(v) ? (v[0] ?? null) : v }
function formatDate(iso: string) { return new Date(iso).toLocaleDateString('en-NG', { dateStyle: 'medium' }) }
function isOverdue(dueAt: string, returnedAt: string | null) { return !returnedAt && new Date(dueAt) < new Date() }

export default function CheckoutsClient({ profile, school, userId }: Props) {
  const { toast, showToast } = useToast()
  const [checkouts, setCheckouts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [scope, setScope] = useState<'open' | 'overdue' | 'all'>('open')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [returningId, setReturningId] = useState<string | null>(null)

  // Issue form state
  const [bookQuery, setBookQuery] = useState('')
  const [bookResults, setBookResults] = useState<any[]>([])
  const [selectedBook, setSelectedBook] = useState<any | null>(null)
  const [borrowerQuery, setBorrowerQuery] = useState('')
  const [borrowerResults, setBorrowerResults] = useState<any[]>([])
  const [selectedBorrower, setSelectedBorrower] = useState<any | null>(null)
  const [dueAt, setDueAt] = useState('')

  async function loadCheckouts() {
    setLoading(true)
    try {
      const res = await fetch(`/api/librarian/checkouts?scope=${scope}`)
      const json = await res.json()
      setCheckouts(json.ok ? json.checkouts : [])
    } finally { setLoading(false) }
  }

  useEffect(() => { loadCheckouts() }, [scope])

  useEffect(() => {
    if (!bookQuery.trim() || selectedBook) { setBookResults([]); return }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/librarian/books?search=${encodeURIComponent(bookQuery)}`)
      const json = await res.json()
      setBookResults(json.ok ? json.books.filter((b: any) => b.available_copies > 0) : [])
    }, 250)
    return () => clearTimeout(t)
  }, [bookQuery, selectedBook])

  useEffect(() => {
    if (!borrowerQuery.trim() || selectedBorrower) { setBorrowerResults([]); return }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/librarian/borrowers?search=${encodeURIComponent(borrowerQuery)}`)
      const json = await res.json()
      setBorrowerResults(json.ok ? json.borrowers : [])
    }, 250)
    return () => clearTimeout(t)
  }, [borrowerQuery, selectedBorrower])

  function resetForm() {
    setSelectedBook(null); setBookQuery(''); setSelectedBorrower(null); setBorrowerQuery(''); setDueAt('')
  }

  async function submitCheckout() {
    if (!selectedBook || !selectedBorrower || !dueAt) { showToast('Pick a book, a borrower, and a due date.'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/librarian/checkouts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId: selectedBook.id, borrowerId: selectedBorrower.id, dueAt: new Date(dueAt).toISOString() }),
      })
      const json = await res.json()
      if (!json.ok) { showToast(json.error ?? 'Could not issue book.'); return }
      showToast('Book issued.')
      setShowForm(false); resetForm(); loadCheckouts()
    } finally { setSaving(false) }
  }

  async function returnBook(id: string) {
    setReturningId(id)
    try {
      const res = await fetch('/api/librarian/checkouts', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'return' }),
      })
      const json = await res.json()
      if (!json.ok) { showToast(json.error ?? 'Could not return book.'); return }
      showToast('Book returned.')
      loadCheckouts()
    } finally { setReturningId(null) }
  }

  return (
    <RolePageWrapper userId={userId} role="librarian" profile={profile} school={school} title="Checkouts">
      <main className={styles.main}>
        <ActionButton onClick={() => setShowForm(true)} icon={<PlusIcon size={16} />} fullWidth>
          Issue a Book
        </ActionButton>

        <div style={{ display: 'flex', gap: 8, margin: '14px 0' }}>
          {(['open', 'overdue', 'all'] as const).map(s => (
            <button key={s} onClick={() => setScope(s)}
              style={{
                padding: '6px 14px', borderRadius: 999, fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer',
                border: s === scope ? 'none' : '1px solid var(--glass-border)',
                background: s === scope ? 'var(--brand)' : 'transparent',
                color: s === scope ? '#fff' : 'var(--text-secondary)',
                textTransform: 'capitalize',
              }}>
              {s}
            </button>
          ))}
        </div>

        {loading ? <SkeletonList count={4} variant="card" /> : checkouts.length === 0 ? (
          <EmptyState icon={<RefreshIcon size={28} />} title="Nothing here" subtitle="Issued books will show up here." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {checkouts.map(c => {
              const book = one(c.book); const borrower = one(c.borrower)
              const overdue = isOverdue(c.due_at, c.returned_at)
              return (
                <div key={c.id} className={`glass-card ${motion.pressable}`} style={{ padding: 14, borderRadius: 'var(--radius-lg)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <p style={{ fontWeight: 700, fontSize: '0.86rem', margin: 0 }}>{book?.title ?? 'Book'}</p>
                      <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '2px 0 0' }}>{borrower?.full_name ?? 'Borrower'}</p>
                      <p style={{ fontSize: '0.7rem', color: overdue ? '#EF4444' : 'var(--text-muted)', margin: '4px 0 0' }}>
                        {c.returned_at ? `Returned ${formatDate(c.returned_at)}` : `Due ${formatDate(c.due_at)}${overdue ? ' · Overdue' : ''}`}
                      </p>
                    </div>
                    {!c.returned_at && (
                      <button onClick={() => returnBook(c.id)} disabled={returningId === c.id}
                        style={{ height: 32, padding: '0 12px', borderRadius: 8, border: 'none', background: 'var(--brand)', color: '#fff', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        {returningId === c.id ? 'Returning…' : 'Mark Returned'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <div style={{ height: 100 }} />
      </main>

      {showForm && (
        <div onClick={() => setShowForm(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', zIndex: 100 }}>
          <div onClick={e => e.stopPropagation()} className="glass-card" style={{ width: '100%', maxHeight: '88vh', overflowY: 'auto', padding: 20, borderRadius: '20px 20px 0 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <p style={{ fontWeight: 800, fontSize: '1rem', margin: 0 }}>Issue a Book</p>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><XIcon size={18} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {!selectedBook ? (
                <div>
                  <p style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: 6 }}>Book</p>
                  <div style={{ position: 'relative', marginBottom: 8 }}>
                    <span style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-muted)' }}><SearchIcon size={14} /></span>
                    <input value={bookQuery} onChange={e => setBookQuery(e.target.value)} placeholder="Search title"
                      style={{ width: '100%', padding: '10px 12px 10px 32px', borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {bookResults.map(b => (
                      <button key={b.id} onClick={() => setSelectedBook(b)}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, borderRadius: 8, border: 'none', background: 'var(--glass-bg)', cursor: 'pointer', textAlign: 'left' }}>
                        <BookIcon size={14} /> {b.title} <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--text-muted)' }}>{b.available_copies} left</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 10, borderRadius: 10, background: 'var(--glass-bg)' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.86rem' }}>{selectedBook.title}</span>
                  <button onClick={() => setSelectedBook(null)} style={{ background: 'none', border: 'none', color: 'var(--brand)', fontSize: '0.78rem', cursor: 'pointer' }}>Change</button>
                </div>
              )}

              {!selectedBorrower ? (
                <div>
                  <p style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: 6 }}>Borrower</p>
                  <div style={{ position: 'relative', marginBottom: 8 }}>
                    <span style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-muted)' }}><SearchIcon size={14} /></span>
                    <input value={borrowerQuery} onChange={e => setBorrowerQuery(e.target.value)} placeholder="Search student or teacher"
                      style={{ width: '100%', padding: '10px 12px 10px 32px', borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {borrowerResults.map(b => (
                      <button key={b.id} onClick={() => setSelectedBorrower(b)}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, borderRadius: 8, border: 'none', background: 'var(--glass-bg)', cursor: 'pointer', textAlign: 'left' }}>
                        <UserIcon size={14} /> {b.full_name} <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{b.role}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 10, borderRadius: 10, background: 'var(--glass-bg)' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.86rem' }}>{selectedBorrower.full_name}</span>
                  <button onClick={() => setSelectedBorrower(null)} style={{ background: 'none', border: 'none', color: 'var(--brand)', fontSize: '0.78rem', cursor: 'pointer' }}>Change</button>
                </div>
              )}

              <div>
                <p style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: 6 }}>Due date</p>
                <input type="date" value={dueAt} onChange={e => setDueAt(e.target.value)}
                  style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)' }} />
              </div>

              <ActionButton onClick={submitCheckout} loading={saving} loadingLabel="Issuing…" fullWidth disabled={!selectedBook || !selectedBorrower || !dueAt}>
                Issue Book
              </ActionButton>
            </div>
          </div>
        </div>
      )}

      <Toast toast={toast} />
    </RolePageWrapper>
  )
}
