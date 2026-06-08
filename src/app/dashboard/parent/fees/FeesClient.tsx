'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { WalletIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'

interface Props { profile: any; school: any; userId: string }

const STATUS_COLOR: Record<string, string> = {
  paid:    '#10B981',
  unpaid:  '#EF4444',
  partial: '#F59E0B',
}

export default function FeesClient({ profile, school, userId }: Props) {
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

    // Step 2: fetch fee payments for that child only
    const { data } = await supabase
      .from('fee_payments')
      .select('id, amount, status, term, description, paid_at, created_at')
      .eq('student_id', childData.id)
      .order('created_at', { ascending: false })
      .limit(30)

    if (data) setRows(data)
    setLoading(false)
  }

  const totalPaid = rows
    .filter(r => r.status === 'paid')
    .reduce((sum, r) => sum + (r.amount ?? 0), 0)

  const currency = school?.currency_primary ?? 'NGN'

  function fmt(amount: number) {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency, minimumFractionDigits: 0 }).format(amount)
  }

  return (
    <RolePageWrapper userId={userId} role="parent" profile={profile} school={school} title="Fee Status">
      {loading
        ? <div className={styles.loading}><span/><span/><span/></div>
        : !child
          ? <div className={styles.empty}>
              <WalletIcon size={40} color="var(--text-faint)" strokeWidth={1}/>
              <p>No child linked to your account.</p>
            </div>
          : <>
              <p style={{ fontSize:'0.75rem', color:'var(--text-muted)', marginBottom:'var(--space-4)' }}>
                Fee records for <strong style={{ color:'var(--text-primary)' }}>{child.full_name}</strong> · {child.class_level}
              </p>

              {/* Total paid summary */}
              {rows.length > 0 && (
                <div style={{ background: sc + '15', border: `1px solid ${sc}30`, borderRadius: 12, padding: '12px 16px', marginBottom: 'var(--space-5)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontSize:'0.8rem', color:'var(--text-secondary)', fontWeight:600 }}>Total Paid</span>
                  <span style={{ fontSize:'1rem', fontWeight:800, color:'#10B981' }}>{fmt(totalPaid)}</span>
                </div>
              )}

              {rows.length === 0
                ? <div className={styles.empty}>
                    <WalletIcon size={40} color="var(--text-faint)" strokeWidth={1}/>
                    <p>No fee records yet.</p>
                  </div>
                : <div className={styles.list}>
                    {rows.map((item, i) => (
                      <div key={item.id ?? i} className={styles.card}>
                        <div className={styles.cardIcon} style={{ background: sc + '20' }}>
                          <WalletIcon size={16} color={sc}/>
                        </div>
                        <div className={styles.cardBody}>
                          <p className={styles.cardTitle}>
                            {item.description ?? item.term ?? 'Fee Payment'} &nbsp;
                            <span style={{ fontWeight:700, fontSize:'0.72rem', color: STATUS_COLOR[item.status] ?? 'var(--text-muted)', textTransform:'capitalize' }}>
                              {item.status}
                            </span>
                          </p>
                          <p className={styles.cardMeta}>
                            {fmt(item.amount ?? 0)} &nbsp;·&nbsp;
                            {item.paid_at
                              ? new Date(item.paid_at).toLocaleDateString('en-NG', { day:'numeric', month:'short', year:'numeric' })
                              : item.created_at
                                ? new Date(item.created_at).toLocaleDateString('en-NG', { day:'numeric', month:'short', year:'numeric' })
                                : ''}
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