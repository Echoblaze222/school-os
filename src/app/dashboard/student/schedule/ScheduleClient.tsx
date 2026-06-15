'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import DashboardHeader from '@/components/DashboardHeader'
import StudentNav from '@/components/StudentNav'
import { CalendarIcon, AiIcon, PlusIcon, TrashIcon } from '@/components/Icons'
import styles from './page.module.css'

interface Props { profile: any; school: any; userId: string }

const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

export default function ScheduleClient({ profile, school, userId }: Props) {
  const [plan,      setPlan]      = useState<any[]>([])
  const [loading,   setLoading]   = useState(true)
  const [generating,setGenerating]= useState(false)
  const [showAdd,   setShowAdd]   = useState(false)
  const [newItem,   setNewItem]   = useState({ day:'Mon', subject:'', time:'08:00', duration:60 })
  const supabase    = createClient()
  const schoolColor = school?.primary_color ?? '#7C3AED'

  useEffect(() => { loadPlan() }, [])

  async function loadPlan() {
    // BUG 10 FIX: add school_id filter — RLS policy requires it and without it
    // inserted rows (which include school_id) won't be returned on read
    const { data } = await supabase
      .from('study_schedules')
      .select('id, day, subject, time, duration_mins, color')
      .eq('student_id', userId)
      .eq('school_id', school?.id)
      .order('time', { ascending: true })
    if (data) setPlan(data)
    setLoading(false)
  }

  async function addSession() {
    if (!newItem.subject.trim()) return
    const COLORS = ['#7C3AED','#3B82F6','#10B981','#F59E0B','#EF4444','#EC4899']
    const color = COLORS[Math.floor(Math.random() * COLORS.length)]
    const { data } = await supabase.from('study_schedules').insert({
      student_id: userId, school_id: school?.id,
      ...newItem, color,
    }).select().single()
    if (data) setPlan(prev => [...prev, data])
    setShowAdd(false)
    setNewItem({ day:'Mon', subject:'', time:'08:00', duration:60 })
  }

  async function deleteSession(id: string) {
    await supabase.from('study_schedules').delete().eq('id', id)
    setPlan(prev => prev.filter(p => p.id !== id))
  }

  async function generateAIPlan() {
    setGenerating(true)
    try {
      const res = await fetch('/api/study-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, schoolId: school?.id, classLevel: profile?.class_level }),
      })
      const data = await res.json()
      if (data.plan) {
        // Insert generated plan
        const inserts = data.plan.map((p: any) => ({
          student_id: userId, school_id: school?.id, ...p,
        }))
        const { data: inserted } = await supabase.from('study_schedules').insert(inserts).select()
        if (inserted) setPlan(prev => [...prev, ...inserted])
      }
    } catch {}
    setGenerating(false)
  }

  return (
    <div className={styles.page}>
      <StudentNav userId={userId} profile={profile} school={school} schoolColor={schoolColor} />
      <div className={styles.content}>
        <DashboardHeader userId={userId} role="student" profile={profile} school={school}
          schoolColor={schoolColor} title="Study Plan" showBack />
        <main className={styles.main}>
          {/* Actions */}
          <div style={{ display:'flex', gap:'var(--space-2)', marginBottom:'var(--space-5)', flexWrap:'wrap' }}>
            <button onClick={() => setShowAdd(!showAdd)}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'9px 18px', background:`linear-gradient(135deg,${schoolColor},${schoolColor}cc)`, color:'#fff', border:'none', borderRadius:999, fontWeight:700, fontSize:'0.82rem', cursor:'pointer' }}>
              <PlusIcon size={14} color="white"/> Add Session
            </button>
            <button onClick={generateAIPlan} disabled={generating}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'9px 18px', background:'rgba(236,72,153,0.12)', border:'1px solid rgba(236,72,153,0.25)', color:'#EC4899', borderRadius:999, fontWeight:700, fontSize:'0.82rem', cursor:'pointer', opacity:generating?0.6:1 }}>
              <AiIcon size={14} color="#EC4899"/> {generating ? 'Generating...' : 'AI Generate Plan'}
            </button>
          </div>

          {/* Add form */}
          {showAdd && (
            <div className={styles.addCard}>
              <div className={styles.addGrid}>
                <div>
                  <label className={styles.addLabel}>Subject</label>
                  <input value={newItem.subject} onChange={e => setNewItem(p => ({...p, subject:e.target.value}))}
                    className={styles.addInput} placeholder="e.g. Mathematics"/>
                </div>
                <div>
                  <label className={styles.addLabel}>Day</label>
                  <select value={newItem.day} onChange={e => setNewItem(p => ({...p, day:e.target.value}))} className={styles.addInput}>
                    {DAYS.map(d => <option key={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className={styles.addLabel}>Time</label>
                  <input type="time" value={newItem.time} onChange={e => setNewItem(p => ({...p, time:e.target.value}))} className={styles.addInput}/>
                </div>
                <div>
                  <label className={styles.addLabel}>Duration (mins)</label>
                  <input type="number" min={15} max={180} value={newItem.duration}
                    onChange={e => setNewItem(p => ({...p, duration:+e.target.value}))} className={styles.addInput}/>
                </div>
              </div>
              <div style={{ display:'flex', gap:'var(--space-2)', marginTop:'var(--space-3)' }}>
                <button onClick={addSession}
                  style={{ flex:1, height:38, background:schoolColor, color:'#fff', border:'none', borderRadius:8, fontWeight:700, fontSize:'0.82rem', cursor:'pointer' }}>
                  Add
                </button>
                <button onClick={() => setShowAdd(false)}
                  style={{ flex:1, height:38, background:'var(--glass-bg)', border:'1px solid var(--glass-border)', color:'var(--text-muted)', borderRadius:8, fontWeight:700, fontSize:'0.82rem', cursor:'pointer' }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {loading ? <div className={styles.loading}><span/><span/><span/></div>
          : plan.length === 0
            ? <div className={styles.empty}>
                <CalendarIcon size={40} color="var(--text-faint)" strokeWidth={1}/>
                <p>No study plan yet. Add sessions or let AI build one for you.</p>
              </div>
            : <>
                {DAYS.map(d => {
                  const dayItems = plan.filter(p => p.day === d)
                  if (dayItems.length === 0) return null
                  return (
                    <div key={d} style={{ marginBottom:'var(--space-5)' }}>
                      <p className={styles.sectionLabel}>{d === 'Mon' ? 'Monday' : d === 'Tue' ? 'Tuesday' : d === 'Wed' ? 'Wednesday' : d === 'Thu' ? 'Thursday' : d === 'Fri' ? 'Friday' : d === 'Sat' ? 'Saturday' : 'Sunday'}</p>
                      <div className={styles.list}>
                        {dayItems.map(item => (
                          <div key={item.id} className={styles.card}>
                            <div className={styles.cardIcon} style={{ background: item.color + '20' }}>
                              <CalendarIcon size={16} color={item.color}/>
                            </div>
                            <div className={styles.cardBody}>
                              <p className={styles.cardTitle}>{item.subject}</p>
                              <p className={styles.cardMeta}>{item.time} · {item.duration_mins} mins</p>
                            </div>
                            <button onClick={() => deleteSession(item.id)}
                              style={{ width:30, height:30, display:'flex', alignItems:'center', justifyContent:'center', background:'var(--danger-subtle)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:'var(--radius-md)', cursor:'pointer', flexShrink:0 }}>
                              <TrashIcon size={13} color="var(--danger)"/>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </>
          }
          <div className={styles.spacer}/>
        </main>
      </div>
    </div>
  )
}
