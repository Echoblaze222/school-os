'use client'
// src/app/(public)/find-school/FindSchoolClient.tsx

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { SearchIcon, SchoolIcon, MapPinIcon, CalendarIcon } from '@/components/Icons'
import VerificationBadge from '@/components/VerificationBadge'
import ReportContentButton from '@/components/ReportContentButton'
import styles from './findSchool.module.css'

interface SchoolResult {
  school_id: string
  application_deadline: string | null
  admission_fee: number | null
  admission_fee_currency: string | null
  schools: { id: string; name: string; city: string | null; state: string | null; logo_url: string | null; primary_color: string | null; verified_status: string | null } | null
}

export default function FindSchoolClient() {
  const [query, setQuery] = useState('')
  const [schools, setSchools] = useState<SchoolResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async (q: string) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/admission/schools${q ? `?q=${encodeURIComponent(q)}` : ''}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Failed to load schools.')
      setSchools(data.schools ?? [])
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong loading schools.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load('') }, [load])

  useEffect(() => {
    const t = setTimeout(() => load(query), 350)
    return () => clearTimeout(t)
  }, [query, load])

  return (
    <div>
      <h1 className={styles.title}>Find a School</h1>
      <p className={styles.subtitle}>Browse schools currently accepting admission applications on SchoolOS.</p>

      <div className={styles.searchBox}>
        <SearchIcon size={16} color="var(--text-muted)" />
        <input
          className={styles.searchInput}
          placeholder="Search by school name, city, or state"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      {loading ? (
        <div className={styles.skeletonList}>
          {[0, 1, 2].map(i => <div key={i} className={styles.skeletonCard} />)}
        </div>
      ) : error ? (
        <p className={styles.errorText}>{error}</p>
      ) : schools.length === 0 ? (
        <div className={styles.emptyState}>
          <SchoolIcon size={32} color="var(--text-muted)" />
          <p className={styles.emptyTitle}>No schools found</p>
          <p className={styles.emptyHint}>Try a different search, or check back soon as more schools join.</p>
        </div>
      ) : (
        <div className={styles.list}>
          {schools.map(s => {
            const sc = s.schools?.primary_color ?? '#800020'
            return (
              <Link key={s.school_id} href={`/apply/${s.school_id}`} className={styles.card}>
                <div className={styles.cardIcon} style={{ background: sc + '22' }}>
                  <SchoolIcon size={20} color={sc} />
                </div>
                <div className={styles.cardBody}>
                  <p className={styles.cardName}>
                    {s.schools?.name}{' '}
                    <VerificationBadge status={s.schools?.verified_status} size="sm" />
                  </p>
                  <p className={styles.cardMeta}>
                    <MapPinIcon size={11} color="var(--text-muted)" /> {[s.schools?.city, s.schools?.state].filter(Boolean).join(', ') || 'Location not listed'}
                  </p>
                  {s.application_deadline && (
                    <p className={styles.cardMeta}>
                      <CalendarIcon size={11} color="var(--text-muted)" /> Deadline {new Date(s.application_deadline).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                  )}
                  <div style={{ marginTop: 6 }}>
                    <ReportContentButton targetType="school" targetId={s.school_id} />
                  </div>
                </div>
                <span className={styles.applyBtn} style={{ background: sc }}>Apply</span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
