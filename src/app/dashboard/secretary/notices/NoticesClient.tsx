'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { MegaphoneIcon, PlusIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'

type Tab = 'published' | 'draft'
interface Props { profile: any; school: any; userId: string }

const BLANK = { title:'', body:'', audience:'all', status:'published' as 'published' | 'draft' }
const AUDIENCE_COLORS: Record<string,string> = {
  all:'#6B7280', students:'#3B82F6', teachers:'#10B981', parents:'#F59E0B', staff:'#8B5CF6'
}

export default function NoticesClient({ profile, school, userId }: Props) {
  const [tab,     setTab]     = useState<Tab>('published')
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
    const { data } = await supabase.from('announcements')
      .select('*').eq('school_id', school?.id).eq('status', tab)
      .order('created_at', { ascending:false }).limit(30)
    if (data) setRows(data)
    setLoading(false)
  }

  async function submit() {
    if (!form.title.trim() || !form.body.trim()) return
    setSaving(true)
    await supabase.from('announcements').insert({ ...form, school_id:school.id, author_id:userId })
    setForm({ ...BLANK }); setShowForm(false); setSaving(false)
    if (tab === form.status) load()
  }

  async function publish(id: string) {
    await supabase.from('announcements').update({ status:'published' }).eq('id', id)
    load()
  }

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-NG', { day:'numeric', month:'short', year:'numeric' })
  }

  const inp: React.CSSProperties = {
    width:'100%', height:42, padding:'0 12px', background:'var(--input-bg)',
    border:'1px solid var(--input-border)', borderRadius:8,
    color:'var(--text-primary)', fontSize:'0.85rem', outline:'none'
  }

  return (
    <RolePageWrapper userId={userId} role="secretary" profile={profile} school={school} title="Notices">
      {showForm && (
        <div style={{ background:'var(--glass-bg)', border:'1px solid var(--glass-border)',
          borderRadius:'var(--radius-xl)', padding:'var(--space-5)', marginBottom:'var(--space-5)' }}>
          <p style={{ fontSize:'0.85rem', fontWeight:800, color:'var(--text-primary)', margin:'0 0 var(--space-4)' }}>
            New Notice
          </p>
          <div style={{ display:'grid', gap:'var(--space-3)' }}>
            <input placeholder="Notice title *" value={form.title}
              onChange={e => setForm(p => ({...p, title:e.target.value}))} style={inp}/>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--space-3)' }}>
              <select value={form.audience}
                onChange={e => setForm(p => ({...p, audience:e.target.value}))} style={inp}>
                {['all','students','teachers','parents','staff'].map(a => (
                  <option key={a} style={{ textTransform:'capitalize' }}>{a}</option>
                ))}
              </select>
              <select value={form.status}
                onChange={e => setForm(p => ({...p, status:e.target.value as any}))} style={inp}>
                <option value="published">Publish now</option>
                <option value="draft">Save as draft</option>
              </select>
            </div>
            <textarea placeholder="Notice body *" value={form.body} rows={4}
              onChange={e => setForm(p => ({...p, body:e.target.value}))}
              style={{ ...inp, height:'auto', padding:'10px 12px', resize:'none' }}/>
          </div>
          <div style={{ display:'flex', gap:'var(--space-3)', marginTop:'var(--space-4)' }}>
            <button onClick={submit} disabled={saving || !form.title.trim() || !form.body.trim()}
              style={{ flex:1, height:42, background:sc, color:'#fff', border:'none', borderRadius:8,
                fontWeight:700, fontSize:'0.85rem', cursor:'pointer',
                opacity:(saving || !form.title.trim() || !form.body.trim()) ? 0.5 : 1 }}>
              {saving ? 'Saving…' : form.status === 'published' ? 'Publish Notice' : 'Save Draft'}
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

      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'var(--space-4)' }}>
        <div className={styles.tabs}>
          {(['published','draft'] as Tab[]).map(t => (
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
              background:sc, color:'#fff', border:'none', borderRadius:8,
              fontWeight:700, fontSize:'0.8rem', cursor:'pointer' }}>
            <PlusIcon size={14} color="#fff"/> New
          </button>
        )}
      </div>

      {loading
        ? <div className={styles.loading}><span/><span/><span/></div>
        : rows.length === 0
          ? <div className={styles.empty}>
              <MegaphoneIcon size={40} color="var(--text-faint)" strokeWidth={1}/>
              <p>No {tab} notices</p>
            </div>
          : <div className={styles.list}>
              {rows.map((item:any) => {
                const ac = AUDIENCE_COLORS[item.audience] ?? '#6B7280'
                return (
                  <div key={item.id} className={styles.card}>
                    <div className={styles.cardIcon} style={{ background:sc+'20' }}>
                      <MegaphoneIcon size={16} color={sc}/>
                    </div>
                    <div className={styles.cardBody}>
                      <p className={styles.cardTitle}>{item.title}</p>
                      <p className={styles.cardMeta}>
                        <span style={{ color:ac, fontWeight:700, textTransform:'capitalize' }}>
                          {item.audience}
                        </span>
                        {item.body ? ` · ${item.body.slice(0,60)}…` : ''}
                      </p>
                      <p style={{ fontSize:'0.68rem', color:'var(--text-muted)', margin:'2px 0 0' }}>
                        {fmtDate(item.created_at)}
                      </p>
                    </div>
                    {tab === 'draft' && (
                      <button onClick={() => publish(item.id)}
                        style={{ padding:'5px 12px', background:'#10B98120', color:'#10B981',
                          border:'none', borderRadius:6, fontWeight:700,
                          fontSize:'0.7rem', cursor:'pointer', flexShrink:0 }}>
                        Publish
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
      }
      <div className={styles.spacer}/>
    </RolePageWrapper>
  )
}
