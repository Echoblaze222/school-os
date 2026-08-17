'use client'
// src/app/dashboard/teacher/clinic/ClinicClient.tsx
//
// Deliberately narrower than Secretary's clinic view: teacher only gets the
// allergy/condition *summary* for students in classes they actually teach -
// no visit log, no editing. Matches the medical_records_teacher_own_class_students
// RLS policy in schoolos_library_clinic.sql exactly, so this UI can't show
// anything the database wouldn't return anyway.

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { ActivityIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'
import { SkeletonList } from '@/components/motion/Skeleton'

interface Props { profile: any; school: any; userId: string }

export default function ClinicClient({ profile, school, userId }: Props) {
  const [loading, setLoading] = useState(true)
  const [rows,    setRows]    = useState<any[]>([])
  const [search,  setSearch]  = useState('')
  const supabase = createClient()
  const sc = school?.primary_color ?? '#800020'

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)

    // Classes this teacher actually teaches
    const { data: classLinks } = await supabase.from('class_teachers').select('class_id').eq('teacher_id', userId)
    const classIds = [...new Set((classLinks ?? []).map(c => c.class_id))]
    if (!classIds.length) { setRows([]); setLoading(false); return }

    // Students in those classes
    const { data: studentProfiles } = await supabase.from('student_profiles').select('id, class_id').in('class_id', classIds)
    const studentIds = (studentProfiles ?? []).map(s => s.id)
    if (!studentIds.length) { setRows([]); setLoading(false); return }

    const { data: names } = await supabase.from('profiles').select('id, full_name, default_code').in('id', studentIds)
    const { data: records } = await supabase.from('student_medical_records').select('*').in('student_id', studentIds)
    const recordByStudent = new Map((records ?? []).map(r => [r.student_id, r]))

    const merged = (names ?? [])
      .map(n => ({ ...n, record: recordByStudent.get(n.id) ?? null }))
      .sort((a, b) => a.full_name.localeCompare(b.full_name))

    setRows(merged)
    setLoading(false)
  }

  const filtered = rows.filter(r => r.full_name.toLowerCase().includes(search.toLowerCase()))
  const withAllergies = rows.filter(r => r.record?.allergies)

  return (
    <RolePageWrapper userId={userId} role="teacher" profile={profile} school={school} title="Clinic">
      {loading ? (
        <SkeletonList count={4} variant="card" />
      ) : rows.length === 0 ? (
        <div className={styles.empty}>
          <ActivityIcon size={40} color="var(--text-faint)" strokeWidth={1}/>
          <p>No students found in your classes.</p>
        </div>
      ) : (
        <>
          {withAllergies.length > 0 && (
            <div className={styles.statsRow} style={{ marginBottom: 'var(--space-4)' }}>
              <div className={styles.statCard}>
                <p className={styles.statVal} style={{ color: 'var(--danger)' }}>{withAllergies.length}</p>
                <p className={styles.statLbl}>With allergies noted</p>
              </div>
              <div className={styles.statCard}>
                <p className={styles.statVal} style={{ color: sc }}>{rows.length}</p>
                <p className={styles.statLbl}>Students</p>
              </div>
            </div>
          )}

          <div className={styles.searchBox} style={{ marginBottom: 'var(--space-4)' }}>
            <input className={styles.searchInput} placeholder="Search students…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '0 0 var(--space-4)' }}>
            Showing the safety-relevant summary only. Full clinic visit history isn't available to teachers. Contact the school office for that.
          </p>

          <div className={styles.list}>
            {filtered.map(r => (
              <div key={r.id} className={styles.card} style={{ cursor: 'default' }}>
                <div className={styles.cardIcon} style={{ background: (r.record?.allergies ? 'var(--danger)' : sc) + '22', color: r.record?.allergies ? 'var(--danger)' : sc }}>
                  <ActivityIcon size={18} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className={styles.cardTitle}>{r.full_name}{r.default_code ? ` (${r.default_code})` : ''}</p>
                  <p className={styles.cardMeta}>
                    {r.record
                      ? (r.record.allergies
                          ? <span style={{ color: 'var(--danger)', fontWeight: 700 }}>Allergies: {r.record.allergies}</span>
                          : 'No allergies noted')
                      : 'No medical record on file'}
                    {r.record?.chronic_conditions ? ` · ${r.record.chronic_conditions}` : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      <div style={{ height: 110 }} />
    </RolePageWrapper>
  )
}
