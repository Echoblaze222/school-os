'use client'
// src/app/dashboard/bursar/claims/ClaimsClient.tsx
// Bursar reviews pending payment claims, views proof screenshot,
// confirms (auto-deducts from balance) or rejects with a reason.

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import {
  WalletIcon, CheckCircleIcon, XIcon,
  ImageIcon, ClockIcon, CheckIcon,
} from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'

interface Props { profile: any; school: any; userId: string }

const TABS = ['pending', 'confirmed', 'rejected'] as const
type Tab   = typeof TABS[number]

const TAB_META: Record<Tab, { label: string; color: string }> = {
  pending:   { label: 'Pending',   color: '#F59E0B' },
  confirmed: { label: 'Confirmed', color: '#10B981' },
  rejected:  { label: 'Rejected',  color: '#EF4444' },
}

export default function ClaimsClient({ profile, school, userId }: Props) {
  const [tab,       setTab]       = useState<Tab>('pending')
  const [claims,    setClaims]    = useState<any[]>([])
  const [loading,   setLoading]   = useState(true)
  const [reviewing, setReviewing] = useState<string | null>(null)
  const [rejectId,  setRejectId]  = useState<string | null>(null)
  const [rejectNote,setRejectNote]= useState('')
  const [toast,     setToast]     = useState('')

  const supabase = createClient()
  const sc = school?.primary_color ?? '#7C3AED'

  useEffect(() => { load() }, [tab])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('payment_claims')
      .select(`
        *,
        student:profiles!student_id(full_name, class_level),
        parent:profiles!parent_id(full_name)
      `)
      .eq('school_id', school?.id)
      .eq('status', tab)
      .order('created_at', { ascending: false })
      .limit(50)

    if (data) setClaims(data)
    setLoading(false)
  }

  async function confirm(claim: any) {
    setReviewing(claim.id)
    try {
      // 1. Call server action to confirm — it deducts from student balance
      const res = await fetch('/api/payments/confirm-claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claim_id:    claim.id,
          bursar_id:   userId,
          school_id:   school.id,
          student_id:  claim.student_id,
          parent_id:   claim.parent_id,
          amount:      claim.amount_claimed,
          term:        claim.term,
          year:        claim.academic_year,
          fee_type:    claim.fee_type,
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error ?? 'Confirm failed')

      showToast('Payment confirmed and balance updated ✓')
      load()
    } catch (err: any) {
      showToast(err.message)
    } finally {
      setReviewing(null)
    }
  }

  async function reject(claimId: string) {
    if (!rejectNote.trim()) { showToast('Please enter a rejection reason'); return }
    setReviewing(claimId)
    try {
      const res = await fetch('/api/payments/reject-claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claim_id:   claimId,
          bursar_id:  userId,
          school_id:  school.id,
          bursar_note: rejectNote.trim(),
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error ?? 'Reject failed')

      setRejectId(null); setRejectNote('')
      showToast('Claim rejected. Parent has been notified.')
      load()
    } catch (err: any) {
      showToast(err.message)
    } finally {
      setReviewing(null)
    }
  }

  function showToast(msg: string) {
    setToast(msg); setTimeout(() => setToast(''), 4000)
  }

  function fmt(n: number) {
    return new Intl.NumberFormat('en-NG', { style:'currency', currency:'NGN', minimumFractionDigits:0 }).format(n)
  }

  const pendingCount = tab === 'pending' ? claims.length : null

  return (
    <RolePageWrapper userId={userId} role="bursar" profile={profile} school={school} title="Payment Claims">

      {toast && (
        <div style={{ position:'fixed', top:80, left:'50%', transform:'translateX(-50%)',
          background:'#1a1a2e', color:'#fff', padding:'10px 20px', borderRadius:10,
          fontSize:'0.82rem', zIndex:999, boxShadow:'0 4px 20px #0008',
          border:'1px solid var(--glass-border)', maxWidth:'90vw', textAlign:'center' }}>
          {toast}
        </div>
      )}

      {/* Tabs */}
      <div className={styles.tabs} style={{ marginBottom:'var(--space-5)' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`${styles.tab} ${tab===t ? styles.tabActive : ''}`}
            style={tab===t ? { background:sc, color:'#fff', borderColor:sc } : {}}>
            {TAB_META[t].label}
            {t === 'pending' && pendingCount !== null && pendingCount > 0 && (
              <span style={{ marginLeft:6, background:'#EF4444', color:'#fff',
                borderRadius:20, padding:'1px 7px', fontSize:'0.7rem', fontWeight:800 }}>
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading
        ? <div className={styles.loading}><span/><span/><span/></div>
        : claims.length === 0
          ? <div className={styles.empty}>
              <WalletIcon size={40} color="var(--text-faint)" strokeWidth={1}/>
              <p>No {tab} claims</p>
            </div>
          : <div style={{ display:'grid', gap:'var(--space-3)' }}>
              {claims.map((c: any) => (
                <div key={c.id} style={{ background:'var(--glass-bg)', border:'1px solid var(--glass-border)',
                  borderRadius:14, padding:'var(--space-4)', display:'grid', gap:10 }}>

                  {/* Top row: student + amount */}
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                    <div>
                      <p style={{ fontSize:'0.88rem', fontWeight:800, color:'var(--text-primary)', margin:0 }}>
                        {c.student?.full_name ?? 'Unknown'}
                      </p>
                      <p style={{ fontSize:'0.74rem', color:'var(--text-muted)', margin:'2px 0 0' }}>
                        {c.student?.class_level} · {c.fee_type?.replace(/_/g,' ')}
                      </p>
                      <p style={{ fontSize:'0.72rem', color:'var(--text-muted)', margin:'2px 0 0' }}>
                        {c.term} {c.academic_year}
                        {c.bank_used ? ` · ${c.bank_used}` : ''}
                        {c.payment_date ? ` · ${new Date(c.payment_date).toLocaleDateString('en-NG',{day:'numeric',month:'short'})}` : ''}
                      </p>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <p style={{ fontSize:'1.05rem', fontWeight:800, color:'#10B981', margin:0 }}>
                        {fmt(c.amount_claimed)}
                      </p>
                      <p style={{ fontSize:'0.68rem', color:'var(--text-muted)', margin:'2px 0 0' }}>
                        {new Date(c.created_at).toLocaleDateString('en-NG',{day:'numeric',month:'short',year:'numeric'})}
                      </p>
                    </div>
                  </div>

                  {/* Parent note */}
                  {c.notes && (
                    <p style={{ fontSize:'0.78rem', color:'var(--text-secondary)',
                      background:'var(--input-bg)', padding:'6px 10px', borderRadius:7, margin:0 }}>
                      "{c.notes}"
                    </p>
                  )}

                  {/* Proof link */}
                  {c.proof_url && (
                    <a href={c.proof_url} target="_blank" rel="noopener noreferrer"
                      style={{ display:'flex', alignItems:'center', gap:6,
                        fontSize:'0.78rem', color:sc, fontWeight:600, textDecoration:'none',
                        background: sc + '10', padding:'6px 12px', borderRadius:8, width:'fit-content' }}>
                      <ImageIcon size={14} color={sc}/>
                      View payment proof screenshot
                    </a>
                  )}

                  {/* Reject note if rejected */}
                  {c.status === 'rejected' && c.bursar_note && (
                    <div style={{ background:'#EF444415', borderRadius:8, padding:'7px 12px' }}>
                      <p style={{ fontSize:'0.75rem', color:'#EF4444', margin:0 }}>
                        Rejected: {c.bursar_note}
                      </p>
                    </div>
                  )}

                  {/* Confirmed note */}
                  {c.status === 'confirmed' && (
                    <div style={{ background:'#10B98115', borderRadius:8, padding:'7px 12px' }}>
                      <p style={{ fontSize:'0.75rem', color:'#10B981', margin:0, fontWeight:700 }}>
                        ✓ Confirmed — balance auto-deducted
                      </p>
                    </div>
                  )}

                  {/* ACTION BUTTONS — pending only */}
                  {tab === 'pending' && (
                    <>
                      {/* Reject reason input */}
                      {rejectId === c.id && (
                        <div style={{ display:'grid', gap:8 }}>
                          <input placeholder="Rejection reason (required)" value={rejectNote}
                            onChange={e => setRejectNote(e.target.value)}
                            style={{ width:'100%', height:38, padding:'0 12px',
                              background:'var(--input-bg)', border:'1px solid #EF444450',
                              borderRadius:8, color:'var(--text-primary)', fontSize:'0.82rem', outline:'none' }}/>
                          <div style={{ display:'flex', gap:8 }}>
                            <button onClick={() => reject(c.id)}
                              disabled={reviewing === c.id}
                              style={{ flex:1, height:38, background:'#EF4444', color:'#fff',
                                border:'none', borderRadius:8, fontWeight:700, fontSize:'0.8rem',
                                cursor:'pointer', opacity: reviewing===c.id ? 0.5 : 1 }}>
                              {reviewing===c.id ? 'Rejecting…' : 'Confirm Reject'}
                            </button>
                            <button onClick={() => { setRejectId(null); setRejectNote('') }}
                              style={{ padding:'0 14px', height:38, background:'var(--input-bg)',
                                border:'1px solid var(--input-border)', borderRadius:8,
                                color:'var(--text-muted)', fontWeight:700, cursor:'pointer' }}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      {rejectId !== c.id && (
                        <div style={{ display:'flex', gap:8 }}>
                          <button onClick={() => confirm(c)}
                            disabled={reviewing === c.id}
                            style={{ flex:1, height:40, background:'#10B981', color:'#fff',
                              border:'none', borderRadius:9, fontWeight:700, fontSize:'0.82rem',
                              cursor:'pointer', display:'flex', alignItems:'center',
                              justifyContent:'center', gap:6,
                              opacity: reviewing===c.id ? 0.5 : 1 }}>
                            <CheckIcon size={14} color="#fff"/>
                            {reviewing===c.id ? 'Confirming…' : 'Confirm Payment'}
                          </button>
                          <button onClick={() => { setRejectId(c.id); setRejectNote('') }}
                            style={{ flex:1, height:40, background:'#EF444415', color:'#EF4444',
                              border:'1px solid #EF444430', borderRadius:9, fontWeight:700,
                              fontSize:'0.82rem', cursor:'pointer', display:'flex',
                              alignItems:'center', justifyContent:'center', gap:6 }}>
                            <XIcon size={14} color="#EF4444"/>
                            Reject
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
      }
      <div className={styles.spacer}/>
    </RolePageWrapper>
  )
}
