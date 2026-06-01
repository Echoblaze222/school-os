'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { ClipboardIcon, PlusIcon, CheckCircleIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'

interface Props { profile: any; school: any; userId: string }

export default function AssignmentsClient({ profile, school, userId }: Props) {
  const [items,    setItems]    = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [tab,      setTab]      = useState<'active'|'past'>('active')
  const [form,     setForm]     = useState({
    title:'', subject:'', description:'', due_date:'', class_level:'',
  })
  const supabase    = createClient()
  const schoolColor = school?.primary_color ?? '#7C3AED'

  useEffect(() => { load() }, [tab])

  async function load() {
    setLoading(true)
    const now = new Date().toISOString()
    const { data } = await supabase
      .from('assignments')
      .select('id, title, subject, due_date, class_level, submission_count, total_students, created_at')
      .eq('teacher_id', userId)
      .eq('school_id', school?.id)
      .order('due_date', { ascending: tab === 'active' })
    if (data) {
      setItems(tab === 'active'
        ? data.filter(a => new Date(a.due_date) >= new Date())
        : data.filter(a => new Date(a.due_date) < new Date()))
    }
    setLoading(false)
  }

  async function createAssignment() {
    if (!form.title || !form.due_date) return
    setSaving(true)
    await supabase.from('assignments').insert({
      ...form,
      teacher_id: userId,
      school_id:  school?.id,
      status:     'active',
    })
    setForm({ title:'', subject:'', description:'', due_date:'', class_level:'' })
    setShowForm(false)
    load()
    setSaving(false)
  }

  return (
    <RolePageWrapper userId={userId} role="teacher" profile={profile} school={school} title="Assignments">
      <div className={styles.tabs} style={{ marginBottom:'var(--space-4)' }}>
        {(['active','past'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`${styles.tab} ${tab===t ? styles.tabActive : ''}`}
            style={tab===t ? { background:schoolColor, color:'#fff', borderColor:schoolColor } : {}}>
            {t === 'active' ? 'Active' : 'Past'}
          </button>
        ))}
        <button onClick={() => setShowForm(!showForm)}
          style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:5, padding:'7px 14px', background:schoolColor, color:'#fff', border:'none', borderRadius:999, fontWeight:700, fontSize:'0.8rem', cursor:'pointer' }}>
          <PlusIcon size={13} color="white"/> New
        </button>
      </div>

      {showForm && (
        <div style={{ background:'var(--glass-bg)', border:'1px solid var(--glass-border)', borderRadius:'var(--radius-xl)', padding:'var(--space-5)', marginBottom:'var(--space-5)' }}>
          <p style={{ fontWeight:700, color:'var(--text-primary)', marginBottom:'var(--space-4)', fontSize:'0.9rem' }}>New Assignment</p>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--space-3)' }}>
            {[
              { key:'title',       label:'Title *',      placeholder:'e.g. Chapter 3 Exercise' },
              { key:'subject',     label:'Subject',       placeholder:'e.g. Mathematics'       },
              { key:'class_level', label:'Class Level',   placeholder:'e.g. JSS2'              },
              { key:'due_date',    label:'Due Date *',    type:'date'                           },
            ].map(f => (
              <div key={f.key} style={{ display:'flex', flexDirection:'column', gap:4 }}>
                <label style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--text-secondary)' }}>{f.label}</label>
                <input type={(f as any).type ?? 'text'}
                  value={(form as any)[f.key]}
                  onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={(f as any).placeholder ?? ''}
                  style={{ height:40, padding:'0 12px', background:'var(--input-bg)', border:'1px solid var(--input-border)', borderRadius:8, color:'var(--text-primary)', fontSize:'0.85rem', outline:'none' }}/>
              </div>
            ))}
            <div style={{ gridColumn:'1/-1', display:'flex', flexDirection:'column', gap:4 }}>
              <label style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--text-secondary)' }}>Description</label>
              <textarea value={form.description} onChange={e => setForm(prev => ({...prev, description:e.target.value}))}
                placeholder="Assignment details..."
                style={{ height:70, padding:'8px 12px', background:'var(--input-bg)', border:'1px solid var(--input-border)', borderRadius:8, color:'var(--text-primary)', fontSize:'0.85rem', outline:'none', resize:'vertical' }}/>
            </div>
          </div>
          <div style={{ display:'flex', gap:'var(--space-2)', marginTop:'var(--space-4)' }}>
            <button onClick={createAssignment} disabled={saving || !form.title || !form.due_date}
              style={{ flex:1, height:40, background:schoolColor, color:'#fff', border:'none', borderRadius:8, fontWeight:700, fontSize:'0.85rem', cursor:'pointer', opacity:saving?0.6:1 }}>
              {saving ? 'Creating...' : 'Create Assignment'}
            </button>
            <button onClick={() => setShowForm(false)}
              style={{ flex:1, height:40, background:'var(--glass-bg)', border:'1px solid var(--glass-border)', borderRadius:8, color:'var(--text-muted)', fontWeight:600, fontSize:'0.85rem', cursor:'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? <div className={styles.loading}><span/><span/><span/></div>
      : items.length === 0
        ? <div className={styles.empty}><ClipboardIcon size={40} color="var(--text-faint)" strokeWidth={1}/><p>No {tab} assignments</p></div>
        : <div className={styles.list}>
            {items.map(item => {
              const sub = item.submission_count ?? 0
              const tot = item.total_students ?? 1
              const pct = Math.round((sub/tot)*100)
              return (
                <div key={item.id} className={styles.card}>
                  <div className={styles.cardIcon} style={{ background: schoolColor+'20' }}>
                    <ClipboardIcon size={16} color={schoolColor}/>
                  </div>
                  <div className={styles.cardBody}>
                    <p className={styles.cardTitle}>{item.title}</p>
                    <p className={styles.cardText}>{item.subject}{item.class_level ? ` · ${item.class_level}` : ''}</p>
                    <div style={{ display:'flex', alignItems:'center', gap:'var(--space-3)', marginTop:4 }}>
                      <div style={{ flex:1, height:4, background:'var(--glass-border)', borderRadius:999, overflow:'hidden' }}>
                        <div style={{ width:`${pct}%`, height:'100%', background:'#10B981', borderRadius:999 }}/>
                      </div>
                      <span style={{ fontSize:'0.68rem', fontWeight:700, color:'#10B981', flexShrink:0 }}>
                        {sub}/{tot} submitted
                      </span>
                    </div>
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    <p style={{ fontSize:'0.68rem', color:'var(--text-muted)', margin:0 }}>Due</p>
                    <p style={{ fontSize:'0.78rem', fontWeight:700, color: new Date(item.due_date)<new Date()?'#EF4444':'var(--text-primary)', margin:0 }}>
                      {new Date(item.due_date).toLocaleDateString('en-NG',{day:'numeric',month:'short'})}
                    </p>
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
