'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { ClipboardIcon, PlusIcon, CheckCircleIcon, TrashIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'

type Tab = 'pending' | 'admitted' | 'rejected'
interface Props { profile: any; school: any; userId: string }

const BLANK = { applicant_name:'', class_applying_for:'', gender:'',
                parent_name:'', parent_phone:'', parent_email:'', previous_school:'', notes:'' }

export default function ApplicationsClient({ profile, school, userId }: Props) {
  const [tab,     setTab]     = useState<Tab>('pending')
  const [rows,    setRows]    = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [showForm,setShowForm]= useState(false)
  const [form,    setForm]    = useState({ ...BLANK })
  const supabase = createClient()
  const sc       = school?.primary_color ?? '#7C3AED'

  useEffect(() => { load() }, [tab])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('applications')
      .select('*').eq('school_id', school?.id).eq('status', tab)
      .order('created_at', { ascending:false })
    if (data) setRows(data)
    setLoading(false)
  }

  async function submit() {
    if (!form.applicant_name.trim()) return
    setSaving(true)
    await supabase.from('applications').insert({ ...form, school_id:school.id, status:'pending' })
    setForm({ ...BLANK }); setShowForm(false); setSaving(false)
    if (tab === 'pending') load()
  }

  async function approve(id: string) {
    await supabase.from('applications').update({ status:'admitted', reviewed_by:userId, reviewed_at:new Date().toISOString() }).eq('id', id)
    load()
  }

  async function reject(id: string) {
    await supabase.from('applications').update({ status:'rejected', reviewed_by:userId, reviewed_at:new Date().toISOString() }).eq('id', id)
    load()
  }

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-NG', { day:'numeric', month:'short', year:'numeric' })
  }

  const inp: React.CSSProperties = { width:'100%', height:42, padding:'0 12px', background:'var(--input-bg)', border:'1px solid var(--input-border)', borderRadius:8, color:'var(--text-primary)', fontSize:'0.85rem', outline:'none' }

  return (
    <RolePageWrapper userId={userId} role="secretary" profile={profile} school={school} title="Applications">
      {showForm && (
        <div style={{ background:'var(--glass-bg)', border:'1px solid var(--glass-border)',
          borderRadius:'var(--radius-xl)', padding:'var(--space-5)', marginBottom:'var(--space-5)' }}>
          <p style={{ fontSize:'0.85rem', fontWeight:800, color:'var(--text-primary)', margin:'0 0 var(--space-4)' }}>New Application</p>
          <div style={{ display:'grid', gap:'var(--space-3)' }}>
            <input placeholder="Applicant full name *" value={form.applicant_name}
              onChange={e => setForm(p => ({...p, applicant_name:e.target.value}))} style={inp}/>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--space-3)' }}>
              <select value={form.gender} onChange={e => setForm(p => ({...p, gender:e.target.value}))} style={inp}>
                <option value="">Gender</option>
                <option>Male</option><option>Female</option>
              </select>
              <input placeholder="Class applying for" value={form.class_applying_for}
                onChange={e => setForm(p => ({...p, class_applying_for:e.target.value}))} style={inp}/>
            </div>
            <input placeholder="Parent / guardian name" value={form.parent_name}
              onChange={e => setForm(p => ({...p, parent_name:e.target.value}))} style={inp}/>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--space-3)' }}>
              <input placeholder="Parent phone" value={form.parent_phone}
                onChange={e => setForm(p => ({...p, parent_phone:e.target.value}))} style={inp}/>
              <input placeholder="Parent email" value={form.parent_email}
                onChange={e => setForm(p => ({...p, parent_email:e.target.value}))} style={inp}/>
            </div>
            <input placeholder="Previous school (optional)" value={form.previous_school}
              onChange={e => setForm(p => ({...p, previous_school:e.target.value}))} style={inp}/>
            <textarea placeholder="Notes (optional)" value={form.notes} rows={2}
              onChange={e => setForm(p => ({...p, notes:e.target.value}))}
              style={{ ...inp, height:'auto', padding:'10px 12px', resize:'none' }}/>
          </div>
          <div style={{ display:'flex', gap:'var(--space-3)', marginTop:'var(--space-4)' }}>
            <button onClick={submit} disabled={saving || !form.applicant_name.trim()}
              style={{ flex:1, height:42, background:sc, color:'#fff', border:'none', borderRadius:8,
                fontWeight:700, fontSize:'0.85rem', cursor:'pointer', opacity:saving?0.6:1 }}>
              {saving ? 'Saving…' : 'Submit Application'}
            </button>
            <button onClick={() => setShowForm(false)}
              style={{ padding:'0 20px', height:42, background:'var(--input-bg)', color:'var(--text-muted)',
                border:'1px solid var(--input-border)', borderRadius:8, fontWeight:700, cursor:'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'var(--space-4)' }}>
        <div className={styles.tabs}>
          {(['pending','admitted','rejected'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`${styles.tab} ${tab===t ? styles.tabActive : ''}`}
              style={tab===t ? { background:sc, color:'#fff', borderColor:sc } : {}}>
              {t.charAt(0).toUpperCase()+t.slice(1)}
            </button>
          ))}
        </div>
        {!showForm && (
          <button onClick={() => setShowForm(true)}
            style={{ display:'flex', alignItems:'center', gap:6, height:36, padding:'0 14px',
              background:sc, color:'#fff', border:'none', borderRadius:8, fontWeight:700, fontSize:'0.8rem', cursor:'pointer' }}>
            <PlusIcon size={14} color="#fff"/> New
          </button>
        )}
      </div>

      {loading
        ? <div className={styles.loading}><span/><span/><span/></div>
        : rows.length === 0
          ? <div className={styles.empty}><ClipboardIcon size={40} color="var(--text-faint)" strokeWidth={1}/><p>No {tab} applications</p></div>
          : <div className={styles.list}>
              {rows.map((item:any) => (
                <div key={item.id} className={styles.card}>
                  <div className={styles.cardIcon} style={{ background:sc+'20' }}>
                    <ClipboardIcon size={16} color={sc}/>
                  </div>
                  <div className={styles.cardBody}>
                    <p className={styles.cardTitle}>{item.applicant_name}</p>
                    <p className={styles.cardMeta}>
                      {[item.class_applying_for, item.gender].filter(Boolean).join(' · ')}
                      {item.parent_phone ? ` · ${item.parent_phone}` : ''}
                    </p>
                    <p style={{ fontSize:'0.68rem', color:'var(--text-muted)', margin:'2px 0 0' }}>
                      Received {fmtDate(item.created_at)}
                    </p>
                  </div>
                  {tab === 'pending' && (
                    <div style={{ display:'flex', flexDirection:'column', gap:6, flexShrink:0 }}>
                      <button onClick={() => approve(item.id)}
                        style={{ display:'flex', alignItems:'center', gap:4, padding:'4px 10px',
                          background:'#10B98120', color:'#10B981', border:'none', borderRadius:6,
                          fontWeight:700, fontSize:'0.7rem', cursor:'pointer' }}>
                        <CheckCircleIcon size={12} color="#10B981"/> Admit
                      </button>
                      <button onClick={() => reject(item.id)}
                        style={{ display:'flex', alignItems:'center', gap:4, padding:'4px 10px',
                          background:'#EF444420', color:'#EF4444', border:'none', borderRadius:6,
                          fontWeight:700, fontSize:'0.7rem', cursor:'pointer' }}>
                        <TrashIcon size={12} color="#EF4444"/> Reject
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
      }
      <div className={styles.spacer}/>
    </RolePageWrapper>
  )
}
