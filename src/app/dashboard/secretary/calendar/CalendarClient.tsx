'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { CalendarIcon, PlusIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'

type Tab = 'upcoming' | 'past'
interface Props { profile: any; school: any; userId: string }

const BLANK = { title:'', description:'', event_date:'', event_time:'', event_type:'general', audience:'all' }
const TYPE_COLORS: Record<string,string> = {
  academic:'#3B82F6', holiday:'#10B981', exam:'#EF4444',
  meeting:'#F59E0B', sports:'#8B5CF6', general:'#6B7280',
}

export default function CalendarClient({ profile, school, userId }: Props) {
  const [tab,     setTab]     = useState<Tab>('upcoming')
  const [events,  setEvents]  = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [showForm,setShowForm]= useState(false)
  const [form,    setForm]    = useState({ ...BLANK })
  const supabase = createClient()
  const sc       = school?.primary_color ?? '#7C3AED'

  useEffect(() => { load() }, [tab])

  async function load() {
    setLoading(true)
    const today = new Date().toISOString().split('T')[0]
    let q = supabase.from('events').select('*').eq('school_id', school?.id)
    if (tab==='upcoming') q = q.gte('event_date', today).order('event_date')
    else                  q = q.lt('event_date', today).order('event_date', { ascending:false })
    const { data } = await q.limit(50)
    if (data) setEvents(data)
    setLoading(false)
  }

  async function submit() {
    if (!form.title.trim() || !form.event_date) return
    setSaving(true)
    await supabase.from('events').insert({ ...form, school_id:school.id, created_by:userId })
    setForm({ ...BLANK }); setShowForm(false); setSaving(false)
    if (tab==='upcoming') load()
  }

  function fmtDate(d: string) {
    return new Date(d+'T00:00:00').toLocaleDateString('en-NG',
      { weekday:'short', day:'numeric', month:'short', year:'numeric' })
  }

  const inp: React.CSSProperties = { width:'100%', height:42, padding:'0 12px', background:'var(--input-bg)', border:'1px solid var(--input-border)', borderRadius:8, color:'var(--text-primary)', fontSize:'0.85rem', outline:'none' }

  return (
    <RolePageWrapper userId={userId} role="secretary" profile={profile} school={school} title="Calendar">
      {showForm && (
        <div style={{ background:'var(--glass-bg)', border:'1px solid var(--glass-border)',
          borderRadius:'var(--radius-xl)', padding:'var(--space-5)', marginBottom:'var(--space-5)' }}>
          <p style={{ fontSize:'0.85rem', fontWeight:800, color:'var(--text-primary)', margin:'0 0 var(--space-4)' }}>Add Event</p>
          <div style={{ display:'grid', gap:'var(--space-3)' }}>
            <input placeholder="Event title *" value={form.title}
              onChange={e => setForm(p => ({...p, title:e.target.value}))} style={inp}/>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--space-3)' }}>
              <input type="date" value={form.event_date}
                onChange={e => setForm(p => ({...p, event_date:e.target.value}))} style={inp}/>
              <input type="time" value={form.event_time}
                onChange={e => setForm(p => ({...p, event_time:e.target.value}))} style={inp}/>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--space-3)' }}>
              <select value={form.event_type} onChange={e => setForm(p => ({...p, event_type:e.target.value}))} style={inp}>
                {['academic','holiday','exam','meeting','sports','general'].map(t => <option key={t}>{t}</option>)}
              </select>
              <select value={form.audience} onChange={e => setForm(p => ({...p, audience:e.target.value}))} style={inp}>
                {['all','students','teachers','parents','staff'].map(a => <option key={a}>{a}</option>)}
              </select>
            </div>
            <textarea placeholder="Description (optional)" value={form.description} rows={2}
              onChange={e => setForm(p => ({...p, description:e.target.value}))}
              style={{ ...inp, height:'auto', padding:'10px 12px', resize:'none' }}/>
          </div>
          <div style={{ display:'flex', gap:'var(--space-3)', marginTop:'var(--space-4)' }}>
            <button onClick={submit} disabled={saving || !form.title.trim() || !form.event_date}
              style={{ flex:1, height:42, background:sc, color:'#fff', border:'none', borderRadius:8,
                fontWeight:700, fontSize:'0.85rem', cursor:'pointer', opacity:saving?0.6:1 }}>
              {saving ? 'Saving…' : 'Save Event'}
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
          {(['upcoming','past'] as Tab[]).map(t => (
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
            <PlusIcon size={14} color="#fff"/> Add
          </button>
        )}
      </div>

      {loading
        ? <div className={styles.loading}><span/><span/><span/></div>
        : events.length === 0
          ? <div className={styles.empty}><CalendarIcon size={40} color="var(--text-faint)" strokeWidth={1}/><p>No {tab} events</p></div>
          : <div className={styles.list}>
              {events.map((ev:any) => {
                const color = TYPE_COLORS[ev.event_type] ?? '#6B7280'
                return (
                  <div key={ev.id} className={styles.card}>
                    <div className={styles.cardIcon} style={{ background:color+'20' }}>
                      <CalendarIcon size={16} color={color}/>
                    </div>
                    <div className={styles.cardBody}>
                      <p className={styles.cardTitle}>{ev.title}</p>
                      <p className={styles.cardMeta}>
                        <span style={{ textTransform:'capitalize' }}>{ev.event_type}</span>
                        {ev.audience!=='all' ? ` · For ${ev.audience}` : ''}
                        {ev.description ? ` · ${ev.description.slice(0,50)}` : ''}
                      </p>
                    </div>
                    <div style={{ textAlign:'right', flexShrink:0 }}>
                      <p style={{ fontSize:'0.75rem', fontWeight:700, color:'var(--text-primary)', margin:0 }}>{fmtDate(ev.event_date)}</p>
                      {ev.event_time && <p style={{ fontSize:'0.68rem', color:'var(--text-muted)', margin:0 }}>{ev.event_time.slice(0,5)}</p>}
                    </div>
                  </div>
                )
              })}
            </div>
      }
      <div className={styles.spacer}/>
    </RolePageWrapper>
  )
}
