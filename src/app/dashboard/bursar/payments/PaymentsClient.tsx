'use client'
// src/app/dashboard/bursar/payments/PaymentsClient.tsx
//
// Fixed: was reading from `fee_payments`, a table nothing writes to
// anymore. Now reads from `payments` joined through payment_invoices ->
// fee_structures (for term/fee description) and profiles (for student
// name) - same pattern already proven in HistoryClient.tsx.

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { WalletIcon } from '@/components/Icons'
import { getCurrentAcademicYear } from '@/lib/utils/term'
import { unwrapEmbed } from '@/lib/utils/unwrapEmbed'
import styles from '@/app/dashboard/student/records/page.module.css'
import { SkeletonList } from '@/components/motion/Skeleton'
import EmptyState from '@/components/motion/EmptyState'

interface Props { profile: any; school: any; userId: string }

const CUR_YEAR = getCurrentAcademicYear()

function flatten(row: any) {
  // Embedded relations from Supabase can come back as either an object
  // or a 1-element array depending on inferred cardinality - unwrap both
  // shapes safely instead of assuming one or the other.
  const inv     = unwrapEmbed(row.payment_invoices)
  const fs      = unwrapEmbed(inv?.fee_structures)
  const student = unwrapEmbed(row.profiles)
  return {
    id:             row.id,
    receipt_number: row.receipt_number,
    student_name:   student?.full_name ?? 'Unknown',
    term:           fs?.term === 'first' ? 'First Term'
                   : fs?.term === 'second' ? 'Second Term'
                   : fs?.term === 'third' ? 'Third Term'
                   : fs?.term ?? '',
    fee_type:       fs?.description ?? 'School Fees',
    payment_method: row.payment_method,
    reference:      row.payment_reference,
    created_at:     row.paid_at ?? row.created_at,
    amount:         row.currency_used === 'USD' ? row.amount_paid_usd : row.amount_paid_ngn,
  }
}

export default function PaymentsClient({ profile, school, userId }: Props) {
  const [history,     setHistory]     = useState<any[]>([])
  const [histLoading, setHistLoading] = useState(true)
  const supabase = createClient()
  const sc       = school?.primary_color ?? '#800020'

  useEffect(() => { loadHistory() }, [])

  async function loadHistory() {
    setHistLoading(true)
    const { data } = await supabase
      .from('payments')
      .select(`
        id, receipt_number, paid_at, created_at, amount_paid_ngn, amount_paid_usd,
        currency_used, payment_method, payment_reference,
        payment_invoices ( fee_structures ( description, term, academic_year ) ),
        profiles!student_id ( full_name )
      `)
      .eq('school_id', school?.id)
      .order('created_at', { ascending: false })
      .limit(60)
    if (data) setHistory(data.map(flatten))
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
        <a href="/dashboard/bursar/record-payment" className="pressable"
          style={{ display:'flex', alignItems:'center', gap:6, height:36, padding:'0 16px',
            background:sc, color:'#fff', borderRadius:8,
            fontWeight:700, fontSize:'0.8rem', textDecoration:'none' }}>
          + Record Payment
        </a>
      </div>

      {histLoading
        ? <SkeletonList count={4} variant="row" />
        : history.length === 0
          ? <EmptyState
              icon={<WalletIcon size={40} color="var(--text-faint)" strokeWidth={1}/>}
              title="No payments recorded yet"
              subtitle="Payments you record will appear here, most recent first."
            />
          : <div className={`${styles.list} stagger`}>
              {history.map((p:any) => (
                <div key={p.id} className={`${styles.card} animate-fade-up`}>
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
