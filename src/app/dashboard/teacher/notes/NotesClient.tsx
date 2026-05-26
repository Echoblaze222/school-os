'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { BookIcon, PlusIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'

interface Props { profile: any; school: any; userId: string }

export default function NotesClient({ profile, school, userId }: Props) {
  const [rows,     setRows]     = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [saving,   setSaving]   = useState(false)
  const [form,     setForm]     = useState({ title: '', subject: '', content: '', visibility: 'class' })
  const supabase = createClient()
  const sc       = school?.primary_color ?? '#7C3AED'

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('notes')
      .select('id, title, subject, content, visibility, file_url, created_at')
      .eq('school_id', school?.id)
      .eq('author_id', userId)
      .order('created_at', { ascending: false })
      .limit(40)
    if (data) setRows(data)
    setLoading(false)
  }

  async function create() {
    if (!form.title || !form.content) return
    setSaving(true)
    await supabase.from('notes').insert({
      ...form, type: 'note', school_id: school?.id, author_id: userId,
    })
    setForm({ title: '', subject: '', content: '', visibility: 'class' })
    setShowForm(false)
    load()
    setSaving(false)
  }

  async function deleteNote(id: string) {
    await supabase.from('notes').delete().eq('id', id).eq('author_id', userId)
    setRows(prev => prev.filter(r => r.id !== id))
  }

  const VIS_COLOR: Record<string, string> = { private: '#6B7280', class: sc, school: '#10B981' }

  return (
    <RolePageWrapper userId={userId} role="teacher" profile={profile} school={school} title="Study Notes">

      <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:'var(--space-4)' }}>
        <button onClick={() => setShowForm(!showForm)}
          style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 14px', background:sc, color:'#fff', border:'none', borderRadius:999, fontWeight:700, fontSize:'0.8rem', cursor:'pointer' }}>
          <PlusIcon size={13} color="white"/> New Note
        </button>
      </div>

      {showForm && (
        <div style={{ background:'var(--glass-bg)', border:'1px solid var(--glass-border)', borderRadius:'var(--radius-xl)', padding:'var(--space-5)', marginBottom:'var(--space-5)' }}>
          <p style={{ fontWeight:700, color:'var(--text-primary)', marginBottom:'var(--space-4)', fontSize:'0.9rem' }}>New Study Note</p>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--space-3)' }}>
            {[
              { key:'title',   label:'Title *',  placeholder:'e.g. Algebra Formulas' },
              { key:'subject', label:'Subject',  placeholder:'e.g. Mathematics'      },
            ].map(f => (
              <div key={f.key} style={{ display:'flex', flexDirection:'column', gap:4 }}>
                <label style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--text-secondary)' }}>{f.label}</label>
                <input value={(form as any)[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  style={{ height:40, padding:'0 12px', background:'var(--input-bg)', border:'1px solid var(--input-border)', borderRadius:8, color:'var(--text-primary)', fontSize:'0.85rem', outline:'none' }}/>
              </div>
            ))}
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              <label style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--text-secondary)' }}>Visible To</label>
              <select value={form.visibility} onChange={e => setForm(p => ({ ...p, visibility: e.target.value }))}
                style={{ height:40, padding:'0 12px', background:'var(--input-bg)', border:'1px solid var(--input-border)', borderRadius:8, color:'var(--text-primary)', fontSize:'0.85rem', outline:'none' }}>
                <option value="private">Only Me</option>
                <option value="class">My Class</option>
                <option value="school">Whole School</option>
              </select>
            </div>
            <div style={{ gridColumn:'1/-1', display:'flex', flexDirection:'column', gap:4 }}>
              <label style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--text-secondary)' }}>Content *</label>
              <textarea value={form.content} onChange={e => setForm(p => ({ ...p, content: e.target.value }))}
                placeholder="Write the note content here..." rows={5}
                style={{ padding:'10px 12px', background:'var(--input-bg)', border:'1px solid var(--input-border)', borderRadius:8, color:'var(--text-primary)', fontSize:'0.85rem', outline:'none', resize:'vertical' }}/>
            </div>
          </div>
          <div style={{ display:'flex', gap:'var(--space-2)', marginTop:'var(--space-4)' }}>
            <button onClick={create} disabled={saving || !form.title || !form.content}
              style={{ flex:1, height:40, background:sc, color:'#fff', border:'none', borderRadius:8, fontWeight:700, fontSize:'0.85rem', cursor:'pointer', opacity:saving?0.6:1 }}>
              {saving ? 'Saving...' : 'Save Note'}
            </button>
            <button onClick={() => setShowForm(false)}
              style={{ flex:1, height:40, background:'var(--glass-bg)', border:'1px solid var(--glass-border)', borderRadius:8, color:'var(--text-muted)', fontWeight:600, fontSize:'0.85rem', cursor:'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? <div className={styles.loading}><span/><span/><span/></div>
        : rows.length === 0
          ? <div className={styles.empty}><BookIcon size={40} color="var(--text-faint)" strokeWidth={1}/><p>No notes yet</p></div>
          : <div className={styles.list}>
            {rows.map(item => (
              <div key={item.id} className={styles.card} style={{ flexDirection:'column', gap:'var(--space-2)', cursor:'default' }}>
                <div style={{ display:'flex', alignItems:'flex-start', gap:'var(--space-4)', width:'100%', cursor:'pointer' }}
                  onClick={() => setExpanded(expanded === item.id ? null : item.id)}>
                  <div className={styles.cardIcon} style={{ background:sc+'20' }}>
                    <BookIcon size={16} color={sc}/>
                  </div>
                  <div className={styles.cardBody}>
                    <p className={styles.cardTitle}>{item.title}</p>
                    <p className={styles.cardText}>{item.subject}</p>
                    <p className={styles.cardMeta}>{new Date(item.created_at).toLocaleDateString('en-NG',{day:'numeric',month:'short',year:'numeric'})}</p>
                  </div>
                  <span style={{ padding:'2px 8px', borderRadius:999, fontSize:'0.65rem', fontWeight:700, background:(VIS_COLOR[item.visibility]??'#6B7280')+'20', color:VIS_COLOR[item.visibility]??'#6B7280', flexShrink:0 }}>
                    {item.visibility}
                  </span>
                </div>
                {expanded === item.id && (
                  <div style={{ paddingLeft:56, paddingRight:8 }}>
                    <p style={{ fontSize:'0.85rem', color:'var(--text-secondary)', lineHeight:1.6, whiteSpace:'pre-wrap', marginBottom:'var(--space-3)' }}>{item.content}</p>
                    {item.file_url && (
                      <a href={item.file_url} target="_blank" rel="noreferrer"
                        style={{ display:'inline-block', marginBottom:'var(--space-2)', padding:'5px 12px', background:sc+'20', color:sc, borderRadius:999, fontSize:'0.75rem', fontWeight:700, textDecoration:'none' }}>
                        📎 View Attachment
                      </a>
                    )}
                    <button onClick={() => deleteNote(item.id)}
                      style={{ padding:'5px 12px', background:'transparent', border:'1px solid #EF444440', borderRadius:999, fontWeight:700, fontSize:'0.72rem', color:'#EF4444', cursor:'pointer' }}>
                      Delete Note
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
