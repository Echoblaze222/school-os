'use client'
// components/GlobalSearchOverlay.tsx
// Section 10's "Global Intelligent Search" front end. One search bar,
// available from every role's header, backed by /api/search which
// applies role permissions server-side before returning anything — this
// component never decides what's visible, it only renders what the API
// already scoped.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  SearchIcon, XIcon, UserIcon, LayersIcon, BookIcon, WalletIcon,
  FileTextIcon, BellIcon, CalendarIcon, CheckCircleIcon,
} from './Icons'
import { ripple } from '@/lib/ripple'
import motion from './dashboard-motion.module.css'
import styles from './GlobalSearchOverlay.module.css'

interface SearchResult { type: string; id: string; title: string; subtitle: string; href: string }

const TYPE_ICON: Record<string, React.ComponentType<{ size?: number }>> = {
  student: UserIcon, teacher: UserIcon, class: LayersIcon, subject: BookIcon,
  invoice: WalletIcon, assignment: FileTextIcon, announcement: BellIcon,
  event: CalendarIcon, book: BookIcon, admission: CheckCircleIcon,
}

const TYPE_LABEL: Record<string, string> = {
  student: 'Students', teacher: 'Teachers', class: 'Classes', subject: 'Subjects',
  invoice: 'Fees & Invoices', assignment: 'Assignments', announcement: 'Announcements',
  event: 'Events', book: 'Library', admission: 'Admissions',
}

export default function GlobalSearchOverlay({ triggerClassName }: { triggerClassName?: string }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
    else { setQuery(''); setResults([]); setStatus('idle') }
  }, [open])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (query.trim().length < 2) { setResults([]); setStatus('idle'); return }

    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setStatus('loading')
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal })
        if (!res.ok) throw new Error('search failed')
        const data = await res.json()
        setResults(data.results ?? [])
        setStatus('ready')
      } catch (e: any) {
        if (e?.name === 'AbortError') return
        setStatus('error')
      }
    }, 300)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    if (open) document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const grouped: Record<string, SearchResult[]> = {}
  for (const r of results) (grouped[r.type] ??= []).push(r)

  return (
    <>
      <button
        className={triggerClassName ?? `${styles.trigger} ${motion.rippleHost} ${motion.focusable}`}
        onClick={() => setOpen(true)}
        onMouseDown={ripple(motion)}
        title="Search"
        aria-label="Search"
      >
        <SearchIcon size={17} />
      </button>

      {open && (
        <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}>
          <div className={styles.sheet}>
            <div className={styles.searchRow}>
              <SearchIcon size={18} />
              <input
                ref={inputRef}
                className={styles.input}
                placeholder="Search students, fees, assignments, and more…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button className={styles.closeBtn} onClick={() => setOpen(false)} aria-label="Close search">
                <XIcon size={18} />
              </button>
            </div>

            <div className={styles.results}>
              {status === 'idle' && (
                <p className={styles.hint}>Try "students in SS2 with attendance below 80%" or just a name.</p>
              )}
              {status === 'loading' && <p className={styles.hint}>Searching…</p>}
              {status === 'error' && <p className={styles.hint}>Couldn't search right now. Try again.</p>}
              {status === 'ready' && results.length === 0 && (
                <p className={styles.emptyState}>No results for "{query}".</p>
              )}
              {status === 'ready' && Object.entries(grouped).map(([type, items]) => {
                const Icon = TYPE_ICON[type] ?? FileTextIcon
                return (
                  <div key={type}>
                    <p className={styles.groupLabel}>{TYPE_LABEL[type] ?? type}</p>
                    {items.map((r) => (
                      <Link key={`${type}-${r.id}`} href={r.href} className={`${styles.resultRow} ${motion.pressable}`} onClick={() => setOpen(false)}>
                        <span className={styles.resultIcon}><Icon size={16} /></span>
                        <span className={styles.resultBody}>
                          <p className={styles.resultTitle}>{r.title}</p>
                          <p className={styles.resultSubtitle}>{r.subtitle}</p>
                        </span>
                      </Link>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
