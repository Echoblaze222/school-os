'use client'
// src/app/dashboard/secretary/library/LibraryClient.tsx

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { BookIcon, BookOpenIcon, ClipboardIcon, TrashIcon } from '@/components/Icons'
import styles from '../secretary.module.css'
import motion from '@/components/dashboard-motion.module.css'

const CATEGORIES = ['General', 'Fiction', 'Non-Fiction', 'Textbook', 'Reference', 'Periodical']
const CAT_COLORS: Record<string, string> = {
  General: '#6B7280', Fiction: '#8B5CF6', 'Non-Fiction': '#3B82F6',
  Textbook: '#10B981', Reference: '#F59E0B', Periodical: '#EC4899',
}
const STATUS_COLORS: Record<string, string> = {
  borrowed: '#3B82F6', returned: '#10B981', overdue: '#EF4444', lost: '#6B7280',
}

interface Book {
  id: string; title: string; author: string | null; isbn: string | null
  category: string; total_copies: number; available_copies: number; shelf_location: string | null
}
interface Loan {
  id: string; book_id: string; student_id: string; borrowed_at: string; due_at: string
  returned_at: string | null; status: string
  library_books: { title: string; author: string | null } | null
  profiles: { full_name: string; default_code: string | null } | null
}
interface StudentOpt { id: string; full_name: string; default_code: string | null }
interface Props { books: Book[]; loans: Loan[]; students: StudentOpt[]; profile: any; school: any; userId: string }

export default function LibraryClient({ books: initBooks, loans: initLoans, students, profile, school, userId }: Props) {
  const [tab,    setTab]    = useState<'catalog' | 'loans'>('catalog')
  const [books,  setBooks]  = useState(initBooks)
  const [loans,  setLoans]  = useState(initLoans)
  const [search, setSearch] = useState('')
  const [catTab, setCatTab] = useState('all')

  const [bookModal, setBookModal] = useState(false)
  const [loanModal, setLoanModal] = useState(false)
  const [deleteBookTarget, setDeleteBookTarget] = useState<Book | null>(null)
  const [saving,    setSaving]    = useState(false)
  const [msg,       setMsg]       = useState('')

  const [bookForm, setBookForm] = useState({ title: '', author: '', isbn: '', category: 'General', total_copies: 1, shelf_location: '' })
  const [loanForm, setLoanForm] = useState({ book_id: '', student_id: '', due_at: '' })

  const supabase = createClient()
  const sc = school?.primary_color ?? '#800020'

  const filteredBooks = books.filter(b => {
    const matchCat = catTab === 'all' || b.category === catTab
    const matchSearch = b.title.toLowerCase().includes(search.toLowerCase()) || (b.author ?? '').toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  const activeLoans  = loans.filter(l => l.status === 'borrowed')
  const overdueCount = activeLoans.filter(l => new Date(l.due_at) < new Date()).length

  async function saveBook() {
    if (!bookForm.title.trim()) { setMsg('Title is required.'); return }
    setSaving(true); setMsg('')

    const { data, error } = await supabase.from('library_books').insert({
      title: bookForm.title.trim(),
      author: bookForm.author.trim() || null,
      isbn: bookForm.isbn.trim() || null,
      category: bookForm.category,
      total_copies: bookForm.total_copies,
      available_copies: bookForm.total_copies,
      shelf_location: bookForm.shelf_location.trim() || null,
      school_id: school?.id,
      added_by: userId,
    }).select().single()

    if (!error && data) {
      setBooks(p => [...p, data].sort((a, b) => a.title.localeCompare(b.title)))
      setBookModal(false)
      setBookForm({ title: '', author: '', isbn: '', category: 'General', total_copies: 1, shelf_location: '' })
    } else {
      setMsg(error?.message ?? 'Could not save book')
    }
    setSaving(false)
  }

  async function deleteBook(id: string) {
    const { error } = await supabase.from('library_books').delete().eq('id', id)
    if (!error) setBooks(p => p.filter(b => b.id !== id))
    else setMsg(error.message.includes('foreign key') ? 'This book has loan history and can\u2019t be deleted.' : (error.message ?? 'Could not delete book'))
    setDeleteBookTarget(null)
  }

  async function issueLoan() {
    if (!loanForm.book_id || !loanForm.student_id || !loanForm.due_at) { setMsg('Book, student, and due date are all required.'); return }
    setSaving(true); setMsg('')

    const { data, error } = await supabase.from('library_loans').insert({
      book_id: loanForm.book_id,
      student_id: loanForm.student_id,
      due_at: new Date(loanForm.due_at).toISOString(),
      school_id: school?.id,
      issued_by: userId,
    }).select('*, library_books(title, author), profiles!library_loans_student_id_fkey(full_name, default_code)').single()

    if (!error && data) {
      setLoans(p => [data, ...p])
      setBooks(p => p.map(b => b.id === loanForm.book_id ? { ...b, available_copies: b.available_copies - 1 } : b))
      setLoanModal(false)
      setLoanForm({ book_id: '', student_id: '', due_at: '' })
    } else {
      // Most likely cause: the DB trigger rejected it because there are no
      // available copies left - surface that plainly rather than a raw error.
      setMsg(error?.message?.includes('No available copies') ? 'No copies of this book are available right now.' : (error?.message ?? 'Could not issue loan'))
    }
    setSaving(false)
  }

  async function returnLoan(loan: Loan) {
    const { error } = await supabase.from('library_loans')
      .update({ status: 'returned', returned_at: new Date().toISOString() })
      .eq('id', loan.id)

    if (!error) {
      setLoans(p => p.map(l => l.id === loan.id ? { ...l, status: 'returned', returned_at: new Date().toISOString() } : l))
      setBooks(p => p.map(b => b.id === loan.book_id ? { ...b, available_copies: Math.min(b.available_copies + 1, b.total_copies) } : b))
    }
  }

  function daysLabel(due: string, status: string) {
    if (status !== 'borrowed') return null
    const days = Math.ceil((new Date(due).getTime() - Date.now()) / 86400000)
    if (days < 0) return { text: `${Math.abs(days)}d overdue`, color: '#EF4444' }
    if (days === 0) return { text: 'Due today', color: '#F59E0B' }
    return { text: `Due in ${days}d`, color: 'var(--text-muted)' }
  }

  return (
    <RolePageWrapper userId={userId} role="secretary" profile={profile} school={school} title="Library">
      {/* Stats */}
      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <p className={styles.statVal} style={{ color: sc }}>{books.length}</p>
          <p className={styles.statLbl}>Titles</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statVal} style={{ color: '#3B82F6' }}>{activeLoans.length}</p>
          <p className={styles.statLbl}>On loan</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statVal} style={{ color: overdueCount > 0 ? '#EF4444' : '#10B981' }}>{overdueCount}</p>
          <p className={styles.statLbl}>Overdue</p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
        {(['catalog', 'loans'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ flex: 1, padding: '8px 0', borderRadius: 'var(--radius-md)', border: '1px solid', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', textTransform: 'capitalize',
              background: tab === t ? sc + '22' : 'var(--glass-bg)',
              borderColor: tab === t ? sc : 'var(--glass-border)',
              color: tab === t ? sc : 'var(--text-muted)' }}>
            {t === 'catalog' ? 'Catalog' : 'Loans'}
          </button>
        ))}
      </div>

      {tab === 'catalog' && (
        <>
          <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
            <div className={styles.searchBar} style={{ flex: 1, marginBottom: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input className={styles.searchInput} placeholder="Search title or author…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <button className={styles.btnPrimary} onClick={() => { setMsg(''); setBookModal(true) }} style={{ height: 44, padding: '0 var(--space-4)', whiteSpace: 'nowrap' }}>+ Book</button>
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-5)', overflowX: 'auto', paddingBottom: 4 }}>
            {['all', ...CATEGORIES].map(c => (
              <button key={c} onClick={() => setCatTab(c)}
                style={{ padding: '6px 14px', borderRadius: 'var(--radius-full)', border: '1px solid', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                  background: catTab === c ? (CAT_COLORS[c] ?? sc) + '22' : 'var(--glass-bg)',
                  borderColor: catTab === c ? (CAT_COLORS[c] ?? sc) : 'var(--glass-border)',
                  color: catTab === c ? (CAT_COLORS[c] ?? sc) : 'var(--text-muted)' }}>{c}</button>
            ))}
          </div>

          {filteredBooks.length === 0 ? (
            <div className={styles.emptyState}><BookIcon size={32} color="var(--text-muted)" /><p className={styles.emptyTitle}>No books yet</p><p className={styles.emptyHint}>Add your first title to the catalog</p></div>
          ) : (
            filteredBooks.map((b, i) => (
              <div key={b.id} className={`${styles.listItem} ${motion.staggerItem}`} style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                <div className={styles.listIconBox} style={{ background: (CAT_COLORS[b.category] ?? sc) + '22' }}>
                  <BookOpenIcon size={19} color={CAT_COLORS[b.category] ?? sc} />
                </div>
                <div className={styles.listContent}>
                  <p className={styles.listTitle}>{b.title}</p>
                  <p className={styles.listSub}>{b.author ?? 'Unknown author'} · {b.available_copies}/{b.total_copies} available{b.shelf_location ? ` · Shelf ${b.shelf_location}` : ''}</p>
                </div>
                <span className={styles.listBadge} style={{ background: (CAT_COLORS[b.category] ?? '#6B7280') + '22', color: CAT_COLORS[b.category] ?? '#6B7280' }}>{b.category}</span>
                <button className="pressable" onClick={() => setDeleteBookTarget(b)} style={{ width: 30, height: 30, borderRadius: 'var(--radius-md)', background: 'var(--danger-subtle)', border: '1px solid rgba(239,68,68,0.2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><TrashIcon size={14} color="var(--danger)" /></button>
              </div>
            ))
          )}
        </>
      )}

      {tab === 'loans' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-4)' }}>
            <button className={styles.btnPrimary} onClick={() => { setMsg(''); setLoanModal(true) }} style={{ height: 44, padding: '0 var(--space-4)' }}>+ Issue loan</button>
          </div>

          {loans.length === 0 ? (
            <div className={styles.emptyState}><ClipboardIcon size={32} color="var(--text-muted)" /><p className={styles.emptyTitle}>No loans yet</p><p className={styles.emptyHint}>Issue a book to a student to get started</p></div>
          ) : (
            loans.map((l, i) => {
              const dl = daysLabel(l.due_at, l.status)
              return (
                <div key={l.id} className={`${styles.listItem} ${motion.staggerItem}`} style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                  <div className={styles.listIconBox} style={{ background: (STATUS_COLORS[l.status] ?? sc) + '22' }}>
                    <BookOpenIcon size={19} color={STATUS_COLORS[l.status] ?? sc} />
                  </div>
                  <div className={styles.listContent}>
                    <p className={styles.listTitle}>{l.library_books?.title ?? 'Unknown title'}</p>
                    <p className={styles.listSub}>
                      {l.profiles?.full_name ?? 'Unknown student'}{l.profiles?.default_code ? ` (${l.profiles.default_code})` : ''}
                      {dl ? <> · <span style={{ color: dl.color, fontWeight: 700 }}>{dl.text}</span></> : ` · Returned ${l.returned_at ? new Date(l.returned_at).toLocaleDateString('en-NG', { day: '2-digit', month: 'short' }) : ''}`}
                    </p>
                  </div>
                  <span className={styles.listBadge} style={{ background: (STATUS_COLORS[l.status] ?? '#6B7280') + '22', color: STATUS_COLORS[l.status] ?? '#6B7280', textTransform: 'capitalize' }}>{l.status}</span>
                  {l.status === 'borrowed' && (
                    <button className={styles.btnGhost} onClick={() => returnLoan(l)} style={{ padding: '6px 12px', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>Mark returned</button>
                  )}
                </div>
              )
            })
          )}
        </>
      )}

      {/* Add book modal */}
      {bookModal && (
        <div className={styles.modalOverlay} onClick={() => setBookModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Add Book</h2>
            <div className={styles.formGroup}><label className={styles.formLabel}>Title *</label><input className={styles.formInput} value={bookForm.title} onChange={e => setBookForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Things Fall Apart" /></div>
            <div className={styles.formGroup}><label className={styles.formLabel}>Author</label><input className={styles.formInput} value={bookForm.author} onChange={e => setBookForm(p => ({ ...p, author: e.target.value }))} placeholder="e.g. Chinua Achebe" /></div>
            <div className={styles.formGroup}><label className={styles.formLabel}>ISBN</label><input className={styles.formInput} value={bookForm.isbn} onChange={e => setBookForm(p => ({ ...p, isbn: e.target.value }))} placeholder="Optional" /></div>
            <div className={styles.formGroup}><label className={styles.formLabel}>Category</label>
              <select className={styles.formSelect} value={bookForm.category} onChange={e => setBookForm(p => ({ ...p, category: e.target.value }))}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <div className={styles.formGroup} style={{ flex: 1 }}><label className={styles.formLabel}>Copies</label><input type="number" min={1} className={styles.formInput} value={bookForm.total_copies} onChange={e => setBookForm(p => ({ ...p, total_copies: Math.max(1, Number(e.target.value)) }))} /></div>
              <div className={styles.formGroup} style={{ flex: 1 }}><label className={styles.formLabel}>Shelf</label><input className={styles.formInput} value={bookForm.shelf_location} onChange={e => setBookForm(p => ({ ...p, shelf_location: e.target.value }))} placeholder="e.g. A3" /></div>
            </div>
            {msg && <p style={{ fontSize: '0.78rem', color: '#EF4444', margin: '0 0 var(--space-3)' }}>{msg}</p>}
            <div className={styles.modalActions}><button className={styles.btnGhost} onClick={() => setBookModal(false)}>Cancel</button><button className={styles.btnPrimary} onClick={saveBook} disabled={saving}>{saving ? 'Saving…' : 'Add Book'}</button></div>
          </div>
        </div>
      )}

      {/* Issue loan modal */}
      {loanModal && (
        <div className={styles.modalOverlay} onClick={() => setLoanModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Issue Loan</h2>
            <div className={styles.formGroup}><label className={styles.formLabel}>Book *</label>
              <select className={styles.formSelect} value={loanForm.book_id} onChange={e => setLoanForm(p => ({ ...p, book_id: e.target.value }))}>
                <option value="">Select a book…</option>
                {books.filter(b => b.available_copies > 0).map(b => <option key={b.id} value={b.id}>{b.title} ({b.available_copies} available)</option>)}
              </select>
            </div>
            <div className={styles.formGroup}><label className={styles.formLabel}>Student *</label>
              <select className={styles.formSelect} value={loanForm.student_id} onChange={e => setLoanForm(p => ({ ...p, student_id: e.target.value }))}>
                <option value="">Select a student…</option>
                {students.map(s => <option key={s.id} value={s.id}>{s.full_name}{s.default_code ? ` (${s.default_code})` : ''}</option>)}
              </select>
            </div>
            <div className={styles.formGroup}><label className={styles.formLabel}>Due date *</label><input type="date" className={styles.formInput} value={loanForm.due_at} onChange={e => setLoanForm(p => ({ ...p, due_at: e.target.value }))} min={new Date().toISOString().split('T')[0]} /></div>
            {msg && <p style={{ fontSize: '0.78rem', color: '#EF4444', margin: '0 0 var(--space-3)' }}>{msg}</p>}
            <div className={styles.modalActions}><button className={styles.btnGhost} onClick={() => setLoanModal(false)}>Cancel</button><button className={styles.btnPrimary} onClick={issueLoan} disabled={saving}>{saving ? 'Issuing…' : 'Issue Loan'}</button></div>
          </div>
        </div>
      )}

      {deleteBookTarget && (
        <div className={styles.modalOverlay} onClick={() => setDeleteBookTarget(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Delete book?</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 'var(--space-5)' }}>&quot;<strong>{deleteBookTarget.title}</strong>&quot; will be permanently removed from the catalog.</p>
            <div className={styles.modalActions}><button className={styles.btnGhost} onClick={() => setDeleteBookTarget(null)}>Cancel</button><button className={styles.btnDanger} onClick={() => deleteBook(deleteBookTarget.id)}>Delete</button></div>
          </div>
        </div>
      )}

      <div style={{ height: 110 }} />
    </RolePageWrapper>
  )
}
