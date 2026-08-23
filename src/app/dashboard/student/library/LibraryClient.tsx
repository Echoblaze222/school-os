'use client'
// src/app/dashboard/student/library/LibraryClient.tsx

import { useState } from 'react'
import RolePageWrapper from '@/components/RolePageWrapper'
import KpiCard from '@/components/KpiCard'
import { BookIcon, AlertCircleIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'
import motion from '@/components/dashboard-motion.module.css'

interface Book { id: string; title: string; author: string | null; category: string; available_copies: number; total_copies: number; shelf_location: string | null }
interface Loan {
  id: string; borrowed_at: string; due_at: string; returned_at: string | null; status: string
  library_books: { title: string; author: string | null } | null
}
interface Props { books: Book[]; myLoans: Loan[]; profile: any; school: any; userId: string }

export default function LibraryClient({ books, myLoans, profile, school, userId }: Props) {
  const [tab,    setTab]    = useState<'catalog' | 'mine'>('catalog')
  const [search, setSearch] = useState('')
  const sc = school?.primary_color ?? '#7C3AED'

  const filtered = books.filter(b =>
    b.title.toLowerCase().includes(search.toLowerCase()) ||
    (b.author ?? '').toLowerCase().includes(search.toLowerCase())
  )
  const activeLoans = myLoans.filter(l => l.status === 'borrowed')

  function dueLabel(due: string, status: string) {
    if (status !== 'borrowed') return null
    const days = Math.ceil((new Date(due).getTime() - Date.now()) / 86400000)
    if (days < 0) return { text: `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`, color: '#EF4444' }
    if (days === 0) return { text: 'Due today', color: '#F59E0B' }
    return { text: `Due in ${days} day${days === 1 ? '' : 's'}`, color: 'var(--text-muted)' }
  }

  return (
    <RolePageWrapper userId={userId} role="student" profile={profile} school={school} title="Library">
      {activeLoans.length > 0 && (
        <div className={styles.statsRow} style={{ marginBottom: 'var(--space-4)' }}>
          <KpiCard label="Books Out" value={activeLoans.length} icon={<BookIcon size={16} />} color={sc} />
          <KpiCard label="Overdue" value={activeLoans.filter(l => new Date(l.due_at) < new Date()).length} icon={<AlertCircleIcon size={16} />} color={activeLoans.some(l => new Date(l.due_at) < new Date()) ? '#EF4444' : '#10B981'} valueColor={activeLoans.some(l => new Date(l.due_at) < new Date()) ? '#EF4444' : '#10B981'} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
        {(['catalog', 'mine'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className="pressable"
            style={{ flex: 1, padding: '8px 0', borderRadius: 'var(--radius-md)', border: '1px solid', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
              background: tab === t ? sc + '22' : 'var(--glass-bg)',
              borderColor: tab === t ? sc : 'var(--glass-border)',
              color: tab === t ? sc : 'var(--text-muted)' }}>
            {t === 'catalog' ? 'Browse' : `My Books${activeLoans.length ? ` (${activeLoans.length})` : ''}`}
          </button>
        ))}
      </div>

      {tab === 'catalog' && (
        <>
          <div className={styles.searchBox} style={{ marginBottom: 'var(--space-4)' }}>
            <input className={styles.searchInput} placeholder="Search title or author…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          {filtered.length === 0 ? (
            <div className={styles.empty}>No books match your search.</div>
          ) : (
            <div className={styles.list}>
              {filtered.map((b, i) => (
                <div key={b.id} className={`${styles.card} ${motion.staggerItem}`} style={{ cursor: 'default', animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                  <div className={styles.cardIcon} style={{ background: sc + '22', color: sc }}><BookIcon size={18} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p className={styles.cardTitle}>{b.title}</p>
                    <p className={styles.cardMeta}>{b.author ?? 'Unknown author'} · {b.category}{b.shelf_location ? ` · Shelf ${b.shelf_location}` : ''}</p>
                  </div>
                  <span className={styles.statusBadge} style={{
                    background: b.available_copies > 0 ? '#10B98122' : '#EF444422',
                    color: b.available_copies > 0 ? '#10B981' : '#EF4444',
                  }}>
                    {b.available_copies > 0 ? `${b.available_copies} available` : 'All out'}
                  </span>
                </div>
              ))}
            </div>
          )}
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: 'var(--space-4)' }}>
            Ask the school office to borrow a book from the catalog.
          </p>
        </>
      )}

      {tab === 'mine' && (
        myLoans.length === 0 ? (
          <div className={styles.empty}>You haven't borrowed any books yet.</div>
        ) : (
          <div className={styles.list}>
            {myLoans.map((l, i) => {
              const dl = dueLabel(l.due_at, l.status)
              return (
                <div key={l.id} className={`${styles.card} ${motion.staggerItem}`} style={{ cursor: 'default', animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                  <div className={styles.cardIcon} style={{ background: (dl?.color ?? sc) + '22', color: dl?.color ?? sc }}><BookIcon size={18} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p className={styles.cardTitle}>{l.library_books?.title ?? 'Unknown title'}</p>
                    <p className={styles.cardMeta}>
                      {l.status === 'returned'
                        ? `Returned ${l.returned_at ? new Date(l.returned_at).toLocaleDateString('en-NG', { day: '2-digit', month: 'short' }) : ''}`
                        : dl && <span style={{ color: dl.color, fontWeight: 700 }}>{dl.text}</span>}
                    </p>
                  </div>
                  <span className={styles.statusBadge} style={{
                    background: l.status === 'returned' ? '#10B98122' : (dl?.color ?? sc) + '22',
                    color: l.status === 'returned' ? '#10B981' : (dl?.color ?? sc),
                    textTransform: 'capitalize',
                  }}>{l.status}</span>
                </div>
              )
            })}
          </div>
        )
      )}

      <div style={{ height: 110 }} />
    </RolePageWrapper>
  )
}
