'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import styles from './select-school.module.css'

interface School {
  id: string
  name: string
  city: string | null
  state: string | null
  primary_color: string
  logo_url: string | null
  tagline: string | null
  school_type: string
  is_platform_active: boolean
}

export default function SelectSchoolPage() {
  const router = useRouter()
  const supabase = createClient()

  const [query, setQuery]           = useState('')
  const [results, setResults]       = useState<School[]>([])
  const [searching, setSearching]   = useState(false)
  const [selected, setSelected]     = useState<School | null>(null)
  const [theme, setTheme]           = useState<'dark' | 'light'>('dark')
  const searchRef                   = useRef<HTMLInputElement>(null)
  // ✅ After
const debounceRef = useRef<NodeJS.Timeout | undefined>(undefined)

  useEffect(() => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    setTheme(prefersDark ? 'dark' : 'light')
    searchRef.current?.focus()
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : '')
  }, [theme])

  // Debounced search
  function handleSearch(value: string) {
    setQuery(value)
    setSelected(null)
    clearTimeout(debounceRef.current)

    if (value.trim().length < 2) {
      setResults([])
      return
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      const { data } = await supabase
        .from('schools')
        .select('id, name, city, state, primary_color, logo_url, tagline, school_type, is_platform_active')
        .ilike('name', `%${value.trim()}%`)
        .or('status.eq.active,setup_status.eq.active,setup_status.eq.trial')
        .limit(8)

      setResults(data ?? [])
      setSearching(false)
    }, 350)
  }

  function selectSchool(school: School) {
    setSelected(school)
    setQuery(school.name)
    setResults([])
    // Store selected school ID for the login page to load branding
    localStorage.setItem('schoolos_school_id', school.id)
    localStorage.setItem('schoolos_school_name', school.name)
    localStorage.setItem('schoolos_school_color', school.primary_color)
  }

  function proceedToLogin() {
    if (!selected) return
    router.push('/login')
  }

  function clearSelection() {
    setSelected(null)
    setQuery('')
    setResults([])
    searchRef.current?.focus()
  }

  return (
    <div className={styles.page}>
      {/* Background glow orbs */}
      <div className={`${styles.glowOrb} ${styles.orb1}`} />
      <div className={`${styles.glowOrb} ${styles.orb2}`} />

      {/* Theme toggle */}
      <button
        className={styles.themeToggle}
        onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
      >
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>

      <div className={styles.container}>

        {/* Platform wordmark */}
        <div className={styles.wordmark}>
          <span className={styles.wordmarkSchool}>School</span>
          <span className={styles.wordmarkOS}>OS</span>
        </div>

        <h1 className={styles.headline}>Find Your School</h1>
        <p className={styles.subheadline}>
          Search for your school to access your personalised portal
        </p>

        {/* Search box */}
        <div className={`glass-card ${styles.searchCard}`}>
          <div className={`${styles.searchBox} ${selected ? styles.searchBoxSelected : ''}`}>
            <span className={styles.searchIcon}>
              {searching ? '⏳' : selected ? '✅' : '🔍'}
            </span>
            <input
              ref={searchRef}
              type="text"
              placeholder="Type your school name..."
              value={query}
              onChange={e => handleSearch(e.target.value)}
              className={styles.searchInput}
              autoComplete="off"
            />
            {query && (
              <button className={styles.clearBtn} onClick={clearSelection}>✕</button>
            )}
          </div>

          {/* Search results dropdown */}
          {results.length > 0 && (
            <div className={styles.dropdown}>
              {results.map(school => (
                <button
                  key={school.id}
                  className={styles.schoolResult}
                  onClick={() => selectSchool(school)}
                >
                  {/* School logo or colored circle */}
                  <div
                    className={styles.schoolIcon}
                    style={{ background: school.primary_color }}
                  >
                    {school.logo_url
                      ? <img src={school.logo_url} alt={school.name} />
                      : <span>{school.name[0]?.toUpperCase()}</span>
                    }
                  </div>
                  <div className={styles.schoolInfo}>
                    <p className={styles.schoolName}>{school.name}</p>
                    <p className={styles.schoolLocation}>
                      {[school.city, school.state].filter(Boolean).join(', ') || 'Nigeria'}
                      {' · '}
                      <span style={{ textTransform: 'capitalize' }}>{school.school_type}</span>
                    </p>
                  </div>
                  {!school.is_platform_active && (
                    <span className={styles.inactiveBadge}>Inactive</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* No results */}
          {query.length >= 2 && !searching && results.length === 0 && !selected && (
            <div className={styles.noResults}>
              <p>No school found for "<strong>{query}</strong>"</p>
              <p className={styles.noResultsHint}>
                Contact your school administrator if your school is not listed.
              </p>
            </div>
          )}
        </div>

        {/* Selected school preview */}
        {selected && (
          <div
            className={`glass-card ${styles.selectedCard} animate-scale-in`}
            style={{ '--school-color': selected.primary_color } as React.CSSProperties}
          >
            <div
              className={styles.selectedBanner}
              style={{ background: `linear-gradient(135deg, ${selected.primary_color}CC, ${selected.primary_color}88)` }}
            >
              <div className={styles.selectedLogo}>
                {selected.logo_url
                  ? <img src={selected.logo_url} alt={selected.name} />
                  : <span>{selected.name[0]?.toUpperCase()}</span>
                }
              </div>
            </div>
            <div className={styles.selectedInfo}>
              <h2 className={styles.selectedName}>{selected.name}</h2>
              {selected.tagline && (
                <p className={styles.selectedTagline}>{selected.tagline}</p>
              )}
              <p className={styles.selectedLocation}>
                📍 {[selected.city, selected.state].filter(Boolean).join(', ') || 'Nigeria'}
              </p>
            </div>

            <button
              className={`btn btn-primary ${styles.proceedBtn}`}
              onClick={proceedToLogin}
              style={{
                background: `linear-gradient(135deg, ${selected.primary_color}, ${selected.primary_color}CC)`
              }}
            >
              Enter Portal →
            </button>
          </div>
        )}

        {/* Register school link */}
        <div className={styles.footer}>
          <p>Are you a school administrator?</p>
          <a href="/register-school" className={styles.registerLink}>
            Register your school on SchoolOS →
          </a>
        </div>

      </div>

      {/* Powered by */}
      <div className={styles.poweredBy}>
        Powered by <strong>SchoolOS</strong> — Premium School Management
      </div>
    </div>
  )
}