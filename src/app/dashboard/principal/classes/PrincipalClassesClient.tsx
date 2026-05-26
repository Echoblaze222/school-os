'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  UsersIcon, BookOpenIcon, UserCheckIcon, ArrowLeftIcon,
  SunIcon, MoonIcon, PlusIcon, XIcon, ChevronRightIcon,
  BuildingIcon, SearchIcon,
} from '@/components/Icons'
import styles from './classes.module.css'

export default function PrincipalClassesClient({
  classes, teachers, subjects, schoolId, userId,
}: any) {
  const router   = useRouter()
  const supabase = createClient()

  const [theme,       setTheme]       = useState<'dark' | 'light'>('dark')
  const [search,      setSearch]      = useState('')
  const [activeClass, setActiveClass] = useState<any>(null)
  const [showCreate,  setShowCreate]  = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  // New class form
  const [newLevel,    setNewLevel]    = useState('JSS1')
  const [newSection,  setNewSection]  = useState('A')
  const [newCapacity, setNewCapacity] = useState('40')
  const [newYear,     setNewYear]     = useState(`${new Date().getFullYear()}/${new Date().getFullYear() + 1}`)

  useEffect(() => {
    const saved = localStorage.getItem('schoolos_theme') as any
    if (saved) {
      setTheme(saved)
      document.documentElement.setAttribute('data-theme', saved === 'light' ? 'light' : '')
    }
  }, [])

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next); localStorage.setItem('schoolos_theme', next)
    document.documentElement.setAttribute('data-theme', next === 'light' ? 'light' : '')
  }

  async function createClass() {
    if (!newLevel || !newSection) { setError('Level and section are required.'); return }
    setSaving(true); setError(null)

    const { error: err } = await supabase
      .from('classes')
      .insert({
        school_id:    schoolId,
        level:        newLevel,
        section:      newSection,
        capacity:     parseInt(newCapacity) || 40,
        academic_year: newYear,
      })

    if (err) {
      setError(err.message)
    } else {
      setShowCreate(false)
      router.refresh()
    }
    setSaving(false)
  }

  const LEVELS = ['Pre-Nursery', 'Nursery 1', 'Nursery 2', 'KG1', 'KG2', 'Primary 1', 'Primary 2', 'Primary 3', 'Primary 4', 'Primary 5', 'Primary 6', 'JSS1', 'JSS2', 'JSS3', 'SSS1', 'SSS2', 'SSS3']
  const SECTIONS = ['A', 'B', 'C', 'D', 'E', 'F', 'G']

  const filtered = classes.filter((c: any) => {
    const label = `${c.level} ${c.section}`.toLowerCase()
    return !search || label.includes(search.toLowerCase())
  })

  // Group classes by level
  const grouped: Record<string, any[]> = {}
  filtered.forEach((c: any) => {
    if (!grouped[c.level]) grouped[c.level] = []
    grouped[c.level].push(c)
  })

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.push('/dashboard/principal')}>
          <ArrowLeftIcon size={18} />
        </button>
        <h1 className={styles.headerTitle}>Classes</h1>
        <div className={styles.headerActions}>
          <button className={styles.iconBtn} onClick={toggleTheme}>
            {theme === 'dark' ? <SunIcon size={17} /> : <MoonIcon size={17} />}
          </button>
          <button
            className={styles.addBtn}
            onClick={() => setShowCreate(true)}
            style={{ background: 'var(--burgundy)' }}
          >
            <PlusIcon size={16} color="white" />
            <span>New Class</span>
          </button>
        </div>
      </header>

      {/* Stats */}
      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <BuildingIcon size={16} color="var(--burgundy)" />
          <span className={styles.statNum}>{classes.length}</span>
          <span className={styles.statLabel}>Total Classes</span>
        </div>
        <div className={styles.statCard}>
          <UsersIcon size={16} color="#3B82F6" />
          <span className={styles.statNum}>
            {classes.reduce((s: number, c: any) => s + (c.student_profiles?.length ?? 0), 0)}
          </span>
          <span className={styles.statLabel}>Total Students</span>
        </div>
        <div className={styles.statCard}>
          <UserCheckIcon size={16} color="#10B981" />
          <span className={styles.statNum}>{teachers.length}</span>
          <span className={styles.statLabel}>Teachers</span>
        </div>
      </div>

      {/* Search */}
      <div className={styles.searchBar}>
        <SearchIcon size={16} color="var(--text-muted)" />
        <input
          type="text"
          placeholder="Search class e.g. JSS2A..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className={styles.searchInput}
        />
      </div>

      {/* Classes grouped by level */}
      <div className={styles.content}>
        {Object.entries(grouped).map(([level, levelClasses]) => (
          <div key={level} className={styles.levelGroup}>
            <p className={styles.levelLabel}>{level}</p>
            <div className={styles.classGrid}>
              {levelClasses.map((cls: any) => {
                const studentCount = cls.student_profiles?.length ?? 0
                const subjectCount = cls.class_subjects?.length ?? 0
                const fillPercent  = cls.capacity > 0
                  ? Math.round((studentCount / cls.capacity) * 100) : 0

                return (
                  <button
                    key={cls.id}
                    className={styles.classCard}
                    onClick={() => setActiveClass(cls)}
                  >
                    <div className={styles.classCardTop}>
                      <p className={styles.classCardName}>
                        {cls.level} {cls.section}
                      </p>
                      <ChevronRightIcon size={14} color="var(--text-muted)" />
                    </div>

                    <div className={styles.classCapacityBar}>
                      <div
                        className={styles.classCapacityFill}
                        style={{
                          width:      `${fillPercent}%`,
                          background: fillPercent >= 90 ? '#EF4444'
                            : fillPercent >= 70 ? '#F59E0B'
                            : 'var(--burgundy)',
                        }}
                      />
                    </div>

                    <div className={styles.classStats}>
                      <span>
                        <UsersIcon size={11} color="var(--text-muted)" />
                        {studentCount}/{cls.capacity}
                      </span>
                      <span>
                        <BookOpenIcon size={11} color="var(--text-muted)" />
                        {subjectCount} subjects
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className={styles.empty}>
            <BuildingIcon size={40} color="var(--text-muted)" />
            <p className={styles.emptyTitle}>
              {search ? 'No classes found' : 'No classes yet'}
            </p>
            <p className={styles.emptyHint}>
              {search ? 'Try a different search' : 'Tap "New Class" to create your first class'}
            </p>
          </div>
        )}
      </div>

      {/* Class detail panel */}
      {activeClass && (
        <div className={styles.detailOverlay} onClick={() => setActiveClass(null)}>
          <div className={styles.detailPanel} onClick={e => e.stopPropagation()}>
            <div className={styles.detailHeader}>
              <h2 className={styles.detailTitle}>
                {activeClass.level} {activeClass.section}
              </h2>
              <button className={styles.closeBtn} onClick={() => setActiveClass(null)}>
                <XIcon size={18} />
              </button>
            </div>

            <div className={styles.detailStats}>
              <div className={styles.detailStat}>
                <p className={styles.detailStatVal}>{activeClass.student_profiles?.length ?? 0}</p>
                <p className={styles.detailStatLabel}>Students</p>
              </div>
              <div className={styles.detailStat}>
                <p className={styles.detailStatVal}>{activeClass.capacity}</p>
                <p className={styles.detailStatLabel}>Capacity</p>
              </div>
              <div className={styles.detailStat}>
                <p className={styles.detailStatVal}>{activeClass.class_subjects?.length ?? 0}</p>
                <p className={styles.detailStatLabel}>Subjects</p>
              </div>
            </div>

            {activeClass.class_subjects?.length > 0 && (
              <>
                <p className={styles.detailSectionLabel}>Subjects & Teachers</p>
                <div className={styles.subjectList}>
                  {activeClass.class_subjects.map((cs: any) => (
                    <div key={cs.id} className={styles.subjectRow}>
                      <div className={styles.subjectIconBox}>
                        <BookOpenIcon size={14} color="var(--burgundy)" />
                      </div>
                      <div className={styles.subjectInfo}>
                        <p className={styles.subjectName}>{cs.subjects?.name}</p>
                        <p className={styles.teacherName}>
                          {cs.profiles?.full_name ?? 'No teacher assigned'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className={styles.detailActions}>
              <a
                href={`/dashboard/principal/students?class=${activeClass.id}`}
                className={styles.detailBtn}
              >
                <UsersIcon size={15} />
                View Students
              </a>
              <a
                href={`/dashboard/principal/students/promote?from=${activeClass.id}`}
                className={styles.detailBtn}
              >
                <UserCheckIcon size={15} />
                Promote Class
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Create class modal */}
      {showCreate && (
        <div className={styles.detailOverlay} onClick={() => setShowCreate(false)}>
          <div className={styles.detailPanel} onClick={e => e.stopPropagation()}>
            <div className={styles.detailHeader}>
              <h2 className={styles.detailTitle}>Create New Class</h2>
              <button className={styles.closeBtn} onClick={() => setShowCreate(false)}>
                <XIcon size={18} />
              </button>
            </div>

            <div className={styles.createForm}>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Class Level</label>
                <select
                  className="input"
                  value={newLevel}
                  onChange={e => setNewLevel(e.target.value)}
                >
                  {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>

              <div className={styles.formField}>
                <label className={styles.formLabel}>Section</label>
                <select
                  className="input"
                  value={newSection}
                  onChange={e => setNewSection(e.target.value)}
                >
                  {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div className={styles.formField}>
                <label className={styles.formLabel}>Capacity (max students)</label>
                <input
                  type="number"
                  className="input"
                  value={newCapacity}
                  onChange={e => setNewCapacity(e.target.value)}
                  min="1"
                  max="200"
                />
              </div>

              <div className={styles.formField}>
                <label className={styles.formLabel}>Academic Year</label>
                <input
                  type="text"
                  className="input"
                  value={newYear}
                  onChange={e => setNewYear(e.target.value)}
                  placeholder="e.g. 2024/2025"
                />
              </div>

              {error && (
                <p className={styles.errorMsg}>{error}</p>
              )}

              <button
                className={styles.createBtn}
                onClick={createClass}
                disabled={saving}
              >
                {saving ? 'Creating...' : 'Create Class'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ height: '80px' }} />
    </div>
  )
}
