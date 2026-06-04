'use client'
// src/app/dashboard/teacher/classes/ClassesClient.tsx
// FIX #9: Quick action buttons per class (Mark Attendance, New Assignment, View Results, Create Quiz)
// FIX #1: Loads from class_teachers table (multi-class aware)

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import {
  PeopleIcon, CalendarIcon, ClipboardIcon,
  BarChartIcon, AwardIcon,
} from '@/components/Icons'

interface Props { profile: any; school: any; userId: string }

interface TeacherClass {
  class_id:    string
  class_name:  string
  class_level: string
  section:     string | null
  subject:     string | null
  role_type:   string
  is_primary:  boolean
}

export default function ClassesClient({ profile, school, userId }: Props) {
  const [classes,  setClasses]  = useState<TeacherClass[]>([])
  const [selected, setSelected] = useState<TeacherClass | null>(null)
  const [students, setStudents] = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const router   = useRouter()
  const supabase = createClient()
  const sc       = school?.primary_color ?? '#7C3AED'

  useEffect(() => { load() }, [])
  useEffect(() => { if (selected) loadStudents(selected.class_id) }, [selected])

  async function load() {
    // FIX #1: load from class_teachers instead of classes.teacher_id
    const { data } = await supabase
      .from('class_teachers')
      .select(`
        class_id,
        subject,
        role_type,
        is_primary,
        classes(id, name, class_level, section)
      `)
      .eq('teacher_id', userId)
      .eq('school_id', school?.id)

    if (data && data.length > 0) {
      const list: TeacherClass[] = data.map((ct: any) => ({
        class_id:    ct.class_id,
        class_name:  ct.classes?.name ?? 'Unknown',
        class_level: ct.classes?.class_level ?? '',
        section:     ct.classes?.section ?? null,
        subject:     ct.subject,
        role_type:   ct.role_type,
        is_primary:  ct.is_primary,
      }))
      list.sort((a, b) => {
        if (a.is_primary && !b.is_primary) return -1
        if (!a.is_primary && b.is_primary) return 1
        return a.class_name.localeCompare(b.class_name)
      })
      setClasses(list)
      setSelected(list[0])
    }
    setLoading(false)
  }

  async function loadStudents(classId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, default_code, avatar_url')
      .eq('class_id', classId)
      .eq('role', 'student')
      .order('full_name')
    if (data) setStudents(data)
  }

  // Quick action: navigate with class context pre-filled via query param
  function goTo(path: string) {
    if (!selected) return
    router.push(`${path}?class_id=${selected.class_id}&class_name=${encodeURIComponent(selected.class_name)}`)
  }

  const QUICK_ACTIONS = [
    {
      label: 'Mark Attendance',
      Icon: CalendarIcon,
      color: '#14B8A6',
      onClick: () => goTo('/dashboard/teacher/attendance'),
    },
    {
      label: 'New Assignment',
      Icon: ClipboardIcon,
      color: '#F59E0B',
      onClick: () => goTo('/dashboard/teacher/assignments'),
    },
    {
      label: 'View Results',
      Icon: BarChartIcon,
      color: '#10B981',
      onClick: () => goTo('/dashboard/teacher/results'),
    },
    {
      label: 'Create Quiz',
      Icon: AwardIcon,
      color: '#8B5CF6',
      onClick: () => goTo('/dashboard/teacher/quizzes'),
    },
  ]

  return (
    <RolePageWrapper userId={userId} role="teacher" profile={profile} school={school} title="My Classes">
      {loading ? (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>Loading classes...</div>
      ) : classes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <PeopleIcon size={40} color="var(--text-faint)" strokeWidth={1} />
          <p style={{ color: 'var(--text-muted)', marginTop: 12 }}>
            No classes assigned yet. Contact your admin.
          </p>
        </div>
      ) : (
        <>
          {/* Class pills */}
          <div style={{ overflowX: 'auto', display: 'flex', gap: 8, marginBottom: 'var(--space-5)', paddingBottom: 4 }}>
            {classes.map(cls => (
              <button
                key={`${cls.class_id}-${cls.subject ?? 'all'}`}
                onClick={() => setSelected(cls)}
                style={{
                  flexShrink: 0,
                  padding: '6px 14px',
                  borderRadius: 999,
                  border: `1px solid ${selected?.class_id === cls.class_id ? sc : sc + '40'}`,
                  background: selected?.class_id === cls.class_id ? sc : 'transparent',
                  color: selected?.class_id === cls.class_id ? '#fff' : sc,
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {cls.class_name}
                {cls.is_primary ? ' 👑' : ''}
                {cls.subject ? ` (${cls.subject})` : ''}
              </button>
            ))}
          </div>

          {selected && (
            <>
              {/* Class info + role badge */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 14px',
                background: 'var(--glass-bg)',
                border: '1px solid var(--glass-border)',
                borderRadius: 10,
                marginBottom: 'var(--space-4)',
              }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.95rem' }}>
                    {selected.class_name}
                  </p>
                  <p style={{ margin: '2px 0 0', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                    {selected.class_level}
                    {selected.subject ? ` · ${selected.subject}` : ' · All Subjects'}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{
                    padding: '4px 10px',
                    borderRadius: 999,
                    background: selected.is_primary ? '#F59E0B20' : '#3B82F620',
                    border: `1px solid ${selected.is_primary ? '#F59E0B50' : '#3B82F650'}`,
                    color: selected.is_primary ? '#F59E0B' : '#3B82F6',
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    textTransform: 'uppercase' as const,
                    letterSpacing: '0.06em',
                  }}>
                    {selected.is_primary ? '👑 Class Teacher' : 'Subject Teacher'}
                  </span>
                  <p style={{ margin: '4px 0 0', color: sc, fontWeight: 700, fontSize: '0.82rem' }}>
                    {students.length} student{students.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>

              {/* FIX #9: Quick action buttons */}
              <p style={{
                fontSize: '0.65rem', fontWeight: 800,
                letterSpacing: '0.1em', textTransform: 'uppercase' as const,
                color: 'var(--text-muted)', marginBottom: 'var(--space-3)',
              }}>
                Quick Actions
              </p>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 8,
                marginBottom: 'var(--space-5)',
              }}>
                {QUICK_ACTIONS.map(action => (
                  <button
                    key={action.label}
                    onClick={action.onClick}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '10px 12px',
                      background: action.color + '12',
                      border: `1px solid ${action.color}30`,
                      borderRadius: 10,
                      cursor: 'pointer',
                      color: action.color,
                      fontWeight: 600,
                      fontSize: '0.8rem',
                      textAlign: 'left' as const,
                      transition: 'all 0.15s',
                    }}
                  >
                    <action.Icon size={16} color={action.color} />
                    {action.label}
                  </button>
                ))}
              </div>

              {/* Student roster */}
              <p style={{
                fontSize: '0.65rem', fontWeight: 800,
                letterSpacing: '0.1em', textTransform: 'uppercase' as const,
                color: 'var(--text-muted)', marginBottom: 'var(--space-3)',
              }}>
                Students in {selected.class_name} ({students.length})
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {students.map((s: any, i: number) => (
                  <div key={s.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 14px',
                    background: 'var(--glass-bg)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: 10,
                  }}>
                    {/* Rank */}
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-faint)', minWidth: 20, textAlign: 'center' as const }}>
                      {i + 1}
                    </span>
                    {/* Avatar */}
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%',
                      background: sc + '20',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      overflow: 'hidden', flexShrink: 0,
                    }}>
                      {s.avatar_url
                        ? <img src={s.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <span style={{ fontWeight: 700, color: sc, fontSize: '0.85rem' }}>{s.full_name?.[0]}</span>
                      }
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.88rem' }}>{s.full_name}</p>
                      <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.72rem' }}>{s.default_code}</p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
      <div style={{ height: 100 }} />
    </RolePageWrapper>
  )
}
