'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { FileTextIcon, PlusIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'

interface Props { profile: any; school: any; userId: string }

const CATEGORIES = ['all','policy','circular','form','report','general']
const CAT_COLOR: Record<string,string> = {
  policy:'#EF4444', circular:'#3B82F6', form:'#10B981', report:'#F59E0B', general:'#6B7280'
}

export default function DocumentsClient({ profile, school, userId }: Props) {
  const [docs,    setDocs]    = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [cat,     setCat]     = useState('all')
  const [showForm,setShowForm]= useState(false)
  const [form,    setForm]    = useState({ title:'', content:'', category:'general' })
  const supabase = createClient()
  const sc       = school?.primary_color ?? '#7C3AED'

  useEffect(() => { load() }, [cat])

  async function load() {
    setLoading(true)
    let q = supabase.from('school_documents').select('*').eq('school_id', school?.id)
      .order('created_at', { ascending:false })
    if (cat!=='all') q = q.eq('category', cat)
    const { data } = await q.limit(40)
    if (data) setDocs(data)
    setLoading(false)
  }

  async function submit() {
    if (!form.title.trim()) return
    setSaving(true)
    await supabase.from('school_documents').insert({ ...form, school_id:school.id, created_by:userId })
    setForm({ title:'', content:'', category:'general' }); setShowForm(false); setSaving(false)
    load()
  }

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-NG', { day:'numeric', month:'short', year:'numeric' })
  }

  const inp: React.CSSProperties = { width:'100%', height:42, padding:'0 12px', background:'var(--input-bg)', border:'1px solid var(--input-border)', borderRadius:8, color:'var(--text-primary)', fontSize:'0.85rem', outline:'none' }

  return (
    <RolePageWrapper userId={userId} role="secretary" profile={profile} school={school} title="Documents">
      {showForm && (
        <div style={{ background:'var(--glass-bg)', border:'1px solid var(--glass-border)',
          borderRadius:'var(--radius-xl)', padding:'var(--space-5)', marginBottom:'var(--space-5)' }}>
          <p style={{ fontSize:'0.85rem', fontWeight:800, color:'var(--text-primary)', margin:'0 0 var(--space-4)' }}>New Document</p>
          <div style={{ display:'grid', gap:'var(--space-3)' }}>
            <input placeholder="Document title *" value={form.title}
              onChange={e => setForm(p => ({...p, title:e.target.value}))} style={inp}/>
            <select value={form.category} onChange={e => setForm(p => ({...p, category:e.target.value}))} style={inp}>
              {['policy','circular','form','report','general'].map(c => <option key={c}>{c}</option>)}
            </select>
            <textarea placeholder="Content / body (optional)" value={form.content} rows={4}
              onChange={e => setForm(p => ({...p, content:e.target.value}))}
              style={{ ...inp, height:'auto', padding:'10px 12px', resize:'none' }}/>
          </div>
          <div style={{ display:'flex', gap:'var(--space-3)', marginTop:'var(--space-4)' }}>
            <button onClick={submit} disabled={saving || !form.title.trim()}
              style={{ flex:1, height:42, background:sc, color:'#fff', border:'none', borderRadius:8,
                fontWeight:700, fontSize:'0.85rem', cursor:'pointer', opacity:saving?0.6:1 }}>
              {saving ? 'Saving…' : 'Save Document'}
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
        <div className={styles.subjectScroll} style={{ flex:1 }}>
          {CATEGORIES.map(c => (
            <button key={c} onClick={() => setCat(c)}
              className={`${styles.subjectPill} ${cat===c ? styles.subjectPillActive : ''}`}
              style={cat===c ? { background:sc, borderColor:sc, color:'#fff' } : { borderColor:sc+'50', color:sc, textTransform:'capitalize' }}>
              {c}
            </button>
          ))}
        </div>
        {!showForm && (
          <button onClick={() => setShowForm(true)}
            style={{ display:'flex', alignItems:'center', gap:6, height:36, padding:'0 14px',
              background:sc, color:'#fff', border:'none', borderRadius:8, fontWeight:700, fontSize:'0.8rem',
              cursor:'pointer', flexShrink:0, marginLeft:'var(--space-3)' }}>
            <PlusIcon size={14} color="#fff"/> New
          </button>
        )}
      </div>

      {loading
        ? <div className={styles.loading}><span/><span/><span/></div>
        : docs.length === 0
          ? <div className={styles.empty}><FileTextIcon size={40} color="var(--text-faint)" strokeWidth={1}/><p>No documents found</p></div>
          : <div className={styles.list}>
              {docs.map((doc:any) => {
                const color = CAT_COLOR[doc.category] ?? '#6B7280'
                return (
                  <div key={doc.id} className={styles.card}>
                    <div className={styles.cardIcon} style={{ background:color+'20' }}>
                      <FileTextIcon size={16} color={color}/>
                    </div>
                    <div className={styles.cardBody}>
                      <p className={styles.cardTitle}>{doc.title}</p>
                      <p className={styles.cardMeta} style={{ textTransform:'capitalize' }}>
                        {doc.category}{doc.content ? ` · ${doc.content.slice(0,55)}…` : ''}
                      </p>
                    </div>
                    <p style={{ fontSize:'0.7rem', color:'var(--text-muted)', flexShrink:0 }}>{fmtDate(doc.created_at)}</p>
                  </div>
                )
              })}
            </div>
      }
      <div className={styles.spacer}/>
    </RolePageWrapper>
  )
}
