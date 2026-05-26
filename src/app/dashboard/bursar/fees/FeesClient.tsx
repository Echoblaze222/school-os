'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { WalletIcon, PlusIcon, TrashIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'

interface Props { profile: any; school: any; userId: string }

const TERMS    = ['First Term', 'Second Term', 'Third Term']
const FEE_TYPES = ['school_fees','development_levy','pta','uniform','other']
const CUR_YEAR  = new Date().getMonth() >= 8
  ? `${new Date().getFullYear()}/${new Date().getFullYear()+1}`
  : `${new Date().getFullYear()-1}/${new Date().getFullYear()}`

const BLANK = { class_level:'', fee_type:'school_fees', amount:'', description:'' }

export default function FeesClient({ profile, school, userId }: Props) {
  const [rows,     setRows]     = useState<any[]>([])
  const [classes,  setClasses]  = useState<string[]>([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form,     setForm]     = useState({ ...BLANK })
  const [term,     setTerm]     = useState('First Term')
  const [year,     setYear]     = useState(CUR_YEAR)
  const supabase = createClient()
  const sc       = school?.primary_color ?? '#7C3AED'

  useEffect(() => { loadClasses() }, [])
  useEffect(() => { load() }, [term, year])

  async function loadClasses() {
    const { data } = await supabase.from('classes')
      .select('class_level').eq('school_id', school?.id)
    if (data) {
      const unique = [...new Set(data.map((c: any) => c.class_level).filter(Boolean))] as string[]
      setClasses(unique)
    }
  }

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('school_fees').select('*')
      .eq('school_id', school?.id).eq('term', term).eq('academic_year', year)
      .order('class_level')
    if (data) setRows(data)
    setLoading(false)
  }

  async function submit() {
    if (!form.class_level || !form.amount) return
    setSaving(true)
    await supabase.from('school_fees').upsert(
      { ...form, amount: parseFloat(form.amount), school_id: school.id, term, academic_year: year },
      { onConflict: 'school_id,class_level,term,academic_year,fee_type' }
    )
    setForm({ ...BLANK }); setShowForm(false); setSaving(false)
    load()
  }

  async function del(id: string) {
    setDeleting(id)
    await supabase.from('school_fees').delete().eq('id', id)
    setDeleting(null); load()
  }

  function fmtAmt(n: number) {
    return new Intl.NumberFormat('en-NG', { style:'currency', currency:'NGN', minimumFractionDigits:0 }).format(n)
  }

  const totalExpected = rows.reduce((s, r) => s + (r.amount ?? 0), 0)
  const inp: React.CSSProperties = { width:'100%', height:42, padding:'0 12px', background:'var(--input-bg)', border:'1px solid var(--input-border)', borderRadius:8, color:'var(--text-primary)', fontSize:'0.85rem', outline:'none' }

  return (
    <RolePageWrapper userId={userId} role="bursar" profile={profile} school={school} title="Fee Structures">
      {/* Year + Term */}
      <div style={{ display:'flex', gap:'var(--space-3)', marginBottom:'var(--space-4)', alignItems:'center' }}>
        <input value={year} onChange={e => setYear(e.target.value)} placeholder="2024/2025"
          style={{ ...inp, width:110, flex:'none' }}/>
        <div className={styles.tabs} style={{ flex:1 }}>
          {TERMS.map(t => (
            <button key={t} onClick={() => setTerm(t)}
              className={`${styles.tab} ${term===t ? styles.tabActive : ''}`}
              style={term===t ? { background:sc, color:'#fff', borderColor:sc } : {}}>
              {t.replace(' Term','')}
            </button>
          ))}
        </div>
        {!showForm && (
          <button onClick={() => { setForm({ ...BLANK }); setShowForm(true) }}
            style={{ display:'flex', alignItems:'center', gap:6, height:36, padding:'0 14px',
              background:sc, color:'#fff', border:'none', borderRadius:8,
              fontWeight:700, fontSize:'0.8rem', cursor:'pointer', flexShrink:0 }}>
            <PlusIcon size={14} color="#fff"/> Add
          </button>
        )}
      </div>

      {/* Create form */}
      {showForm && (
        <div style={{ background:'var(--glass-bg)', border:'1px solid var(--glass-border)',
          borderRadius:'var(--radius-xl)', padding:'var(--space-5)', marginBottom:'var(--space-5)' }}>
          <p style={{ fontSize:'0.85rem', fontWeight:800, color:'var(--text-primary)', margin:'0 0 var(--space-4)' }}>
            New Fee — {term} {year}
          </p>
          <div style={{ display:'grid', gap:'var(--space-3)' }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--space-3)' }}>
              <select value={form.class_level}
                onChange={e => setForm(p => ({...p, class_level:e.target.value}))} style={inp}>
                <option value="">Select class *</option>
                {classes.map(c => <option key={c}>{c}</option>)}
              </select>
              <select value={form.fee_type}
                onChange={e => setForm(p => ({...p, fee_type:e.target.value}))} style={inp}>
                {FEE_TYPES.map(f => (
                  <option key={f} value={f} style={{ textTransform:'capitalize' }}>
                    {f.replace(/_/g,' ')}
                  </option>
                ))}
              </select>
            </div>
            <input type="number" placeholder="Amount (₦) *" value={form.amount}
              onChange={e => setForm(p => ({...p, amount:e.target.value}))} style={inp}/>
            <input placeholder="Description (optional)" value={form.description}
              onChange={e => setForm(p => ({...p, description:e.target.value}))} style={inp}/>
          </div>
          <div style={{ display:'flex', gap:'var(--space-3)', marginTop:'var(--space-4)' }}>
            <button onClick={submit} disabled={saving || !form.class_level || !form.amount}
              style={{ flex:1, height:42, background:sc, color:'#fff', border:'none', borderRadius:8,
                fontWeight:700, fontSize:'0.85rem', cursor:'pointer',
                opacity:(saving || !form.class_level || !form.amount) ? 0.5 : 1 }}>
              {saving ? 'Saving…' : 'Save Fee'}
            </button>
            <button onClick={() => setShowForm(false)}
              style={{ padding:'0 20px', height:42, background:'var(--input-bg)',
                color:'var(--text-muted)', border:'1px solid var(--input-border)',
                borderRadius:8, fontWeight:700, cursor:'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Total banner */}
      {!loading && rows.length > 0 && (
        <div style={{ padding:'var(--space-4)', background:sc+'15',
          border:`1px solid ${sc}30`, borderRadius:10, marginBottom:'var(--space-4)' }}>
          <p style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--text-muted)',
            letterSpacing:'0.05em', margin:'0 0 4px' }}>
            TOTAL PER STUDENT — {term} {year}
          </p>
          <p style={{ fontSize:'1.2rem', fontWeight:800, color:sc, margin:0 }}>
            {fmtAmt(totalExpected)}
          </p>
        </div>
      )}

      {loading
        ? <div className={styles.loading}><span/><span/><span/></div>
        : rows.length === 0
          ? <div className={styles.empty}>
              <WalletIcon size={40} color="var(--text-faint)" strokeWidth={1}/>
              <p>No fee structures for {term} {year}</p>
            </div>
          : <div className={styles.list}>
              {rows.map((item: any) => (
                <div key={item.id} className={styles.card}>
                  <div className={styles.cardIcon} style={{ background:sc+'20' }}>
                    <WalletIcon size={16} color={sc}/>
                  </div>
                  <div className={styles.cardBody}>
                    <p className={styles.cardTitle}>{item.class_level}</p>
                    <p className={styles.cardMeta} style={{ textTransform:'capitalize' }}>
                      {item.fee_type?.replace(/_/g,' ')}
                      {item.description ? ` · ${item.description}` : ''}
                    </p>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
                    <span style={{ fontSize:'0.9rem', fontWeight:800, color:sc }}>
                      {fmtAmt(item.amount)}
                    </span>
                    <button onClick={() => del(item.id)} disabled={deleting === item.id}
                      style={{ background:'#EF444420', border:'none', borderRadius:6,
                        padding:'5px 8px', cursor:'pointer', display:'flex', alignItems:'center',
                        opacity: deleting===item.id ? 0.5 : 1 }}>
                      <TrashIcon size={13} color="#EF4444"/>
                    </button>
                  </div>
                </div>
              ))}
            </div>
      }
      <div className={styles.spacer}/>
    </RolePageWrapper>
  )
}
