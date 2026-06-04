'use client'
// src/app/dashboard/teacher/assignments/AssignmentsClient.tsx
// FIX #11: class_id selection from teacher's assigned classes (not free text)

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { ClipboardIcon, PlusIcon, CheckCircleIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'

interface Props { profile: any; school: any; userId: string }

interface TeacherClass {
  class_id:   string
  class_name: string
  subject:    string | null
}

export default function AssignmentsClient({ profile, school, userId }: Props) {
  const [items,          setItems]          = useState<any[]>([])
  const [teacherClasses, setTeacherClasses] = useState<TeacherClass[]>([])
  const [loading,        setLoading]        = useState(true)
  const [showForm,       setShowForm]       = useState(false)
  const [saving,         setSaving]         = useState(false)
  const [tab,            setTab]            = useState<'active' | 'past'>('active')
  const [form,           setForm]           = useState({
    title: '', subject: '', description: '', due_date: '',
    class_id: '', class_level: '',
  })
  const searchParams = useSearchParams()
  const supabase    = createClient()
  const schoolColor = school?.primary_color ?? '#7C3AED'

  useEffect(() => {
    loadTeacherClasses()
  }, [])

  useEffect(() => { load() }, [tab])

  // Pre-fill class from query param (coming from Classes quick action)
  useEffect(() => {
    const classId   = searchParams.get('class_id')
    const className = searchParams.get('class_name')
    if (classId) {
      setForm(prev => ({ ...prev, class_id: classId }))
      setShowForm(true)
    }
  }, [searchParams])

  async function loadTeacherClasses() {
    const { data } = await supabase
      .from('class_teachers')
      .select('class_id, subject, classes(name, class_level)')
      .eq('teacher_id', userId)
      .eq('school_id', school?.id)
    if (data) {
      setTeacherClasses(data.map((ct: any) => ({
        class_id:   ct.class_id,
        class_name: ct.classes?.name ?? '',
        subject:    ct.subject,
      })))
    }
  }

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('assignments')
      .select('id, title, subject, due_date, class_id, class_level, submission_count, total_students, created_at, classes(name)')
      .eq('teacher_id', userId)
      .eq('school_id', school?.id)
      .order('due_date', { ascending: tab === 'active' })
    if (data) {
      setItems(tab === 'active'
        ? data.filter((a: any) => new Date(a.due_date) >= new Date())
        : data.filter((a: any) => new Date(a.due_date) < new Date()))
    }
    setLoading(false)
  }

  async function createAssignment() {
    if (!form.title || !form.due_date) return
    setSaving(true)

    // Get class_level from selected class
    const cls = teacherClasses.find(c => c.class_id === form.class_id)

    await supabase.from('assignments').insert({
      title:       form.title,
      subject:     form.subject || cls?.subject || '',
      description: form.description,
      due_date:    form.due_date,
      class_id:    form.class_id || null,
      class_level: form.class_level,
      teacher_id:  userId,
      school_id:   school?.id,
      status:      'active',
    })
    setForm({ title: '', subject: '', description: '', due_date: '', class_id: '', class_level: '' })
    setShowForm(false)
    load()
    setSaving(false)
  }

  return (
    <RolePageWrapper userId={userId} role="teacher" profile={profile} school={school} title="Assignments">
      <div className={styles.tabs} style={{ marginBottom: 'var(--space-4)' }}>
        {(['active', 'past'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`}
            style={tab === t ? { background: schoolColor, color: '#fff', borderColor: schoolColor } : {}}>
            {t === 'active' ? 'Active' : 'Past'}
          </button>
        ))}
        <button onClick={() => setShowForm(!showForm)}
          style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', background: schoolColor, color: '#fff', border: 'none', borderRadius: 999, fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
          <PlusIcon size={13} color="white" /> New
        </button>
      </div>

      {showForm && (
        <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-5)', marginBottom: 'var(--space-5)' }}>
          <p style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 'var(--space-4)', fontSize: '0.9rem' }}>New Assignment</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>

            {/* Title */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Title *</label>
              <input type="text" value={form.title} onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
                placeholder="e.g. Chapter 3 Exercise"
                style={{ height: 40, padding: '0 12px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }} />
            </div>

            {/* Class selector — FIX #11 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Assign to Class</label>
              <select
                value={form.class_id}
                onChange={e => {
                  const cls = teacherClasses.find(c => c.class_id === e.target.value)
                  setForm(prev => ({
                    ...prev,
                    class_id: e.target.value,
                    subject: cls?.subject || prev.subject,
                  }))
                }}
                style={{ height: 40, padding: '0 12px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }}
              >
                <option value="">All my classes</option>
                {teacherClasses.map(cls => (
                  <option key={`${cls.class_id}-${cls.subject}`} value={cls.class_id}>
                    {cls.class_name}{cls.subject ? ` (${cls.subject})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Subject */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Subject</label>
              <input type="text" value={form.subject} onChange={e => setForm(prev => ({ ...prev, subject: e.target.value }))}
                placeholder="e.g. Mathematics"
                style={{ height: 40, padding: '0 12px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }} />
            </div>

            {/* Due date */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Due Date *</label>
              <input type="date" value={form.due_date} onChange={e => setForm(prev => ({ ...prev, due_date: e.target.value }))}
                style={{ height: 40, padding: '0 12px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }} />
            </div>

            {/* Description */}
            <div style={{ gridColumn: '1/-1', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Description</label>
              <textarea value={form.description} onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Assignment details..."
                style={{ height: 70, padding: '8px 12px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none', resize: 'vertical' }} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
            <button onClick={createAssignment} disabled={saving || !form.title || !form.due_date}
              style={{ flex: 1, height: 40, background: schoolColor, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Creating...' : 'Create Assignment'}
            </button>
            <button onClick={() => setShowForm(false)}
              style={{ height: 40, padding: '0 16px', background: 'transparent', border: '1px solid var(--glass-border)', borderRadius: 8, color: 'var(--text-muted)', fontSize: '0.85rem', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Assignment list */}
      {loading ? (
        <div className={styles.loading}><span /><span /><span /></div>
      ) : items.length === 0 ? (
        <div className={styles.empty}>
          <ClipboardIcon size={40} color="var(--text-faint)" strokeWidth={1} />
          <p>No {tab} assignments</p>
        </div>
      ) : (
        <div className={styles.list}>
          {items.map((item: any) => (
            <div key={item.id} className={styles.card}>
              <div className={styles.cardIcon} style={{ background: schoolColor + '20' }}>
                <ClipboardIcon size={18} color={schoolColor} />
              </div>
              <div className={styles.cardBody}>
                <p className={styles.cardTitle}>{item.title}</p>
                <p className={styles.cardMeta}>
                  {item.subject}
                  {item.classes?.name ? ` · ${item.classes.name}` : item.class_level ? ` · ${item.class_level}` : ''}
                  {' · Due '}
                  {new Date(item.due_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                </p>
              </div>
              {item.submission_count != null && (
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                  {item.submission_count}/{item.total_students ?? '?'}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ height: 100 }} />
    </RolePageWrapper>
  )
}
