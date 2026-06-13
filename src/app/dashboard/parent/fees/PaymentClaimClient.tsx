'use client'
// src/app/dashboard/parent/fees/PaymentClaimClient.tsx
// Parent submits a manual payment claim with screenshot proof.
// Bursar sees it, confirms or rejects — on confirm, fee_payments row is created.

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import {
  WalletIcon, UploadIcon, CheckCircleIcon,
  ClockIcon, XIcon, AlertIcon, CameraIcon, ImageIcon,
} from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'

interface Props { profile: any; school: any; userId: string }

const TERMS     = ['First Term', 'Second Term', 'Third Term']
const FEE_TYPES = ['school_fees','development_levy','pta','uniform','exam','other']
const CUR_YEAR  = new Date().getMonth() >= 8
  ? `${new Date().getFullYear()}/${new Date().getFullYear()+1}`
  : `${new Date().getFullYear()-1}/${new Date().getFullYear()}`

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending:   { label: 'Pending Review', color: '#F59E0B', bg: '#F59E0B15' },
  confirmed: { label: 'Confirmed',      color: '#10B981', bg: '#10B98115' },
  rejected:  { label: 'Rejected',       color: '#EF4444', bg: '#EF444415' },
}

export default function PaymentClaimClient({ profile, school, userId }: Props) {
  const [child,    setChild]    = useState<any>(null)
  const [claims,   setClaims]   = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [toast,    setToast]    = useState('')
  const [owed,     setOwed]     = useState<number | null>(null)

  // Form state
  const [term,        setTerm]        = useState('First Term')
  const [year,        setYear]        = useState(CUR_YEAR)
  const [feeType,     setFeeType]     = useState('school_fees')
  const [amount,      setAmount]      = useState('')
  const [bankUsed,    setBankUsed]    = useState('')
  const [payDate,     setPayDate]     = useState('')
  const [notes,       setNotes]       = useState('')
  const [proofFile,   setProofFile]   = useState<File | null>(null)
  const [proofPreview,setProofPreview]= useState<string | null>(null)

  const fileRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()
  const sc = school?.primary_color ?? '#7C3AED'

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    // Resolve child
    const { data: childData } = await supabase
      .from('profiles')
      .select('id, full_name, class_level')
      .eq('parent_id', userId)
      .single()

    if (!childData) { setLoading(false); return }
    setChild(childData)

    // Load this child's past claims
    const { data: claimData } = await supabase
      .from('payment_claims')
      .select('*')
      .eq('student_id', childData.id)
      .order('created_at', { ascending: false })
      .limit(30)

    if (claimData) setClaims(claimData)

    // Load how much they still owe (from fee_invoices or school_fees)
    const { data: fees } = await supabase
      .from('school_fees')
      .select('amount')
      .eq('school_id', school?.id)
      .eq('class_level', childData.class_level)

    const totalExpected = (fees ?? []).reduce((s: number, r: any) => s + (r.amount ?? 0), 0)

    const { data: paid } = await supabase
      .from('fee_payments')
      .select('amount')
      .eq('student_id', childData.id)
      .eq('status', 'paid')

    const totalPaid = (paid ?? []).reduce((s: number, r: any) => s + (r.amount ?? 0), 0)
    if (totalExpected > 0) setOwed(Math.max(0, totalExpected - totalPaid))

    setLoading(false)
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setProofFile(f)
    const reader = new FileReader()
    reader.onload = ev => setProofPreview(ev.target?.result as string)
    reader.readAsDataURL(f)
  }

  async function handleSubmit() {
    if (!child || !amount || !proofFile) {
      showToast('Please fill amount and upload payment proof')
      return
    }
    setSaving(true)

    try {
      // 1. Upload proof screenshot to Supabase Storage
      const ext  = proofFile.name.split('.').pop() ?? 'jpg'
      const path = `payment-proofs/${school.id}/${child.id}/${Date.now()}.${ext}`

      const { error: uploadErr } = await supabase.storage
        .from('school-files')
        .upload(path, proofFile, { upsert: false, contentType: proofFile.type })

      if (uploadErr) throw new Error('Upload failed: ' + uploadErr.message)

      const { data: urlData } = supabase.storage
        .from('school-files')
        .getPublicUrl(path)

      const proofUrl = urlData?.publicUrl ?? null

      // 2. Insert payment claim row
      const { error: claimErr } = await supabase.from('payment_claims').insert({
        school_id:      school.id,
        parent_id:      userId,
        student_id:     child.id,
        fee_type:       feeType,
        term,
        academic_year:  year,
        amount_claimed: parseFloat(amount),
        bank_used:      bankUsed.trim() || null,
        payment_date:   payDate || null,
        notes:          notes.trim() || null,
        proof_url:      proofUrl,
        status:         'pending',
      })

      if (claimErr) throw new Error(claimErr.message)

      // 3. Notify bursar + principal via notifications table
      await fetch('/api/payments/claim-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school_id:    school.id,
          student_name: child.full_name,
          amount:       parseFloat(amount),
          term,
          year,
          fee_type:     feeType,
        }),
      })

      showToast('Payment claim submitted! Awaiting bursar confirmation.')
      setShowForm(false)
      resetForm()
      load()
    } catch (err: any) {
      showToast(err.message ?? 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  function resetForm() {
    setAmount(''); setBankUsed(''); setPayDate(''); setNotes('')
    setProofFile(null); setProofPreview(null)
    setTerm('First Term'); setYear(CUR_YEAR); setFeeType('school_fees')
    if (fileRef.current) fileRef.current.value = ''
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 4000)
  }

  function fmt(n: number) {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 }).format(n)
  }

  const inp: React.CSSProperties = {
    width: '100%', height: 42, padding: '0 12px',
    background: 'var(--input-bg)', border: '1px solid var(--input-border)',
    borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none',
  }

  const bankDetails = (school?.bank_name || school?.account_number)
    ? `${school.bank_name ?? ''} · ${school.account_name ?? school.name} · ${school.account_number ?? ''}`
    : null

  return (
    <RolePageWrapper userId={userId} role="parent" profile={profile} school={school} title="Fee Payment">

      {/* Toast */}
      {toast && (
        <div style={{ position:'fixed', top:80, left:'50%', transform:'translateX(-50%)',
          background:'#1a1a2e', color:'#fff', padding:'10px 20px', borderRadius:10,
          fontSize:'0.82rem', zIndex:999, boxShadow:'0 4px 20px #0008', maxWidth:'90vw',
          textAlign:'center', border:'1px solid var(--glass-border)' }}>
          {toast}
        </div>
      )}

      {loading
        ? <div className={styles.loading}><span/><span/><span/></div>
        : !child
          ? <div className={styles.empty}>
              <WalletIcon size={40} color="var(--text-faint)" strokeWidth={1}/>
              <p>No child linked to your account.</p>
            </div>
          : <>
              {/* Child header */}
              <div style={{ background:'var(--glass-bg)', border:'1px solid var(--glass-border)',
                borderRadius:12, padding:'12px 16px', marginBottom:'var(--space-4)',
                display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <p style={{ fontSize:'0.72rem', color:'var(--text-muted)', fontWeight:700,
                    letterSpacing:'0.05em', margin:'0 0 3px' }}>STUDENT</p>
                  <p style={{ fontSize:'0.9rem', fontWeight:800, color:'var(--text-primary)', margin:0 }}>
                    {child.full_name}
                  </p>
                  <p style={{ fontSize:'0.75rem', color:'var(--text-muted)', margin:0 }}>
                    {child.class_level}
                  </p>
                </div>
                {owed !== null && (
                  <div style={{ textAlign:'right' }}>
                    <p style={{ fontSize:'0.7rem', color:'var(--text-muted)', margin:'0 0 3px' }}>BALANCE OWED</p>
                    <p style={{ fontSize:'1rem', fontWeight:800,
                      color: owed === 0 ? '#10B981' : '#EF4444', margin:0 }}>
                      {owed === 0 ? '✓ Cleared' : fmt(owed)}
                    </p>
                  </div>
                )}
              </div>

              {/* School bank account */}
              {bankDetails && (
                <div style={{ background: sc + '10', border:`1px solid ${sc}30`,
                  borderRadius:10, padding:'10px 14px', marginBottom:'var(--space-4)' }}>
                  <p style={{ fontSize:'0.68rem', fontWeight:800, color:'var(--text-muted)',
                    letterSpacing:'0.06em', margin:'0 0 5px' }}>PAY INTO THIS ACCOUNT</p>
                  <p style={{ fontSize:'0.82rem', fontWeight:700, color:'var(--text-primary)', margin:0 }}>
                    {bankDetails}
                  </p>
                  <p style={{ fontSize:'0.72rem', color:'var(--text-muted)', marginTop:4 }}>
                    Use your child's name as reference
                  </p>
                </div>
              )}

              {/* Submit claim button */}
              {!showForm && (
                <button onClick={() => setShowForm(true)}
                  style={{ width:'100%', height:46, background:sc, color:'#fff',
                    border:'none', borderRadius:10, fontWeight:700, fontSize:'0.88rem',
                    cursor:'pointer', marginBottom:'var(--space-5)', display:'flex',
                    alignItems:'center', justifyContent:'center', gap:8 }}>
                  <UploadIcon size={16} color="#fff"/>
                  I Have Made Payment
                </button>
              )}

              {/* CLAIM FORM */}
              {showForm && (
                <div style={{ background:'var(--glass-bg)', border:'1px solid var(--glass-border)',
                  borderRadius:14, padding:'var(--space-5)', marginBottom:'var(--space-5)' }}>
                  <p style={{ fontSize:'0.88rem', fontWeight:800, color:'var(--text-primary)',
                    margin:'0 0 var(--space-4)' }}>Submit Payment Proof</p>

                  <div style={{ display:'grid', gap:'var(--space-3)' }}>
                    {/* Term + Year */}
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--space-3)' }}>
                      <select value={term} onChange={e => setTerm(e.target.value)} style={inp}>
                        {TERMS.map(t => <option key={t}>{t}</option>)}
                      </select>
                      <input value={year} onChange={e => setYear(e.target.value)}
                        placeholder="2024/2025" style={inp}/>
                    </div>

                    {/* Fee type */}
                    <select value={feeType} onChange={e => setFeeType(e.target.value)} style={inp}>
                      {FEE_TYPES.map(f => (
                        <option key={f} value={f} style={{ textTransform:'capitalize' }}>
                          {f.replace(/_/g,' ')}
                        </option>
                      ))}
                    </select>

                    {/* Amount */}
                    <div>
                      <label style={{ fontSize:'0.7rem', color:'var(--text-muted)', fontWeight:700,
                        letterSpacing:'0.05em', display:'block', marginBottom:5 }}>
                        AMOUNT YOU PAID (₦) *
                      </label>
                      <input type="number" placeholder="e.g. 45000" value={amount}
                        onChange={e => setAmount(e.target.value)} style={inp}/>
                    </div>

                    {/* Bank used + Date side by side */}
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--space-3)' }}>
                      <input placeholder="Bank used (e.g. GTBank)" value={bankUsed}
                        onChange={e => setBankUsed(e.target.value)} style={inp}/>
                      <input type="date" value={payDate}
                        onChange={e => setPayDate(e.target.value)} style={inp}/>
                    </div>

                    {/* Notes */}
                    <input placeholder="Notes (optional)" value={notes}
                      onChange={e => setNotes(e.target.value)} style={inp}/>

                    {/* Screenshot upload */}
                    <div>
                      <label style={{ fontSize:'0.7rem', color:'var(--text-muted)', fontWeight:700,
                        letterSpacing:'0.05em', display:'block', marginBottom:8 }}>
                        PAYMENT SCREENSHOT / RECEIPT *
                      </label>
                      <input ref={fileRef} type="file"
                        accept="image/*,application/pdf"
                        onChange={onFileChange}
                        style={{ display:'none' }}/>

                      {!proofPreview
                        ? <button onClick={() => fileRef.current?.click()}
                            style={{ width:'100%', height:100, border:'2px dashed var(--input-border)',
                              borderRadius:10, background:'var(--input-bg)', cursor:'pointer',
                              display:'flex', flexDirection:'column', alignItems:'center',
                              justifyContent:'center', gap:8, color:'var(--text-muted)' }}>
                            <CameraIcon size={24} color="var(--text-muted)"/>
                            <span style={{ fontSize:'0.78rem', fontWeight:600 }}>
                              Tap to upload screenshot or photo
                            </span>
                          </button>
                        : <div style={{ position:'relative' }}>
                            <img src={proofPreview} alt="proof"
                              style={{ width:'100%', maxHeight:200, objectFit:'contain',
                                borderRadius:10, border:'1px solid var(--glass-border)' }}/>
                            <button onClick={() => { setProofFile(null); setProofPreview(null) }}
                              style={{ position:'absolute', top:6, right:6, background:'#EF4444',
                                border:'none', borderRadius:'50%', width:26, height:26,
                                cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                              <XIcon size={13} color="#fff"/>
                            </button>
                          </div>
                      }
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display:'flex', gap:'var(--space-3)', marginTop:'var(--space-4)' }}>
                    <button onClick={handleSubmit}
                      disabled={saving || !amount || !proofFile}
                      style={{ flex:1, height:44, background:sc, color:'#fff', border:'none',
                        borderRadius:9, fontWeight:700, fontSize:'0.85rem', cursor:'pointer',
                        opacity: (saving || !amount || !proofFile) ? 0.5 : 1 }}>
                      {saving ? 'Submitting…' : 'Submit for Confirmation'}
                    </button>
                    <button onClick={() => { setShowForm(false); resetForm() }}
                      style={{ padding:'0 18px', height:44, background:'var(--input-bg)',
                        color:'var(--text-muted)', border:'1px solid var(--input-border)',
                        borderRadius:9, fontWeight:700, cursor:'pointer' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* PAST CLAIMS */}
              {claims.length > 0 && (
                <>
                  <p style={{ fontSize:'0.72rem', fontWeight:800, color:'var(--text-muted)',
                    letterSpacing:'0.05em', margin:'0 0 var(--space-3)' }}>
                    YOUR PAYMENT CLAIMS
                  </p>
                  <div className={styles.list}>
                    {claims.map((c: any) => {
                      const meta = STATUS_META[c.status] ?? STATUS_META.pending
                      return (
                        <div key={c.id} className={styles.card} style={{ flexDirection:'column', alignItems:'flex-start', gap:10 }}>
                          <div style={{ display:'flex', justifyContent:'space-between', width:'100%', alignItems:'center' }}>
                            <div>
                              <p className={styles.cardTitle} style={{ marginBottom:2 }}>
                                {c.fee_type?.replace(/_/g,' ')} — {c.term} {c.academic_year}
                              </p>
                              <p className={styles.cardMeta}>
                                {fmt(c.amount_claimed)}
                                {c.bank_used ? ` · ${c.bank_used}` : ''}
                                {c.payment_date ? ` · ${new Date(c.payment_date).toLocaleDateString('en-NG',{day:'numeric',month:'short'})}` : ''}
                              </p>
                            </div>
                            <span style={{ fontSize:'0.72rem', fontWeight:800, color:meta.color,
                              background:meta.bg, padding:'3px 10px', borderRadius:20, flexShrink:0 }}>
                              {meta.label}
                            </span>
                          </div>
                          {/* Proof thumbnail */}
                          {c.proof_url && (
                            <a href={c.proof_url} target="_blank" rel="noopener noreferrer"
                              style={{ display:'flex', alignItems:'center', gap:6,
                                fontSize:'0.75rem', color:sc, fontWeight:600, textDecoration:'none' }}>
                              <ImageIcon size={14} color={sc}/>
                              View proof screenshot
                            </a>
                          )}
                          {/* Bursar note on rejection */}
                          {c.status === 'rejected' && c.bursar_note && (
                            <div style={{ background:'#EF444415', border:'1px solid #EF444430',
                              borderRadius:8, padding:'8px 12px', width:'100%' }}>
                              <p style={{ fontSize:'0.75rem', color:'#EF4444', margin:0, fontWeight:600 }}>
                                Reason: {c.bursar_note}
                              </p>
                            </div>
                          )}
                          {/* Confirmation note */}
                          {c.status === 'confirmed' && (
                            <div style={{ background:'#10B98115', border:'1px solid #10B98130',
                              borderRadius:8, padding:'8px 12px', width:'100%' }}>
                              <p style={{ fontSize:'0.75rem', color:'#10B981', margin:0, fontWeight:600 }}>
                                ✓ Payment confirmed. Fees updated.
                              </p>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </>
      }
      <div className={styles.spacer}/>
    </RolePageWrapper>
  )
}
