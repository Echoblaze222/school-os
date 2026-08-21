'use client'
// src/app/find-schools/DiscoveryClient.tsx

import { useState, useEffect, useCallback, useRef } from 'react'
import { SearchIcon, FilterIcon, XIcon, SchoolIcon } from '@/components/Icons'
import SchoolCard, { SchoolCardSkeleton } from '@/components/public/SchoolCard'
import EmptyState from '@/components/motion/EmptyState'
import type { PublicSchoolListItem } from '@/lib/publicSchools'
import { NIGERIAN_STATES, EDUCATION_LEVELS, SCHOOL_TYPES, SCHOOL_TYPE_LABELS } from '@/lib/constants/nigeria'
import motion from '@/components/dashboard-motion.module.css'
import styles from './find-schools.module.css'

const PAGE_SIZE = 12

interface Props {
  initialSchools: PublicSchoolListItem[]
  initialTotal: number
  initialLoadFailed: boolean
}

type LoadState = 'idle' | 'loading' | 'error'

export default function DiscoveryClient({ initialSchools, initialTotal, initialLoadFailed }: Props) {
  const [schools, setSchools] = useState(initialSchools)
  const [total, setTotal]     = useState(initialTotal)
  const [page, setPage]       = useState(0)
  const [loadState, setLoadState] = useState<LoadState>(initialLoadFailed ? 'error' : 'idle')
  const [filtersOpen, setFiltersOpen] = useState(false)

  const [q, setQ]                 = useState('')
  const [state, setState]         = useState('')
  const [schoolType, setSchoolType] = useState('')
  const [level, setLevel]         = useState('')
  const [boarding, setBoarding]   = useState('')
  const [verifiedOnly, setVerifiedOnly] = useState(false)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isFirstRun = useRef(true)

  const activeFilterCount = [state, schoolType, level, boarding].filter(Boolean).length + (verifiedOnly ? 1 : 0)

  const runSearch = useCallback(async (nextPage: number, append: boolean) => {
    setLoadState('loading')
    try {
      const params = new URLSearchParams()
      if (q.trim()) params.set('q', q.trim())
      if (state) params.set('state', state)
      if (schoolType) params.set('type', schoolType)
      if (level) params.set('level', level)
      if (boarding) params.set('boarding', boarding)
      if (verifiedOnly) params.set('verified', 'true')
      params.set('limit', String(PAGE_SIZE))
      params.set('offset', String(nextPage * PAGE_SIZE))

      const res = await fetch(`/api/public/schools?${params.toString()}`)
      if (!res.ok) throw new Error(`search failed: ${res.status}`)
      const data = await res.json()

      setSchools(prev => append ? [...prev, ...data.schools] : data.schools)
      setTotal(data.total ?? 0)
      setPage(nextPage)
      setLoadState('idle')
    } catch (err) {
      console.error('[find-schools] search failed:', err)
      setLoadState('error')
    }
  }, [q, state, schoolType, level, boarding, verifiedOnly])

  // Debounced re-search whenever any filter changes (skip the very first
  // render, which already has server-fetched initial results).
  useEffect(() => {
    if (isFirstRun.current) { isFirstRun.current = false; return }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { runSearch(0, false) }, 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, state, schoolType, level, boarding, verifiedOnly])

  const clearFilters = () => {
    setState(''); setSchoolType(''); setLevel(''); setBoarding(''); setVerifiedOnly(false)
  }

  const hasMore = schools.length < total

  return (
    <div className="page-content">
      <div className={styles.header}>
        <h1 className="h2">Find a school</h1>
        <p className="body">Search schools already using SchoolOS by name, location, or type.</p>
      </div>

      <div className={styles.searchRow}>
        <div className="input-wrapper" style={{ flex: 1 }}>
          <SearchIcon size={16} className="input-icon" />
          <input
            className="input input-with-icon"
            placeholder="Search by school name or location..."
            value={q}
            onChange={e => setQ(e.target.value)}
            aria-label="Search schools"
          />
        </div>
        <button
          type="button"
          className={`btn btn-secondary ${motion.pressable} ${motion.focusable}`}
          onClick={() => setFiltersOpen(o => !o)}
        >
          <FilterIcon size={15} /> Filters
          {activeFilterCount > 0 && <span className={styles.filterCount}>{activeFilterCount}</span>}
        </button>
      </div>

      {filtersOpen && (
        <div className={`${styles.filterPanel} glass-card ${motion.riseIn}`}>
          <div className={styles.filterGrid}>
            <div className="input-group">
              <label className="input-label">State</label>
              <select className="input" value={state} onChange={e => setState(e.target.value)}>
                <option value="">Any state</option>
                {NIGERIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="input-group">
              <label className="input-label">School type</label>
              <select className="input" value={schoolType} onChange={e => setSchoolType(e.target.value)}>
                <option value="">Any type</option>
                {SCHOOL_TYPES.map(t => <option key={t} value={t}>{SCHOOL_TYPE_LABELS[t] ?? t}</option>)}
              </select>
            </div>
            <div className="input-group">
              <label className="input-label">Education level</label>
              <select className="input" value={level} onChange={e => setLevel(e.target.value)}>
                <option value="">Any level</option>
                {EDUCATION_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div className="input-group">
              <label className="input-label">Boarding / Day</label>
              <select className="input" value={boarding} onChange={e => setBoarding(e.target.value)}>
                <option value="">Either</option>
                <option value="boarding">Boarding</option>
                <option value="day">Day</option>
              </select>
            </div>
          </div>
          <label className={styles.checkboxRow}>
            <input type="checkbox" checked={verifiedOnly} onChange={e => setVerifiedOnly(e.target.checked)} />
            Verified schools only
          </label>
          {activeFilterCount > 0 && (
            <button type="button" className={styles.clearBtn} onClick={clearFilters}>
              <XIcon size={13} /> Clear filters
            </button>
          )}
        </div>
      )}

      <p className={styles.resultCount}>
        {loadState === 'loading' && schools.length === 0
          ? 'Searching...'
          : `${total} school${total === 1 ? '' : 's'} found`}
      </p>

      {loadState === 'error' && schools.length === 0 ? (
        <EmptyState
          icon={<SchoolIcon size={28} />}
          title="Couldn't load schools"
          subtitle="Check your connection and try again."
          action={{ label: 'Retry', onClick: () => runSearch(0, false) }}
        />
      ) : schools.length === 0 && loadState === 'idle' ? (
        <EmptyState
          icon={<SchoolIcon size={28} />}
          title="No schools match your search"
          subtitle="Try a different location, or clear your filters to see every school on SchoolOS."
          action={activeFilterCount > 0 ? { label: 'Clear filters', onClick: clearFilters } : undefined}
        />
      ) : (
        <>
          <div className={styles.grid}>
            {schools.map((school, i) => (
              <SchoolCard key={school.id} school={school} index={i % PAGE_SIZE} />
            ))}
            {loadState === 'loading' && schools.length === 0 &&
              Array.from({ length: 8 }).map((_, i) => <SchoolCardSkeleton key={i} />)}
          </div>

          {hasMore && (
            <div className={styles.loadMoreRow}>
              <button
                type="button"
                className={`btn btn-secondary ${motion.pressable} ${motion.focusable}`}
                onClick={() => runSearch(page + 1, true)}
                disabled={loadState === 'loading'}
              >
                {loadState === 'loading' ? 'Loading...' : `Load more (${total - schools.length} remaining)`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
