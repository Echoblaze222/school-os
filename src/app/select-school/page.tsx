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

const SCHOOL_KEY = 'schoolos_selected_school'

export default function SelectSchoolPage() {
  const router = useRouter()
  const supabase = createClient()

  const [query, setQuery]         = useState('')
  const [results, setResults]     = useState<School[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected]   = useState<School | null>(null)
  const [theme, setTheme]         = useState<'dark' | 'light'>('dark')
  const [visible, setVisible]     = useState(false)
  const searchRef                 = useRef<HTMLInputElement>(null)
  const debounceRef               = useRef<NodeJS.Timeout | undefined>(undefined)

  useEffect(() => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    setTheme(prefersDark ? 'dark' : 'light')
    // Trigger entrance animation
    requestAnimationFrame(() => setVisible(true))
    searchRef.current?.focus()
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : '')
  }, [theme])

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
        .eq('is_platform_active', true)
        .limit(8)

      setResults(data ?? [])
      setSearching(false)
    }, 350)
  }

  function selectSchool(school: School) {
    setSelected(school)
    setQuery(school.name)
    setResults([])
    // Store with a SINGLE consistent key used by login page
    localStorage.setItem(SCHOOL_KEY, JSON.stringify({
      id: school.id,
      name: school.name,
      primaryColor: school.primary_color,
      city: school.city,
      state: school.state,
    }))
  }

  function proceedToLogin() {
    if (!selected) return
    router.push('/login')
  }

  function clearSelection() {
    setSelected(null)
    setQuery('')
    setResults([])
    localStorage.removeItem(SCHOOL_KEY)
    searchRef.current?.focus()
  }

  return (
    <div className={styles.page}>
      <div className={`${styles.glowOrb} ${styles.orb1}`} />
      <div className={`${styles.glowOrb} ${styles.orb2}`} />

      <button
        className={styles.themeToggle}
        onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
        aria-label="Toggle theme"
      >
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>

      <div className={`${styles.container} ${visible ? styles.visible : ''}`}>

        <div className={styles.wordmark}>
          <span className={styles.wordmarkSchool}>School</span>
          <span className={styles.wordmarkOS}>OS</span>
        </div>

        <h1 className={styles.headline}>Find Your School</h1>
        <p className={styles.subheadline}>
          Search for your school to access your personalised portal
        </p>

        <div className={styles.searchCard}>
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
              <button className={styles.clearBtn} onClick={clearSelection} aria-label="Clear">✕</button>
            )}
          </div>

          {results.length > 0 && (
            <div className={styles.dropdown}>
              {results.map(school => (
                <button
                  key={school.id}
                  className={styles.schoolResult}
                  onClick={() => selectSchool(school)}
                >
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
                </button>
              ))}
            </div>
          )}

          {query.length >= 2 && !searching && results.length === 0 && !selected && (
            <div className={styles.noResults}>
              <p>No school found for &quot;<strong>{query}</strong>&quot;</p>
              <p className={styles.noResultsHint}>
                Contact your school administrator if your school is not listed.
              </p>
            </div>
          )}
        </div>

        {selected && (
          <div
            className={styles.selectedCard}
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
              className={styles.proceedBtn}
              onClick={proceedToLogin}
              style={{
                background: `linear-gradient(135deg, ${selected.primary_color}, ${selected.primary_color}CC)`
              }}
            >
              Enter Portal →
            </button>
          </div>
        )}

        <div className={styles.footer}>
          <p>Are you a school administrator?</p>
          <a href="/register-school" className={styles.registerLink}>
            Register your school on SchoolOS →
          </a>
        </div>

      </div>

      <div className={styles.poweredBy}>
        Powered by <strong>SchoolOS</strong> — Premium School Management
      </div>
    </div>
  )
}
