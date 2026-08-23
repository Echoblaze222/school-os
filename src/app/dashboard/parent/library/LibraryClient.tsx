'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RoleSubHeader from '@/components/RoleSubHeader'
import { PARENT_FEATURE_GROUPS } from '@/app/dashboard/parent/featureGroups'
import KpiCard from '@/components/KpiCard'
import { BookIcon, ClockIcon, AlertCircleIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'
import { SkeletonList } from '@/components/motion/Skeleton'

interface Props { profile: any; school: any; userId: string }

export default function LibraryClient({ profile, school, userId }: Props) {
  const [loading,  setLoading]  = useState(true)
  const [children, setChildren] = useState<any[]>([])
  const [child,    setChild]    = useState<any>(null)
  const [loans,    setLoans]    = useState<any[]>([])
  const supabase = createClient()
  const sc = school?.primary_color ?? '#7C3AED'

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)

    // Resolve children via parent_student_links first, fallback to profiles.parent_id
    // - same resolution order used by the parent Attendance/Results pages.
    const { data: links } = await supabase.from('parent_student_links').select('student_id').eq('parent_id', userId)
    let resolvedChildren: any[] = []

    if (links?.length) {
      const ids = links.map(l => l.student_id)
      const { data: childProfiles } = await supabase.from('profiles').select('id, full_name, class_level').in('id', ids)
      resolvedChildren = childProfiles ?? []
    } else {
      const { data: fallback } = await supabase.from('profiles').select('id, full_name, class_level').eq('parent_id', userId)
      resolvedChildren = fallback ?? []
    }

    if (!resolvedChildren.length) { setLoading(false); return }

    setChildren(resolvedChildren)
    setChild(resolvedChildren[0])
    await loadLoans(resolvedChildren[0].id)
    setLoading(false)
  }

  async function loadLoans(childId: string) {
    const { data } = await supabase
      .from('library_loans')
      .select('*, library_books(title, author)')
      .eq('student_id', childId)
      .order('borrowed_at', { ascending: false })
    setLoans(data ?? [])
  }

  async function switchChild(c: any) {
    setChild(c)
    setLoans([])
    await loadLoans(c.id)
  }

  function dueLabel(due: string, status: string) {
    if (status !== 'borrowed') return null
    const days = Math.ceil((new Date(due).getTime() - Date.now()) / 86400000)
    if (days < 0) return { text: `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`, color: '#EF4444' }
    if (days === 0) return { text: 'Due today', color: '#F59E0B' }
    return { text: `Due in ${days} day${days === 1 ? '' : 's'}`, color: 'var(--text-muted)' }
  }

  const activeLoans = loans.filter(l => l.status === 'borrowed')

  return (
    <RoleSubHeader userId={userId} role="parent" profile={profile} school={school} title="Library" featureGroups={PARENT_FEATURE_GROUPS}>
      {loading
        ? <SkeletonList count={4} variant="card" />
        : !child
          ? <div className={styles.empty}>
              <BookIcon size={40} color="var(--text-faint)" strokeWidth={1}/>
              <p>No child linked to your account.</p>
            </div>
          : <>
              {children.length > 1 && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
                  {children.map(c => (
                    <button className="pressable" key={c.id} onClick={() => switchChild(c)}
                      style={{
                        padding: '6px 14px', borderRadius: 999, fontSize: '0.75rem', fontWeight: 700,
                        background: child.id === c.id ? sc : 'var(--glass-bg)',
                        color:      child.id === c.id ? '#fff' : 'var(--text-muted)',
                        border:     `1px solid ${child.id === c.id ? sc : 'var(--glass-border)'}`,
                        cursor: 'pointer', flexShrink: 0,
                      }}>
                      {c.full_name?.split(' ')[0]}
                    </button>
                  ))}
                </div>
              )}

              {activeLoans.length > 0 && (() => {
                const overdueCount = activeLoans.filter(l => new Date(l.due_at) < new Date()).length
                return (
                  <div className={styles.statsRow} style={{ marginBottom: 'var(--space-4)' }}>
                    <KpiCard label="Books Out" value={activeLoans.length} icon={<BookIcon size={16} />} color={sc} context="Currently borrowed" />
                    <KpiCard label="Overdue" value={overdueCount} icon={<AlertCircleIcon size={16} />} color={overdueCount > 0 ? '#EF4444' : '#10B981'} valueColor={overdueCount > 0 ? '#EF4444' : '#10B981'} context={overdueCount > 0 ? 'Return needed' : 'All on time'} />
                  </div>
                )
              })()}

              {loans.length === 0 ? (
                <div className={styles.empty}>{child.full_name?.split(' ')[0]} hasn't borrowed any books yet.</div>
              ) : (
                <div className={styles.list}>
                  {loans.map(l => {
                    const dl = dueLabel(l.due_at, l.status)
                    return (
                      <div key={l.id} className={styles.card} style={{ cursor: 'default' }}>
                        <div className={styles.cardIcon} style={{ background: (dl?.color ?? sc) + '22', color: dl?.color ?? sc }}><BookIcon size={18} /></div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p className={styles.cardTitle}>{l.library_books?.title ?? 'Unknown title'}</p>
                          <p className={styles.cardMeta}>
                            {l.status === 'returned'
                              ? `Returned ${l.returned_at ? new Date(l.returned_at).toLocaleDateString('en-NG', { day: '2-digit', month: 'short' }) : ''}`
                              : dl && <span style={{ color: dl.color, fontWeight: 700 }}>{dl.text}</span>}
                          </p>
                        </div>
                        <span className={styles.statusBadge} style={{
                          background: l.status === 'returned' ? '#10B98122' : (dl?.color ?? sc) + '22',
                          color: l.status === 'returned' ? '#10B981' : (dl?.color ?? sc),
                          textTransform: 'capitalize',
                        }}>{l.status}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
      }
      <div style={{ height: 110 }} />
    </RoleSubHeader>
  )
}
