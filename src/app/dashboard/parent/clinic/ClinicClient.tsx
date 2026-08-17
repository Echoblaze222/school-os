'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RoleSubHeader from '@/components/RoleSubHeader'
import { PARENT_FEATURE_GROUPS } from '@/app/dashboard/parent/featureGroups'
import { ActivityIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'
import { SkeletonList } from '@/components/motion/Skeleton'

interface Props { profile: any; school: any; userId: string }

export default function ClinicClient({ profile, school, userId }: Props) {
  const [loading,  setLoading]  = useState(true)
  const [children, setChildren] = useState<any[]>([])
  const [child,    setChild]    = useState<any>(null)
  const [record,   setRecord]   = useState<any>(null)
  const [visits,   setVisits]   = useState<any[]>([])
  const supabase = createClient()
  const sc = school?.primary_color ?? '#7C3AED'

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)

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
    await loadChildData(resolvedChildren[0].id)
    setLoading(false)
  }

  async function loadChildData(childId: string) {
    const { data: rec } = await supabase.from('student_medical_records').select('*').eq('student_id', childId).maybeSingle()
    setRecord(rec ?? null)

    const { data: v } = await supabase
      .from('clinic_visits')
      .select('*')
      .eq('student_id', childId)
      .order('visited_at', { ascending: false })
      .limit(30)
    setVisits(v ?? [])
  }

  async function switchChild(c: any) {
    setChild(c)
    setRecord(null)
    setVisits([])
    await loadChildData(c.id)
  }

  return (
    <RoleSubHeader userId={userId} role="parent" profile={profile} school={school} title="Clinic" featureGroups={PARENT_FEATURE_GROUPS}>
      {loading
        ? <SkeletonList count={4} variant="card" />
        : !child
          ? <div className={styles.empty}>
              <ActivityIcon size={40} color="var(--text-faint)" strokeWidth={1}/>
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

              {/* Medical summary card */}
              <div className={styles.card} style={{ cursor: 'default', marginBottom: 'var(--space-4)', flexDirection: 'column', alignItems: 'stretch', gap: 'var(--space-3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                  <div className={styles.cardIcon} style={{ background: sc + '22', color: sc }}><ActivityIcon size={18} /></div>
                  <p className={styles.cardTitle} style={{ margin: 0 }}>Medical Summary</p>
                </div>
                {record ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', fontSize: '0.8rem' }}>
                    <div><p style={{ margin: '0 0 2px', color: 'var(--text-muted)', fontSize: '0.68rem', textTransform: 'uppercase', fontWeight: 700 }}>Blood group</p><p style={{ margin: 0 }}>{record.blood_group || 'N/A'}</p></div>
                    <div><p style={{ margin: '0 0 2px', color: 'var(--text-muted)', fontSize: '0.68rem', textTransform: 'uppercase', fontWeight: 700 }}>Allergies</p><p style={{ margin: 0, color: record.allergies ? '#EF4444' : undefined, fontWeight: record.allergies ? 700 : undefined }}>{record.allergies || 'None on file'}</p></div>
                    <div style={{ gridColumn: '1 / -1' }}><p style={{ margin: '0 0 2px', color: 'var(--text-muted)', fontSize: '0.68rem', textTransform: 'uppercase', fontWeight: 700 }}>Chronic conditions</p><p style={{ margin: 0 }}>{record.chronic_conditions || 'None on file'}</p></div>
                    <div style={{ gridColumn: '1 / -1' }}><p style={{ margin: '0 0 2px', color: 'var(--text-muted)', fontSize: '0.68rem', textTransform: 'uppercase', fontWeight: 700 }}>Emergency contact</p><p style={{ margin: 0 }}>{record.emergency_contact_name ? `${record.emergency_contact_name}${record.emergency_contact_phone ? ` · ${record.emergency_contact_phone}` : ''}` : 'Not on file'}</p></div>
                  </div>
                ) : (
                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>No medical record on file yet. Contact the school office to add one.</p>
                )}
              </div>

              <p className={styles.sectionLabel}>Visit History</p>
              {visits.length === 0 ? (
                <div className={styles.empty}>No clinic visits recorded.</div>
              ) : (
                <div className={styles.list}>
                  {visits.map(v => (
                    <div key={v.id} className={styles.card} style={{ cursor: 'default' }}>
                      <div className={styles.cardIcon} style={{ background: (v.sent_home ? '#F59E0B' : sc) + '22', color: v.sent_home ? '#F59E0B' : sc }}><ActivityIcon size={18} /></div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p className={styles.cardTitle}>{v.reason}</p>
                        <p className={styles.cardMeta}>{new Date(v.visited_at).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}{v.treatment_given ? ` · ${v.treatment_given}` : ''}</p>
                      </div>
                      {v.sent_home && <span className={styles.statusBadge} style={{ background: '#F59E0B22', color: '#F59E0B' }}>Sent home</span>}
                    </div>
                  ))}
                </div>
              )}
            </>
      }
      <div style={{ height: 110 }} />
    </RoleSubHeader>
  )
}
