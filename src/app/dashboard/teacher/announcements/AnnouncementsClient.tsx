'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { MegaphoneIcon, PlusIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'

interface Props { profile: any; school: any; userId: string }

export default function AnnouncementsClient({ profile, school, userId }: Props) {
  const [rows,     setRows]     = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [form,     setForm]     = useState({ title: '', body: '', audience: 'students' })
  const supabase = createClient()
  const sc       = school?.primary_color ?? '#7C3AED'

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('announcements')
      .select('id, title, body, audience, is_pinned, created_at, author:profiles(full_name)')
      .eq('school_id', school?.id)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(40)
    if (data) setRows(data)
    setLoading(false)
  }

  async function create() {
    if (!form.title || !form.body) return
    setSaving(true)
    await supabase.from('announcements').insert({
      ...form, school_id: school?.id, author_id: userId, is_pinned: false,
    })
    setForm({ title: '', body: '', audience: 'students' })
    setShowForm(false)
    load()
    setSaving(false)
  }

  async function togglePin(id: string, current: boolean) {
    await supabase.from('announcements').update({ is_pinned: !current }).eq('id', id)
    setRows(prev =>
      prev.map(r => r.id === id ? { ...r, is_pinned: !current } : r)
        .sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0))
    )
  }

  async function deleteRow(id: string) {
    await supabase.from('announcements').delete().eq('id', id).eq('author_id', userId)
    setRows(prev => prev.filter(r => r.id !== id))
  }

  const AUDIENCE_COLOR: Record<string, string> = {
    all: '#10B981', teachers: '#3B82F6', students: '#F59E0B', parents: '#8B5CF6', staff: '#EC4899',
  }

  return (
    <RolePageWrapper userId={userId} role="teacher" profile={profile} school={school} title="Announcements">

      <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:'var(--space-4)' }}>
        <button onClick={() => setShowForm(!showForm)}
          style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 14px', background:sc, color:'#fff', border:'none', borderRadius:999, fontWeight:700, fontSize:'0.8rem', cursor:'pointer' }}>
          <PlusIcon size={13} color="white"/> New Announcement
        </button>
      </div>

      {showForm && (
        <div style={{ background:'var(--glass-bg)', border:'1px solid var(--glass-border)', borderRadius:'var(--radius-xl)', padding:'var(--space-5)', marginBottom:'var(--space-5)' }}>
          <p style={{ fontWeight:700, color:'var(--text-primary)', marginBottom:'var(--space-4)', fontSize:'0.9rem' }}>New Announcement</p>
          <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-3)' }}>
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              <label style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--text-secondary)' }}>Title *</label>
              <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                placeholder="e.g. Mid-term exam schedule"
                style={{ height:40, padding:'0 12px', background:'var(--input-bg)', border:'1px solid var(--input-border)', borderRadius:8, color:'var(--text-primary)', fontSize:'0.85rem', outline:'none' }}/>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              <label style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--text-secondary)' }}>Audience</label>
              <select value={form.audience} onChange={e => setForm(p => ({ ...p, audience: e.target.value }))}
                style={{ height:40, padding:'0 12px', background:'var(--input-bg)', border:'1px solid var(--input-border)', borderRadius:8, color:'var(--text-primary)', fontSize:'0.85rem', outline:'none' }}>
                {['students','parents','all','teachers','staff'].map(a => (
                  <option key={a} value={a}>{a.charAt(0).toUpperCase()+a.slice(1)}</option>
                ))}
              </select>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              <label style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--text-secondary)' }}>Message *</label>
              <textarea value={form.body} onChange={e => setForm(p => ({ ...p, body: e.target.value }))}
                placeholder="Write your announcement here..." rows={4}
                style={{ padding:'10px 12px', background:'var(--input-bg)', border:'1px solid var(--input-border)', borderRadius:8, color:'var(--text-primary)', fontSize:'0.85rem', outline:'none', resize:'vertical' }}/>
            </div>
          </div>
          <div style={{ display:'flex', gap:'var(--space-2)', marginTop:'var(--space-4)' }}>
            <button onClick={create} disabled={saving || !form.title || !form.body}
              style={{ flex:1, height:40, background:sc, color:'#fff', border:'none', borderRadius:8, fontWeight:700, fontSize:'0.85rem', cursor:'pointer', opacity:saving?0.6:1 }}>
              {saving ? 'Posting...' : 'Post Announcement'}
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
          ? <div className={styles.empty}><MegaphoneIcon size={40} color="var(--text-faint)" strokeWidth={1}/><p>No announcements yet</p></div>
          : <div className={styles.list}>
            {rows.map(item => (
              <div key={item.id} className={styles.card}
                style={{ flexDirection:'column', gap:'var(--space-2)', cursor:'default', borderLeft: item.is_pinned ? `3px solid ${sc}` : undefined }}>
                <div style={{ display:'flex', alignItems:'flex-start', gap:'var(--space-4)', width:'100%' }}>
                  <div className={styles.cardIcon} style={{ background:sc+'20' }}>
                    <MegaphoneIcon size={16} color={sc}/>
                  </div>
                  <div className={styles.cardBody}>
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3, flexWrap:'wrap' }}>
                      {item.is_pinned && <span style={{ fontSize:'0.65rem', fontWeight:800, color:sc }}>📌 PINNED</span>}
                      <span style={{ padding:'2px 8px', borderRadius:999, fontSize:'0.65rem', fontWeight:700, background:(AUDIENCE_COLOR[item.audience]??'#6B7280')+'20', color:AUDIENCE_COLOR[item.audience]??'#6B7280' }}>
                        {item.audience}
                      </span>
                    </div>
                    <p className={styles.cardTitle}>{item.title}</p>
                    <p className={styles.cardText}>{item.body}</p>
                    <p className={styles.cardMeta}>
                      {(item.author as any)?.full_name ?? 'You'} · {new Date(item.created_at).toLocaleDateString('en-NG',{day:'numeric',month:'short',year:'numeric'})}
                    </p>
                  </div>
                </div>
                <div style={{ display:'flex', gap:'var(--space-2)', paddingLeft:56 }}>
                  <button onClick={() => togglePin(item.id, item.is_pinned)}
                    style={{ padding:'5px 12px', background:'var(--glass-bg)', border:'1px solid var(--glass-border)', borderRadius:999, fontWeight:700, fontSize:'0.72rem', color:'var(--text-muted)', cursor:'pointer' }}>
                    {item.is_pinned ? 'Unpin' : '📌 Pin'}
                  </button>
                  {item.author?.id === userId || !item.author ? (
                    <button onClick={() => deleteRow(item.id)}
                      style={{ padding:'5px 12px', background:'transparent', border:'1px solid #EF444440', borderRadius:999, fontWeight:700, fontSize:'0.72rem', color:'#EF4444', cursor:'pointer' }}>
                      Delete
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
      }
      <div className={styles.spacer}/>
    </RolePageWrapper>
  )
}
