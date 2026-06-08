'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { ClipboardIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'

interface Props { profile: any; school: any; userId: string }

export default function AssignmentsClient({ profile, school, userId }: Props) {
  const [rows,    setRows]    = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [child,   setChild]   = useState<any>(null)
  const supabase = createClient()
  const sc = school?.primary_color ?? '#7C3AED'

  useEffect(() => { load() }, [])

  async function load() {
    // Step 1: resolve child
    const { data: childData } = await supabase
      .from('profiles')
      .select('id, full_name, class_level')
      .eq('parent_id', userId)
      .single()

    if (!childData) { setLoading(false); return }
    setChild(childData)

    // Step 2: fetch assignments for child's class level
    const { data } = await supabase
      .from('assignments')
      .select('id, title, subject, due_date, class_level, created_at')
      .eq('school_id', school?.id)
      .eq('class_level', childData.class_level)
      .order('due_date', { ascending: false })
      .limit(30)

    if (data) setRows(data)
    setLoading(false)
  }

  function isDue(due_date: string | null) {
    if (!due_date) return false
    return new Date(due_date) < new Date()
  }

  return (
    <RolePageWrapper userId={userId} role="parent" profile={profile} school={school} title="Assignments">
      {loading
        ? <div className={styles.loading}><span/><span/><span/></div>
        : !child
          ? <div className={styles.empty}>
              <ClipboardIcon size={40} color="var(--text-faint)" strokeWidth={1}/>
              <p>No child linked to your account.</p>
            </div>
          : <>
              <p style={{ fontSize:'0.75rem', color:'var(--text-muted)', marginBottom:'var(--space-4)' }}>
                Assignments for <strong style={{ color:'var(--text-primary)' }}>{child.full_name}</strong> · {child.class_level}
              </p>

              {rows.length === 0
                ? <div className={styles.empty}>
                    <ClipboardIcon size={40} color="var(--text-faint)" strokeWidth={1}/>
                    <p>No assignments found for {child.class_level} yet.</p>
                  </div>
                : <div className={styles.list}>
                    {rows.map((item, i) => (
                      <div key={item.id ?? i} className={styles.card}>
                        <div className={styles.cardIcon} style={{ background: sc + '20' }}>
                          <ClipboardIcon size={16} color={sc}/>
                        </div>
                        <div className={styles.cardBody}>
                          <p className={styles.cardTitle}>
                            {item.title} &nbsp;
                            {item.due_date && (
                              <span style={{ fontSize:'0.7rem', fontWeight:700, color: isDue(item.due_date) ? '#EF4444' : '#10B981' }}>
                                {isDue(item.due_date) ? 'Overdue' : 'Pending'}
                              </span>
                            )}
                          </p>
                          <p className={styles.cardMeta}>
                            {item.subject} &nbsp;·&nbsp;
                            Due: {item.due_date
                              ? new Date(item.due_date).toLocaleDateString('en-NG', { day:'numeric', month:'short', year:'numeric' })
                              : 'No deadline'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
              }
            </>
      }
      <div className={styles.spacer}/>
    </RolePageWrapper>
  )
}