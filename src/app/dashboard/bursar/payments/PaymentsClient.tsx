'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { WalletIcon } from '@/components/Icons'
import { getCurrentAcademicYear } from '@/lib/utils/term'
import styles from '@/app/dashboard/student/records/page.module.css'

interface Props { profile: any; school: any; userId: string }

const CUR_YEAR = getCurrentAcademicYear()

export default function PaymentsClient({ profile, school, userId }: Props) {
  const [history,     setHistory]     = useState<any[]>([])
  const [histLoading, setHistLoading] = useState(true)
  const supabase = createClient()
  const sc       = school?.primary_color ?? '#7C3AED'

  useEffect(() => { loadHistory() }, [])

  async function loadHistory() {
    setHistLoading(true)
    const { data } = await supabase.from('fee_payments').select('*')
      .eq('school_id', school?.id).order('created_at', { ascending:false }).limit(60)
    if (data) setHistory(data)
    setHistLoading(false)
  }

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-NG', { day:'numeric', month:'short', year:'numeric' })
  }
  function fmtAmt(n: number) {
    return new Intl.NumberFormat('en-NG', { style:'currency', currency:'NGN', minimumFractionDigits:0 }).format(n)
  }

  return (
    <RolePageWrapper userId={userId} role="bursar" profile={profile} school={school} title="Payments">

      {/* Header row: title + Record Payment button */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
        marginBottom:'var(--space-5)' }}>
        <p style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--text-muted)',
          letterSpacing:'0.05em', margin:0 }}>
          PAYMENT HISTORY
        </p>
        <a href="/dashboard/bursar/record-payment"
          style={{ display:'flex', alignItems:'center', gap:6, height:36, padding:'0 16px',
            background:sc, color:'#fff', borderRadius:8,
            fontWeight:700, fontSize:'0.8rem', textDecoration:'none' }}>
          + Record Payment
        </a>
      </div>

      {histLoading
        ? <div className={styles.loading}><span/><span/><span/></div>
        : history.length === 0
          ? <div className={styles.empty}>
              <WalletIcon size={40} color="var(--text-faint)" strokeWidth={1}/>
              <p>No payments recorded yet</p>
            </div>
          : <div className={styles.list}>
              {history.map((p:any) => (
                <div key={p.id} className={styles.card}>
                  <div className={styles.cardIcon} style={{ background:sc+'20' }}>
                    <WalletIcon size={16} color={sc}/>
                  </div>
                  <div className={styles.cardBody}>
                    <p className={styles.cardTitle}>{p.student_name}</p>
                    <p className={styles.cardMeta}>
                      {p.term} · {p.fee_type?.replace(/_/g,' ')} · {p.payment_method?.replace(/_/g,' ')}
                      {p.receipt_number ? ` · ${p.receipt_number}` : ''}
                    </p>
                    {p.reference && (
                      <p style={{ fontSize:'0.68rem', color:'var(--text-muted)', margin:'2px 0 0' }}>
                        Ref: {p.reference}
                      </p>
                    )}
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    <p style={{ fontSize:'0.92rem', fontWeight:800, color:'#10B981', margin:'0 0 2px' }}>
                      {fmtAmt(p.amount)}
                    </p>
                    <p style={{ fontSize:'0.68rem', color:'var(--text-muted)', margin:0 }}>
                      {fmtDate(p.created_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
      }

      <div className={styles.spacer}/>
    </RolePageWrapper>
  )
}
