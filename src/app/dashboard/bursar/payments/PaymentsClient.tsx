'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { WalletIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'

type Tab = 'record' | 'history'
interface Props { profile: any; school: any; userId: string }

const TERMS        = ['First Term', 'Second Term', 'Third Term']
const FEE_TYPES    = ['school_fees','development_levy','pta','uniform','other']
const PAY_METHODS  = ['bank_transfer','cash','pos']
const CUR_YEAR     = `${new Date().getFullYear()}/${new Date().getFullYear()+1}`

const BLANK = {
  student_id:'', student_name:'', class_level:'',
  amount:'', term:'First Term', academic_year: CUR_YEAR,
  fee_type:'school_fees', payment_method:'bank_transfer', reference:'', notes:''
}

export default function PaymentsClient({ profile, school, userId }: Props) {
  const [tab,         setTab]         = useState<Tab>('record')
  const [history,     setHistory]     = useState<any[]>([])
  const [histLoading, setHistLoading] = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [saved,       setSaved]       = useState(false)
  const [form,        setForm]        = useState({ ...BLANK })
  const [query,       setQuery]       = useState('')
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [bankInfo,    setBankInfo]    = useState<any>(null)
  const searchTimer                   = useRef<ReturnType<typeof setTimeout>>(undefined)
  const supabase = createClient()
  const sc       = school?.primary_color ?? '#7C3AED'

  useEffect(() => {
    if (tab === 'history') loadHistory()
    else                   loadBankInfo()
  }, [tab])

  async function loadBankInfo() {
    const { data } = await supabase.from('schools')
      .select('bank_name, account_number, account_name').eq('id', school?.id).single()
    if (data) setBankInfo(data)
  }

  async function loadHistory() {
    setHistLoading(true)
    const { data } = await supabase.from('fee_payments').select('*')
      .eq('school_id', school?.id).order('created_at', { ascending:false }).limit(60)
    if (data) setHistory(data)
    setHistLoading(false)
  }

  function onStudentSearch(val: string) {
    setQuery(val)
    setForm(p => ({ ...p, student_name:val, student_id:'', class_level:'' }))
    clearTimeout(searchTimer.current)
    if (!val.trim()) { setSuggestions([]); return }
    searchTimer.current = setTimeout(async () => {
      const { data } = await supabase.from('profiles')
        .select('id, full_name, default_code, class_level')
        .eq('school_id', school?.id).eq('role', 'student')
        .ilike('full_name', `%${val}%`).limit(6)
      if (data) setSuggestions(data)
    }, 300)
  }

  function selectStudent(s: any) {
    setQuery(s.full_name)
    setForm(p => ({ ...p, student_id:s.id, student_name:s.full_name, class_level:s.class_level ?? '' }))
    setSuggestions([])
  }

  async function submit() {
    if (!form.student_name.trim() || !form.amount) return
    setSaving(true)
    const receipt_number = `RCP-${Date.now().toString(36).toUpperCase()}`
    await supabase.from('fee_payments').insert({
      ...form, amount:parseFloat(form.amount),
      school_id:school.id, recorded_by:userId, receipt_number,
    })
    setForm({ ...BLANK }); setQuery(''); setSuggestions([])
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 4000)
  }

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-NG', { day:'numeric', month:'short', year:'numeric' })
  }
  function fmtAmt(n: number) {
    return new Intl.NumberFormat('en-NG', { style:'currency', currency:'NGN', minimumFractionDigits:0 }).format(n)
  }

  const inp: React.CSSProperties = {
    width:'100%', height:44, padding:'0 14px', background:'var(--input-bg)',
    border:'1px solid var(--input-border)', borderRadius:10,
    color:'var(--text-primary)', fontSize:'0.85rem', outline:'none'
  }
  const lbl: React.CSSProperties = {
    fontSize:'0.72rem', fontWeight:700, color:'var(--text-muted)',
    letterSpacing:'0.05em', marginBottom:6, display:'block'
  }
  const canSubmit = form.student_name.trim() && form.amount && !saving

  return (
    <RolePageWrapper userId={userId} role="bursar" profile={profile} school={school} title="Payments">
      <div className={styles.tabs} style={{ marginBottom:'var(--space-5)' }}>
        {([['record','Record Payment'],['history','Payment History']] as const).map(([key, lbl]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`${styles.tab} ${tab===key ? styles.tabActive : ''}`}
            style={tab===key ? { background:sc, color:'#fff', borderColor:sc } : {}}>
            {lbl}
          </button>
        ))}
      </div>

      {/* ── Record Payment ────────────────────────────────── */}
      {tab === 'record' && (
        <>
          {/* Bank info banner */}
          {bankInfo?.account_number && (
            <div style={{ padding:'var(--space-4)', background:'var(--glass-bg)',
              border:'1px solid var(--glass-border)', borderRadius:10, marginBottom:'var(--space-5)' }}>
              <p style={{ fontSize:'0.7rem', fontWeight:800, color:'var(--text-muted)',
                letterSpacing:'0.05em', margin:'0 0 4px' }}>SCHOOL BANK ACCOUNT</p>
              <p style={{ fontSize:'0.88rem', fontWeight:700, color:'var(--text-primary)', margin:'0 0 2px' }}>
                {bankInfo.account_name}
              </p>
              <p style={{ fontSize:'0.8rem', color:'var(--text-muted)', margin:0 }}>
                {bankInfo.bank_name} · {bankInfo.account_number}
              </p>
            </div>
          )}

          {saved && (
            <div style={{ padding:'var(--space-4)', background:'#10B98115',
              border:'1px solid #10B98140', borderRadius:10, marginBottom:'var(--space-5)',
              fontSize:'0.85rem', fontWeight:700, color:'#10B981' }}>
              ✓ Payment recorded successfully
            </div>
          )}

          <div style={{ display:'grid', gap:'var(--space-4)' }}>
            {/* Student autocomplete */}
            <div>
              <label style={lbl}>STUDENT</label>
              <div style={{ position:'relative' }}>
                <input value={query} onChange={e => onStudentSearch(e.target.value)}
                  placeholder="Search student by name…" style={inp}/>
                {suggestions.length > 0 && (
                  <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, right:0,
                    zIndex:20, background:'var(--glass-bg)', border:'1px solid var(--glass-border)',
                    borderRadius:10, overflow:'hidden', boxShadow:'0 8px 24px rgba(0,0,0,0.15)' }}>
                    {suggestions.map((s:any) => (
                      <button key={s.id} onClick={() => selectStudent(s)}
                        style={{ width:'100%', padding:'10px 14px', background:'none', border:'none',
                          borderBottom:'1px solid var(--glass-border)', cursor:'pointer', textAlign:'left' }}>
                        <p style={{ fontSize:'0.85rem', fontWeight:700, color:'var(--text-primary)', margin:'0 0 2px' }}>
                          {s.full_name}
                        </p>
                        <p style={{ fontSize:'0.72rem', color:'var(--text-muted)', margin:0 }}>
                          {s.default_code} · {s.class_level}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Amount */}
            <div>
              <label style={lbl}>AMOUNT (₦)</label>
              <input type="number" placeholder="0" value={form.amount}
                onChange={e => setForm(p => ({...p, amount:e.target.value}))} style={inp}/>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--space-3)' }}>
              <div>
                <label style={lbl}>TERM</label>
                <select value={form.term}
                  onChange={e => setForm(p => ({...p, term:e.target.value}))} style={inp}>
                  {TERMS.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>ACADEMIC YEAR</label>
                <input placeholder={CUR_YEAR} value={form.academic_year}
                  onChange={e => setForm(p => ({...p, academic_year:e.target.value}))} style={inp}/>
              </div>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--space-3)' }}>
              <div>
                <label style={lbl}>FEE TYPE</label>
                <select value={form.fee_type}
                  onChange={e => setForm(p => ({...p, fee_type:e.target.value}))} style={inp}>
                  {FEE_TYPES.map(f => (
                    <option key={f} value={f} style={{ textTransform:'capitalize' }}>
                      {f.replace(/_/g,' ')}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={lbl}>PAYMENT METHOD</label>
                <select value={form.payment_method}
                  onChange={e => setForm(p => ({...p, payment_method:e.target.value}))} style={inp}>
                  {PAY_METHODS.map(m => (
                    <option key={m} value={m}>{m.replace(/_/g,' ')}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label style={lbl}>REFERENCE / TELLER NO. (optional)</label>
              <input placeholder="Bank teller or transfer reference" value={form.reference}
                onChange={e => setForm(p => ({...p, reference:e.target.value}))} style={inp}/>
            </div>
            <div>
              <label style={lbl}>NOTES (optional)</label>
              <input placeholder="Any additional notes" value={form.notes}
                onChange={e => setForm(p => ({...p, notes:e.target.value}))} style={inp}/>
            </div>
          </div>

          <button onClick={submit} disabled={!canSubmit}
            style={{ width:'100%', height:48, background:sc, color:'#fff', border:'none',
              borderRadius:10, fontWeight:700, fontSize:'0.9rem', cursor:'pointer',
              marginTop:'var(--space-6)', opacity:canSubmit ? 1 : 0.45 }}>
            {saving ? 'Recording…' : 'Record Payment'}
          </button>
        </>
      )}

      {/* ── Payment History ───────────────────────────────── */}
      {tab === 'history' && (
        histLoading
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
      )}

      <div className={styles.spacer}/>
    </RolePageWrapper>
  )
}

