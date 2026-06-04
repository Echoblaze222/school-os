'use client'
// src/app/dashboard/principal/classes/PrincipalClassesClient.tsx
// FIX: Detail panel now shows Class Teacher (👑) separately from Subject Teachers
// FIX: Class card shows teacher count and class teacher name
// FIX: Assign teacher modal writes to class_teachers table

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  UserIcon, BookOpenIcon, PeopleIcon, ArrowLeftIcon,
  SunIcon, MoonIcon, PlusIcon, XIcon, ChevronRightIcon,
  SchoolIcon, SearchIcon,
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
  const [showAssign,  setShowAssign]  = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  // New class form
  const [newLevel,    setNewLevel]    = useState('JSS1')
  const [newSection,  setNewSection]  = useState('A')
  const [newCapacity, setNewCapacity] = useState('40')
  const [newYear,     setNewYear]     = useState(`${new Date().getFullYear()}/${new Date().getFullYear() + 1}`)

  // Assign teacher form
  const [assignTeacher,   setAssignTeacher]   = useState('')
  const [assignSubject,   setAssignSubject]   = useState('')
  const [assignIsPrimary, setAssignIsPrimary] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('schoolos_theme') as any
    if (saved) {
      setTheme(saved)
      document.documentElement.setAttribute('data-theme', saved === 'light' ? 'light' : '')
    }
  }, [])

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('schoolos_theme', next)
    document.documentElement.setAttribute('data-theme', next === 'light' ? 'light' : '')
  }

  async function createClass() {
    if (!newLevel || !newSection) { setError('Level and section are required.'); return }
    setSaving(true); setError(null)
    const { error: err } = await supabase.from('classes').insert({
      school_id:     schoolId,
      name:          `${newLevel}${newSection}`,
      class_level:   newLevel,
      section:       newSection,
      capacity:      parseInt(newCapacity) || 40,
      academic_year: newYear,
    })
    if (err) { setError(err.message) } else { setShowCreate(false); router.refresh() }
    setSaving(false)
  }

  // FIX: Assign teacher writes to class_teachers table
  async function assignTeacherToClass() {
    if (!assignTeacher || !activeClass) return
    if (!assignIsPrimary && !assignSubject) { setError('Subject is required for subject teachers.'); return }
    setSaving(true); setError(null)

    // If marking as primary (class teacher), remove any existing primary for this class first
    if (assignIsPrimary) {
      await supabase
        .from('class_teachers')
        .update({ is_primary: false })
        .eq('class_id', activeClass.id)
        .eq('is_primary', true)
    }

    const { error: err } = await supabase.from('class_teachers').upsert({
      school_id:  schoolId,
      teacher_id: assignTeacher,
      class_id:   activeClass.id,
      subject:    assignIsPrimary ? null : assignSubject,
      role_type:  assignIsPrimary ? 'class_teacher' : 'subject_teacher',
      is_primary: assignIsPrimary,
    }, { onConflict: 'teacher_id,class_id,subject' })

    if (err) { setError(err.message) } else { setShowAssign(false); router.refresh() }
    setSaving(false)
  }

  // FIX: Remove a teacher from a class
  async function removeTeacher(classId: string, teacherId: string, subject: string | null) {
    await supabase
      .from('class_teachers')
      .delete()
      .eq('class_id', classId)
      .eq('teacher_id', teacherId)
      .eq('subject', subject ?? '')
    router.refresh()
    // Refresh active class data from updated classes list
    setActiveClass(null)
  }

  const LEVELS   = ['Pre-Nursery', 'Nursery 1', 'Nursery 2', 'KG1', 'KG2', 'Primary 1', 'Primary 2', 'Primary 3', 'Primary 4', 'Primary 5', 'Primary 6', 'JSS1', 'JSS2', 'JSS3', 'SSS1', 'SSS2', 'SSS3']
  const SECTIONS = ['A', 'B', 'C', 'D', 'E', 'F', 'G']

  const filtered = classes.filter((c: any) => {
    const label = `${c.class_level ?? ''} ${c.section ?? ''} ${c.name ?? ''}`.toLowerCase()
    return !search || label.includes(search.toLowerCase())
  })

  // Group by class_level
  const grouped: Record<string, any[]> = {}
  filtered.forEach((c: any) => {
    const key = c.class_level ?? 'Other'
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(c)
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
          <button className={styles.addBtn} onClick={() => setShowCreate(true)} style={{ background: 'var(--burgundy)' }}>
            <PlusIcon size={16} color="white" />
            <span>New Class</span>
          </button>
        </div>
      </header>

      {/* Stats */}
      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <SchoolIcon size={16} color="var(--burgundy)" />
          <span className={styles.statNum}>{classes.length}</span>
          <span className={styles.statLabel}>Total Classes</span>
        </div>
        <div className={styles.statCard}>
          <UserIcon size={16} color="#3B82F6" />
          <span className={styles.statNum}>
            {classes.reduce((s: number, c: any) => s + (c.student_count ?? 0), 0)}
          </span>
          <span className={styles.statLabel}>Total Students</span>
        </div>
        <div className={styles.statCard}>
          <PeopleIcon size={16} color="#10B981" />
          <span className={styles.statNum}>{teachers.length}</span>
          <span className={styles.statLabel}>Teachers</span>
        </div>
        {/* FIX: show classes without a class teacher assigned */}
        <div className={styles.statCard}>
          <SchoolIcon size={16} color="#EF4444" />
          <span className={styles.statNum} style={{ color: '#EF4444' }}>
            {classes.filter((c: any) => !c.class_teacher).length}
          </span>
          <span className={styles.statLabel}>No Class Teacher</span>
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
                const fillPercent = cls.capacity > 0
                  ? Math.round((cls.student_count / cls.capacity) * 100) : 0

                return (
                  <button key={cls.id} className={styles.classCard} onClick={() => setActiveClass(cls)}>
                    <div className={styles.classCardTop}>
                      <p className={styles.classCardName}>{cls.name ?? `${cls.class_level}${cls.section}`}</p>
                      <ChevronRightIcon size={14} color="var(--text-muted)" />
                    </div>

                    {/* FIX: Show class teacher name on card */}
                    {cls.class_teacher ? (
                      <p style={{ fontSize: '0.65rem', color: '#F59E0B', margin: '2px 0 4px', fontWeight: 600 }}>
                        👑 {cls.class_teacher.full_name.split(' ')[0]}
                      </p>
                    ) : (
                      <p style={{ fontSize: '0.65rem', color: '#EF4444', margin: '2px 0 4px', fontWeight: 600 }}>
                        ⚠ No class teacher
                      </p>
                    )}

                    <div className={styles.classCapacityBar}>
                      <div className={styles.classCapacityFill} style={{
                        width:      `${fillPercent}%`,
                        background: fillPercent >= 90 ? '#EF4444' : fillPercent >= 70 ? '#F59E0B' : 'var(--burgundy)',
                      }} />
                    </div>

                    <div className={styles.classStats}>
                      <span><UserIcon size={11} color="var(--text-muted)" /> {cls.student_count}/{cls.capacity}</span>
                      {/* FIX: show total teacher count instead of subject count */}
                      <span><PeopleIcon size={11} color="var(--text-muted)" /> {cls.teacher_count} teachers</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className={styles.empty}>
            <SchoolIcon size={40} color="var(--text-muted)" />
            <p className={styles.emptyTitle}>{search ? 'No classes found' : 'No classes yet'}</p>
            <p className={styles.emptyHint}>{search ? 'Try a different search' : 'Tap "New Class" to create your first class'}</p>
          </div>
        )}
      </div>

      {/* Class detail panel */}
      {activeClass && (
        <div className={styles.detailOverlay} onClick={() => setActiveClass(null)}>
          <div className={styles.detailPanel} onClick={e => e.stopPropagation()}>
            <div className={styles.detailHeader}>
              <h2 className={styles.detailTitle}>{activeClass.name ?? `${activeClass.class_level}${activeClass.section}`}</h2>
              <button className={styles.closeBtn} onClick={() => setActiveClass(null)}><XIcon size={18} /></button>
            </div>

            {/* Stats */}
            <div className={styles.detailStats}>
              <div className={styles.detailStat}>
                <p className={styles.detailStatVal}>{activeClass.student_count ?? 0}</p>
                <p className={styles.detailStatLabel}>Students</p>
              </div>
              <div className={styles.detailStat}>
                <p className={styles.detailStatVal}>{activeClass.capacity}</p>
                <p className={styles.detailStatLabel}>Capacity</p>
              </div>
              <div className={styles.detailStat}>
                <p className={styles.detailStatVal}>{activeClass.teacher_count ?? 0}</p>
                <p className={styles.detailStatLabel}>Teachers</p>
              </div>
            </div>

            {/* FIX: Class Teacher section */}
            <p className={styles.detailSectionLabel} style={{ marginTop: 16 }}>Class Teacher</p>
            {activeClass.class_teacher ? (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 12px',
                background: '#F59E0B10',
                border: '1px solid #F59E0B30',
                borderRadius: 8,
                marginBottom: 12,
              }}>
                <div>
                  <p style={{ margin: '0 0 1px', fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.88rem' }}>
                    👑 {activeClass.class_teacher.full_name}
                  </p>
                  <p style={{ margin: 0, fontSize: '0.7rem', color: '#F59E0B' }}>All subjects · Class admin</p>
                </div>
                <button
                  onClick={() => removeTeacher(activeClass.id, activeClass.class_teacher.teacher_id, null)}
                  style={{ fontSize: '0.7rem', color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
                  Remove
                </button>
              </div>
            ) : (
              <div style={{
                padding: '10px 12px',
                background: '#EF444410',
                border: '1px solid #EF444430',
                borderRadius: 8,
                marginBottom: 12,
                fontSize: '0.8rem',
                color: '#EF4444',
                fontWeight: 600,
              }}>
                ⚠ No class teacher assigned
              </div>
            )}

            {/* FIX: Subject Teachers section */}
            <p className={styles.detailSectionLabel}>Subject Teachers ({activeClass.subject_teachers?.length ?? 0})</p>
            {(activeClass.subject_teachers?.length ?? 0) === 0 ? (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 12 }}>No subject teachers assigned.</p>
            ) : (
              <div className={styles.subjectList} style={{ marginBottom: 12 }}>
                {activeClass.subject_teachers.map((st: any, i: number) => (
                  <div key={i} className={styles.subjectRow}>
                    <div className={styles.subjectIconBox}>
                      <BookOpenIcon size={14} color="var(--burgundy)" />
                    </div>
                    <div className={styles.subjectInfo}>
                      <p className={styles.subjectName}>{st.subject}</p>
                      <p className={styles.teacherName}>{st.full_name}</p>
                    </div>
                    <button
                      onClick={() => removeTeacher(activeClass.id, st.teacher_id, st.subject)}
                      style={{ fontSize: '0.68rem', color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, marginLeft: 'auto', flexShrink: 0 }}>
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Assign teacher button */}
            <button
              onClick={() => { setShowAssign(true); setAssignTeacher(''); setAssignSubject(''); setAssignIsPrimary(false); setError(null) }}
              style={{
                width: '100%', padding: '10px',
                background: 'var(--burgundy)', color: '#fff',
                border: 'none', borderRadius: 8,
                fontWeight: 700, fontSize: '0.82rem',
                cursor: 'pointer', marginBottom: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
              <PlusIcon size={13} color="white" /> Assign Teacher
            </button>

            <div className={styles.detailActions}>
              <a href={`/dashboard/principal/students?class=${activeClass.id}`} className={styles.detailBtn}>
                <UserIcon size={15} /> View Students
              </a>
              <a href={`/dashboard/principal/students/promote?from=${activeClass.id}`} className={styles.detailBtn}>
                <PeopleIcon size={15} /> Promote Class
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Assign teacher modal */}
      {showAssign && activeClass && (
        <div className={styles.detailOverlay} onClick={() => setShowAssign(false)}>
          <div className={styles.detailPanel} onClick={e => e.stopPropagation()}>
            <div className={styles.detailHeader}>
              <h2 className={styles.detailTitle}>
                Assign Teacher to {activeClass.name ?? activeClass.class_level}
              </h2>
              <button className={styles.closeBtn} onClick={() => setShowAssign(false)}><XIcon size={18} /></button>
            </div>

            <div className={styles.createForm}>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Teacher</label>
                <select className="input" value={assignTeacher} onChange={e => setAssignTeacher(e.target.value)}>
                  <option value="">Select teacher…</option>
                  {teachers.map((t: any) => (
                    <option key={t.id} value={t.id}>{t.full_name}</option>
                  ))}
                </select>
              </div>

              {/* FIX: Role type toggle */}
              <div className={styles.formField}>
                <label className={styles.formLabel}>Role Type</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[
                    { v: false, label: 'Subject Teacher', color: '#3B82F6' },
                    { v: true,  label: '👑 Class Teacher', color: '#F59E0B' },
                  ].map(opt => (
                    <button
                      key={String(opt.v)}
                      onClick={() => setAssignIsPrimary(opt.v)}
                      style={{
                        flex: 1, padding: '8px',
                        background: assignIsPrimary === opt.v ? opt.color + '20' : 'var(--glass-bg)',
                        border: `1px solid ${assignIsPrimary === opt.v ? opt.color : 'var(--glass-border)'}`,
                        borderRadius: 8,
                        color: assignIsPrimary === opt.v ? opt.color : 'var(--text-muted)',
                        fontWeight: 700, fontSize: '0.78rem',
                        cursor: 'pointer', fontFamily: 'inherit',
                      }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Subject only shown for subject teachers */}
              {!assignIsPrimary && (
                <div className={styles.formField}>
                  <label className={styles.formLabel}>Subject *</label>
                  <select className="input" value={assignSubject} onChange={e => setAssignSubject(e.target.value)}>
                    <option value="">Select subject…</option>
                    {subjects.map((s: any) => (
                      <option key={s.id} value={s.name}>{s.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {assignIsPrimary && (
                <p style={{ fontSize: '0.75rem', color: '#F59E0B', margin: '-8px 0 0', lineHeight: 1.5 }}>
                  This teacher will be the class admin — responsible for attendance, reports, and class-wide management. Any existing class teacher will be demoted.
                </p>
              )}

              {error && <p className={styles.errorMsg}>{error}</p>}

              <button
                className={styles.createBtn}
                onClick={assignTeacherToClass}
                disabled={saving || !assignTeacher || (!assignIsPrimary && !assignSubject)}
              >
                {saving ? 'Assigning...' : 'Assign Teacher'}
              </button>
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
              <button className={styles.closeBtn} onClick={() => setShowCreate(false)}><XIcon size={18} /></button>
            </div>
            <div className={styles.createForm}>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Class Level</label>
                <select className="input" value={newLevel} onChange={e => setNewLevel(e.target.value)}>
                  {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Section</label>
                <select className="input" value={newSection} onChange={e => setNewSection(e.target.value)}>
                  {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Capacity</label>
                <input type="number" className="input" value={newCapacity} onChange={e => setNewCapacity(e.target.value)} min="1" max="200" />
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Academic Year</label>
                <input type="text" className="input" value={newYear} onChange={e => setNewYear(e.target.value)} placeholder="e.g. 2025/2026" />
              </div>
              {error && <p className={styles.errorMsg}>{error}</p>}
              <button className={styles.createBtn} onClick={createClass} disabled={saving}>
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
