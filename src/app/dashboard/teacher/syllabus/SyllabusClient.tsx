'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { BookOpenIcon, PlusIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'

interface Props { profile: any; school: any; userId: string }

export default function SyllabusClient({ profile, school, userId }: Props) {
  const [topics,   setTopics]   = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [term,     setTerm]     = useState('1st Term')
  const [form,     setForm]     = useState({ title:'', subject:'', description:'', week_number:1, class_level:'' })
  const supabase = createClient()
  const sc       = school?.primary_color ?? '#7C3AED'

  useEffect(() => { load() }, [term])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('syllabus')
      .select('id, title, subject, description, week_number, class_level, is_covered, covered_at')
      .eq('school_id', school?.id)
      .eq('teacher_id', userId)
      .eq('term', term)
      .order('subject')
      .order('week_number')
      .limit(80)
    if (data) setTopics(data)
    setLoading(false)
  }

  async function create() {
    if (!form.title || !form.subject) return
    setSaving(true)
    await supabase.from('syllabus').insert({
      ...form, school_id: school?.id, teacher_id: userId, term, is_covered: false,
    })
    setForm({ title:'', subject:'', description:'', week_number:1, class_level:'' })
    setShowForm(false)
    load()
    setSaving(false)
  }

  async function toggleCovered(id: string, current: boolean) {
    const covered_at = !current ? new Date().toISOString() : null
    await supabase.from('syllabus').update({ is_covered: !current, covered_at }).eq('id', id)
    setTopics(prev => prev.map(t => t.id === id ? { ...t, is_covered: !current, covered_at } : t))
  }

  async function deleteTopic(id: string) {
    await supabase.from('syllabus').delete().eq('id', id)
    setTopics(prev => prev.filter(t => t.id !== id))
  }

  const covered = topics.filter(t => t.is_covered).length
  const pct     = topics.length > 0 ? Math.round((covered / topics.length) * 100) : 0

  // group by subject
  const grouped = topics.reduce((acc, t) => {
    if (!acc[t.subject]) acc[t.subject] = []
    acc[t.subject].push(t)
    return acc
  }, {} as Record<string, any[]>)

  return (
    <RolePageWrapper userId={userId} role="teacher" profile={profile} school={school} title="Syllabus">

      <div className={styles.tabs} style={{ marginBottom:'var(--space-4)' }}>
        {['1st Term','2nd Term','3rd Term'].map(t => (
          <button key={t} onClick={() => setTerm(t)}
            className={`${styles.tab} ${term===t ? styles.tabActive : ''}`}
            style={term===t ? { background:sc, color:'#fff', borderColor:sc } : {}}>
            {t}
          </button>
        ))}
        <button onClick={() => setShowForm(!showForm)}
          style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:5, padding:'7px 14px', background:sc, color:'#fff', border:'none', borderRadius:999, fontWeight:700, fontSize:'0.8rem', cursor:'pointer' }}>
          <PlusIcon size={13} color="white"/> Add Topic
        </button>
      </div>

      {topics.length > 0 && (
        <div className={styles.progressCard} style={{ marginBottom:'var(--space-5)' }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
            <span style={{ fontSize:'0.78rem', fontWeight:700, color:'var(--text-primary)' }}>Coverage Progress</span>
            <span style={{ fontSize:'0.78rem', fontWeight:800, color:sc }}>{pct}%</span>
          </div>
          <div className={styles.progressTrack}>
            <div className={styles.progressFill} style={{ width:`${pct}%`, background:sc }}/>
          </div>
          <p style={{ fontSize:'0.72rem', color:'var(--text-muted)', marginTop:6 }}>{covered} of {topics.length} topics covered</p>
        </div>
      )}

      {showForm && (
        <div style={{ background:'var(--glass-bg)', border:'1px solid var(--glass-border)', borderRadius:'var(--radius-xl)', padding:'var(--space-5)', marginBottom:'var(--space-5)' }}>
          <p style={{ fontWeight:700, color:'var(--text-primary)', marginBottom:'var(--space-4)', fontSize:'0.9rem' }}>New Topic — {term}</p>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--space-3)' }}>
            {[
              { key:'title',       label:'Topic Title *', placeholder:'e.g. Quadratic Equations' },
              { key:'subject',     label:'Subject *',     placeholder:'e.g. Mathematics'         },
              { key:'class_level', label:'Class Level',   placeholder:'e.g. JSS 2'               },
              { key:'week_number', label:'Week No.',      type:'number', placeholder:'1'          },
            ].map(f => (
              <div key={f.key} style={{ display:'flex', flexDirection:'column', gap:4 }}>
                <label style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--text-secondary)' }}>{f.label}</label>
                <input type={f.type??'text'} value={(form as any)[f.key]}
                  onChange={e => setForm(p => ({ ...p, [f.key]: f.type==='number' ? +e.target.value : e.target.value }))}
                  placeholder={f.placeholder??''}
                  style={{ height:40, padding:'0 12px', background:'var(--input-bg)', border:'1px solid var(--input-border)', borderRadius:8, color:'var(--text-primary)', fontSize:'0.85rem', outline:'none' }}/>
              </div>
            ))}
            <div style={{ gridColumn:'1/-1', display:'flex', flexDirection:'column', gap:4 }}>
              <label style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--text-secondary)' }}>Notes (optional)</label>
              <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Topic objectives or notes..." rows={2}
                style={{ padding:'8px 12px', background:'var(--input-bg)', border:'1px solid var(--input-border)', borderRadius:8, color:'var(--text-primary)', fontSize:'0.85rem', outline:'none', resize:'none' }}/>
            </div>
          </div>
          <div style={{ display:'flex', gap:'var(--space-2)', marginTop:'var(--space-4)' }}>
            <button onClick={create} disabled={saving || !form.title || !form.subject}
              style={{ flex:1, height:40, background:sc, color:'#fff', border:'none', borderRadius:8, fontWeight:700, fontSize:'0.85rem', cursor:'pointer', opacity:saving?0.6:1 }}>
              {saving ? 'Adding...' : 'Add Topic'}
            </button>
            <button onClick={() => setShowForm(false)}
              style={{ flex:1, height:40, background:'var(--glass-bg)', border:'1px solid var(--glass-border)', borderRadius:8, color:'var(--text-muted)', fontWeight:600, fontSize:'0.85rem', cursor:'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? <div className={styles.loading}><span/><span/><span/></div>
        : topics.length === 0
          ? <div className={styles.empty}><BookOpenIcon size={40} color="var(--text-faint)" strokeWidth={1}/><p>No topics for {term}</p></div>
          : Object.entries(grouped).map(([subject, items]) => (
            <div key={subject} style={{ marginBottom:'var(--space-5)' }}>
              <p style={{ fontSize:'0.78rem', fontWeight:800, color:sc, marginBottom:'var(--space-3)', textTransform:'uppercase', letterSpacing:'0.05em' }}>{subject}</p>
              <div className={styles.topicList}>
                {items.map(t => (
                  <div key={t.id} className={`${styles.topicCard} ${t.is_covered ? styles.topicDone : ''}`}>
                    <button onClick={() => toggleCovered(t.id, t.is_covered)}
                      style={{ width:22, height:22, borderRadius:'50%', border:`2px solid ${t.is_covered ? '#10B981' : 'var(--glass-border)'}`, background:t.is_covered ? '#10B981' : 'transparent', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, cursor:'pointer' }}>
                      {t.is_covered && <span style={{ fontSize:12, fontWeight:800 }}>✓</span>}
                    </button>
                    <div style={{ flex:1 }}>
                      <p className={styles.topicTitle} style={{ textDecoration:t.is_covered?'line-through':'none', opacity:t.is_covered?0.6:1 }}>{t.title}</p>
                      {t.description && <p className={styles.topicNotes}>{t.description}</p>}
                      <p className={styles.topicWeek}>Wk {t.week_number}{t.class_level ? ` · ${t.class_level}` : ''}</p>
                    </div>
                    <button onClick={() => deleteTopic(t.id)}
                      style={{ fontSize:'0.68rem', color:'#EF4444', background:'none', border:'none', cursor:'pointer', fontWeight:700, flexShrink:0 }}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          ))
      }
      <div className={styles.spacer}/>
    </RolePageWrapper>
  )
}
