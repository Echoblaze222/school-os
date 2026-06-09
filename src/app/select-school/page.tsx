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
  const router   = useRouter()
  const supabase = createClient()

  const [query,    setQuery]    = useState('')
  const [results,  setResults]  = useState<School[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<School | null>(null)
  const [mounted,  setMounted]  = useState(false)

  const searchRef   = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<NodeJS.Timeout | undefined>(undefined)

  useEffect(() => {
    setMounted(true)
    searchRef.current?.focus()
  }, [])

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
    localStorage.setItem(SCHOOL_KEY, JSON.stringify({
      id: school.id,
      name: school.name,
      primaryColor: school.primary_color,
    }))
  }

  function clearSelection() {
    setSelected(null)
    setQuery('')
    setResults([])
    searchRef.current?.focus()
  }

  function proceedToLogin() {
    if (!selected) return
    router.push('/login')
  }

  return (
    <div className={styles.page}>
      <div className={styles.bgGlow} />
      <div className={styles.bgGrid} />

      <div className={`${styles.card} ${mounted ? styles.visible : ''}`}>

        {/* Top bar — matches login exactly */}
        <div className={styles.topBar}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/logo.png" alt="SchoolOS" className={styles.logo} />
          <div className={styles.topBarText}>
            <span className={styles.appName}>SchoolOS</span>
            <span className={styles.tagline}>Find your school portal</span>
          </div>
        </div>

        <div className={styles.formWrap}>
          <h2 className={styles.heading}>Find Your School</h2>
          <p className={styles.subheading}>
            Search for your school to access your personalised portal
          </p>

          {/* Search input */}
          <label className={styles.label}>School Name</label>
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
              <button className={styles.clearBtn} onClick={clearSelection} type="button">✕</button>
            )}
          </div>

          {/* Dropdown results */}
          {results.length > 0 && (
            <div className={styles.dropdown}>
              {results.map(school => (
                <button
                  key={school.id}
                  className={styles.schoolResult}
                  onClick={() => selectSchool(school)}
                  type="button"
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

          {/* No results */}
          {query.length >= 2 && !searching && results.length === 0 && !selected && (
            <div className={styles.noResults}>
              <p>No school found for &quot;<strong>{query}</strong>&quot;</p>
              <p className={styles.noResultsHint}>
                Contact your school administrator if your school is not listed.
              </p>
            </div>
          )}

          {/* Selected school preview */}
          {selected && (
            <div className={styles.selectedPreview}>
              <div
                className={styles.selectedBanner}
                style={{ background: `linear-gradient(135deg, ${selected.primary_color}CC, ${selected.primary_color}66)` }}
              >
                <div className={styles.selectedLogo}>
                  {selected.logo_url
                    ? <img src={selected.logo_url} alt={selected.name} />
                    : <span>{selected.name[0]?.toUpperCase()}</span>
                  }
                </div>
                <div className={styles.selectedMeta}>
                  <p className={styles.selectedName}>{selected.name}</p>
                  {selected.tagline && (
                    <p className={styles.selectedTagline}>{selected.tagline}</p>
                  )}
                  <p className={styles.selectedLocation}>
                    📍 {[selected.city, selected.state].filter(Boolean).join(', ') || 'Nigeria'}
                  </p>
                </div>
              </div>
            </div>
          )}

          <button
            className={styles.submitBtn}
            onClick={proceedToLogin}
            disabled={!selected}
            type="button"
          >
            {selected ? `Enter ${selected.name} Portal →` : 'Select a school first'}
          </button>

          <div className={styles.registerRow}>
            <span>Are you a school administrator?</span>
            <a href="/register-school" className={styles.registerLink}>
              Register school →
            </a>
          </div>
        </div>
      </div>

      <div className={styles.poweredBy}>
        Powered by <strong>SchoolOS</strong> — Premium School Management
      </div>
    </div>
  )
}
