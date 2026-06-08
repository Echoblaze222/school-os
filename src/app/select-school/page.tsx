'use client'
// src/app/select-school/page.tsx
// Step 1: User picks their school, then proceeds to login

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import styles from './select-school.module.css'

interface School {
  id: string
  name: string
  city: string
  state: string
  school_type: string
  primary_color: string | null
  slug: string
}

export default function SelectSchoolPage() {
  const router = useRouter()
  const supabase = createClient()
  const [query, setQuery] = useState('')
  const [schools, setSchools] = useState<School[]>([])
  const [loading, setLoading] = useState(false)
  const [mounted, setMounted] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setMounted(true)
    // Load initial schools
    fetchSchools('')
    setTimeout(() => inputRef.current?.focus(), 600)
  }, [])

  async function fetchSchools(search: string) {
    setLoading(true)
    let q = supabase
      .from('schools')
      .select('id, name, city, state, school_type, primary_color, slug')
      .eq('status', 'active')
      .eq('is_platform_active', true)
      .order('name')
      .limit(20)

    if (search.trim()) {
      q = q.ilike('name', `%${search}%`)
    }

    const { data } = await q
    setSchools(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    const timer = setTimeout(() => fetchSchools(query), 300)
    return () => clearTimeout(timer)
  }, [query])

  function selectSchool(school: School) {
    // Store selected school in sessionStorage for login page
    sessionStorage.setItem('selected_school', JSON.stringify({
      id: school.id,
      name: school.name,
      slug: school.slug,
      primaryColor: school.primary_color,
    }))
    router.push('/login')
  }

  function getInitials(name: string) {
    return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
  }

  function getTypeIcon(type: string) {
    if (type?.toLowerCase().includes('primary')) return '🏫'
    if (type?.toLowerCase().includes('secondary')) return '🎓'
    if (type?.toLowerCase().includes('tertiary')) return '🏛️'
    return '📚'
  }

  return (
    <div className={styles.page}>
      {/* Background */}
      <div className={styles.bgGlow} />
      <div className={styles.bgGrid} />

      <div className={`${styles.container} ${mounted ? styles.visible : ''}`}>
        {/* Header */}
        <div className={styles.header}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/logo.png" alt="SchoolOS" className={styles.logo} />
          <div className={styles.headerText}>
            <h1 className={styles.title}>Select Your School</h1>
            <p className={styles.subtitle}>Find your school to continue</p>
          </div>
        </div>

        {/* Search */}
        <div className={styles.searchWrap}>
          <span className={styles.searchIcon}>🔍</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search school name..."
            className={styles.searchInput}
            autoComplete="off"
          />
          {query && (
            <button className={styles.clearBtn} onClick={() => setQuery('')}>✕</button>
          )}
        </div>

        {/* School list */}
        <div className={styles.listWrap}>
          {loading ? (
            <div className={styles.loadingState}>
              <div className={styles.spinner} />
              <p>Finding schools...</p>
            </div>
          ) : schools.length === 0 ? (
            <div className={styles.emptyState}>
              <span className={styles.emptyIcon}>🏫</span>
              <p className={styles.emptyTitle}>No schools found</p>
              <p className={styles.emptyMsg}>
                {query ? `No results for "${query}"` : 'No active schools yet'}
              </p>
            </div>
          ) : (
            <ul className={styles.list}>
              {schools.map((school, i) => (
                <li
                  key={school.id}
                  className={styles.schoolItem}
                  style={{ animationDelay: `${i * 40}ms` }}
                  onClick={() => selectSchool(school)}
                >
                  <div
                    className={styles.schoolAvatar}
                    style={{ background: school.primary_color || '#800020' }}
                  >
                    {getInitials(school.name)}
                  </div>
                  <div className={styles.schoolInfo}>
                    <p className={styles.schoolName}>{school.name}</p>
                    <p className={styles.schoolMeta}>
                      {getTypeIcon(school.school_type)} {school.school_type} &nbsp;·&nbsp;
                      📍 {[school.city, school.state].filter(Boolean).join(', ') || 'Nigeria'}
                    </p>
                  </div>
                  <span className={styles.chevron}>›</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Register link */}
        <div className={styles.footer}>
          <p className={styles.footerText}>
            School not listed?{' '}
            <button className={styles.registerLink} onClick={() => router.push('/register')}>
              Register your school
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
