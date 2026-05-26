'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { WalletIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'
interface Props { profile: any; school: any; userId: string }
export default function FeesClient({ profile, school, userId }: Props) {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const sc = school?.primary_color ?? '#7C3AED'
  useEffect(() => { load() }, [])
  async function load() {
    if (!school?.id) { setLoading(false); return }
    const { data } = await supabase.from('school_fees').select('*')
      .eq('school_id', school.id).order('created_at', { ascending:false }).limit(30)
    if (data) setRows(data)
    setLoading(false)
  }
  return (
    <RolePageWrapper userId={userId} role="parent" profile={profile} school={school} title="Fee Status">
      {loading ? <div className={styles.loading}><span/><span/><span/></div>
      : rows.length === 0
        ? <div className={styles.empty}><WalletIcon size={40} color="var(--text-faint)" strokeWidth={1}/><p>No fee status data yet</p></div>
        : <div className={styles.list}>{rows.map((item:any) => (
            <div key={item.id} className={styles.card}>
              <div className={styles.cardIcon} style={{ background:sc+'20' }}>
                <WalletIcon size={16} color={sc}/>
              </div>
              <div className={styles.cardBody}>
                <p className={styles.cardTitle}>{item.title ?? item.subject ?? item.full_name ?? item.name ?? item.id}</p>
                <p className={styles.cardMeta}>{item.created_at ? new Date(item.created_at).toLocaleDateString('en-NG',{day:'numeric',month:'short',year:'numeric'}) : ''}</p>
              </div>
            </div>
          ))}</div>
      }
      <div className={styles.spacer}/>
    </RolePageWrapper>
  )
}
