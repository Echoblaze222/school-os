'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { PendingTransferRow } from '../../types'
import styles from '../../principal.module.css'

interface Props { transfers: PendingTransferRow[]; principalId: string }

function relTime(iso: string) { const d=Date.now()-new Date(iso).getTime(); const days=Math.floor(d/86400000); return days===0?'Today':`${days}d ago` }
function initials(n: string) { return n.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase() }

const IconSun=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
const IconMoon=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z"/></svg>
const IconChevronLeft=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><path d="M15 18l-6-6 6-6"/></svg>

export default function PendingTransfersClient({ transfers: initial, principalId }: Props) {
  const [isDark, setIsDark] = useState(true)
  const [mounted, setMounted] = useState(false)
  const [transfers, setTransfers] = useState<PendingTransferRow[]>(initial)
  const [loading, setLoading] = useState<Set<string>>(new Set())
  const [rejectingId, setRejectingId] = useState<string|null>(null)
  const [rejectReason, setRejectReason] = useState<Record<string,string>>({})
  const [toast, setToast] = useState<string|null>(null)

  useEffect(()=>{ const s=localStorage.getItem('schoolos_theme'); const dark=s!=='light'; setIsDark(dark); document.documentElement.setAttribute('data-theme',dark?'dark':'light'); setMounted(true) },[])
  const toggleTheme=()=>{ const n=!isDark; setIsDark(n); document.documentElement.setAttribute('data-theme',n?'dark':'light'); localStorage.setItem('schoolos_theme',n?'dark':'light') }
  function showToast(m: string) { setToast(m); setTimeout(()=>setToast(null),3000) }

  async function approve(t: PendingTransferRow) {
    setLoading(p=>new Set(p).add(t.id))
    const supabase = createClient()
    const now = new Date().toISOString()
    // Update to approved then completed — DB trigger does the rest
    await supabase.from('student_transfers').update({ status:'approved', approved_at: now, approved_by: principalId }).eq('id', t.id)
    // Also call complete_transfer if available, fallback to manual update
    let error = null
try {
  const res = await supabase.rpc('complete_transfer', { transfer_id: t.id })
  error = res.error
} catch {
  error = null
}
    if (error) {
      // Manual fallback if RPC not available
      await supabase.from('student_transfers').update({ status:'completed' }).eq('id', t.id)
    }
    await supabase.from('notifications').insert({ user_id: t.student_id, title:'Transfer Approved', body:'Your school transfer has been approved!', type:'transfer', read: false, created_at: now })
    setTransfers(p=>p.filter(x=>x.id!==t.id))
    setLoading(p=>{ const n=new Set(p); n.delete(t.id); return n })
    showToast(`Transfer for ${t.student_name} approved`)
  }

  async function reject(t: PendingTransferRow) {
    const reason = rejectReason[t.id] ?? ''
    setLoading(p=>new Set(p).add(t.id))
    const supabase = createClient()
    const now = new Date().toISOString()
    await supabase.from('student_transfers').update({ status:'rejected', rejection_reason: reason||null, rejected_at: now, rejected_by: principalId }).eq('id', t.id)
    await supabase.from('notifications').insert({ user_id: t.student_id, title:'Transfer Rejected', body:`Your transfer was rejected.${reason?` Reason: ${reason}`:''}`, type:'transfer', read: false, created_at: now })
    setTransfers(p=>p.filter(x=>x.id!==t.id))
    setLoading(p=>{ const n=new Set(p); n.delete(t.id); return n })
    setRejectingId(null)
    showToast(`Transfer for ${t.student_name} rejected`)
  }

  if (!mounted) return null

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link href="/dashboard/principal" className={styles.backBtn} style={{marginBottom:8,display:'inline-flex'}}><IconChevronLeft /> Dashboard</Link>
          <h1 className={styles.pageTitle}>Pending <span>Transfers</span></h1>
        </div>
        <div className={styles.headerActions}><button className={styles.themeBtn} onClick={toggleTheme}>{isDark?<IconSun />:<IconMoon />}</button></div>
      </header>

      <div style={{position:'relative',zIndex:1,padding:'var(--space-6)',display:'flex',flexDirection:'column',gap:'var(--space-4)',maxWidth:800}}>
        {transfers.length===0
          ? <div className={styles.emptyState} style={{background:'var(--glass-bg)',border:'1px solid var(--glass-border)',borderRadius:'var(--radius-xl)'}}>No pending transfer requests.</div>
          : transfers.map(t=>{
            const busy = loading.has(t.id)
            return (
              <div key={t.id} className={styles.card} style={{animationDelay:'0ms'}}>
                <div className={styles.drawerHeader} style={{border:'none',paddingBottom:0}}>
                  <div className={styles.drawerAvatar}>{initials(t.student_name)}</div>
                  <div style={{flex:1}}>
                    <p className={styles.drawerName}>{t.student_name}</p>
                    <p className={styles.drawerSub}>From: {t.origin_school_name??'Unknown'} · {relTime(t.initiated_at)}</p>
                    {t.notes&&<p style={{fontSize:'.75rem',color:'var(--text-secondary)',marginTop:4}}>{t.notes}</p>}
                  </div>
                  <span className={`${styles.badge} ${styles.badgeWarning}`}>Pending</span>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'var(--space-3)',padding:'var(--space-4) var(--space-6)',borderTop:'1px solid var(--glass-border)',borderBottom:'1px solid var(--glass-border)',margin:'var(--space-4) 0 0'}}>
                  {[['Avg Score', t.avg_score!==null?`${t.avg_score}%`:'—'],['Results',t.total_results],['Outstanding Fees',t.outstanding_fees>0?`₦${t.outstanding_fees.toLocaleString()}`:'None']].map(([lbl,val])=>(
                    <div key={String(lbl)} style={{display:'flex',flexDirection:'column',gap:3}}>
                      <span style={{fontFamily:'var(--font-display)',fontSize:'1.15rem',fontWeight:700,color:lbl==='Outstanding Fees'&&t.outstanding_fees>0?'var(--error)':'var(--text-primary)',lineHeight:1}}>{val}</span>
                      <span style={{fontSize:'.62rem',fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',color:'var(--text-muted)'}}>{lbl}</span>
                    </div>
                  ))}
                </div>
                <div style={{padding:'var(--space-4) var(--space-6)',display:'flex',flexDirection:'column',gap:'var(--space-3)'}}>
                  <div style={{display:'flex',gap:'var(--space-3)'}}>
                    <button className={styles.submitBtn} style={{flex:1,background:'linear-gradient(135deg,var(--success),#2aaa65)',boxShadow:'0 3px 12px rgba(45,139,85,.3)'}} onClick={()=>approve(t)} disabled={busy}>{busy?'Processing…':'Approve Transfer'}</button>
                    <button className={styles.dangerBtn} onClick={()=>setRejectingId(rejectingId===t.id?null:t.id)} disabled={busy}>Reject</button>
                  </div>
                  {rejectingId===t.id&&(
                    <div style={{display:'flex',gap:'var(--space-2)'}}>
                      <input className={styles.searchInput} style={{flex:1}} placeholder="Reason (optional)…" value={rejectReason[t.id]??''} onChange={e=>setRejectReason(p=>({...p,[t.id]:e.target.value}))} />
                      <button className={styles.dangerBtn} onClick={()=>reject(t)} disabled={busy}>Confirm Reject</button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
      </div>
      {toast&&<div className={styles.toast}>{toast}</div>}
    </div>
  )
}
