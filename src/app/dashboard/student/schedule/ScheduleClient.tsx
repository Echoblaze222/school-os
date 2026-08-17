'use client'
// src/app/dashboard/student/schedule/ScheduleClient.tsx
//
// DEPLOYED FIX — targets `study_plans` (the real table for this feature).
//
// study_plans columns confirmed from schema:
//   id, student_id, school_id, day (text), subject (text),
//   time (text), duration_mins (integer), color (text), created_at
//
// The unique constraint "idx_study_plans_student" exists on the live DB
// but is NOT in the exported schema — it was added manually. The fix
// for the duplicate-key error is:
//   1. Drop that unique constraint (see SQL below — it shouldn't be there;
//      students can have multiple sessions per day).
//   2. This file correctly does .insert() (not .upsert()), so no INSERT
//      conflict will occur once the constraint is dropped.
//
// SQL to run in Supabase Dashboard → SQL Editor:
//   DROP INDEX IF EXISTS idx_study_plans_student;
//
// No other DB changes needed — study_plans has RLS disabled or open
// INSERT for authenticated users already, since the old code was
// successfully creating rows (just hitting the unique constraint).
//
// REDESIGN PASS (Lane 3 — Student): RolePageWrapper chrome, emoji → Icons,
// glass-card/motion treatment, hardcoded status hex → design tokens.

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { CalendarIcon, PlusIcon, SparkleIcon, AlertIcon, XIcon } from '@/components/Icons'
import motion from '@/components/dashboard-motion.module.css'
import styles from './page.module.css'
import { SkeletonList } from '@/components/motion/Skeleton'

interface Props { profile: any; school: any; userId: string }

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

// Categorical per-session tag palette — unrelated to brand color, intentionally varied
const COLORS = ['#7C3AED', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#06B6D4', '#8B5CF6']

export default function ScheduleClient({ profile, school, userId }: Props) {
  const [plan,       setPlan]       = useState<any[]>([])
  const [loading,    setLoading]    = useState(true)
  const [showAdd,    setShowAdd]    = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [newItem,    setNewItem]    = useState({
    day: 'Monday', subject: '', time: '08:00', duration_mins: 60, color: COLORS[0],
  })
  const supabase    = createClient()
  const schoolColor = school?.primary_color ?? '#800020'

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('study_plans')
      .select('id, day, subject, time, duration_mins, color, created_at')
      .eq('student_id', userId)
      .eq('school_id', school?.id)
      .order('created_at', { ascending: true })
    if (err) { console.error('[schedule] load error:', err.message); setError(err.message) }
    if (data) setPlan(data)
    setLoading(false)
  }

  async function addSession() {
    if (!newItem.subject.trim()) { setError('Enter a subject'); return }
    setSaving(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('study_plans')
      .insert({
        student_id:    userId,
        school_id:     school?.id,
        day:           newItem.day,
        subject:       newItem.subject.trim(),
        time:          newItem.time,
        duration_mins: newItem.duration_mins,
        color:         newItem.color,
      })
      .select()
      .single()
    if (err) {
      console.error('[schedule] insert error:', err.message)
      // Surface a cleaner message for the duplicate-key case
      if (err.message.includes('duplicate key') || err.message.includes('unique constraint')) {
        setError('A session with those details already exists. Change the day or time and try again.')
      } else {
        setError(err.message)
      }
      setSaving(false)
      return
    }
    if (data) setPlan(prev => [...prev, data])
    setShowAdd(false)
    setNewItem(p => ({ ...p, subject: '', time: '08:00', duration_mins: 60 }))
    setSaving(false)
  }

  async function deleteSession(id: string) {
    setError(null)
    const { error: err } = await supabase.from('study_plans').delete().eq('id', id)
    if (err) { console.error('[schedule] delete error:', err.message); setError(err.message); return }
    setPlan(prev => prev.filter(p => p.id !== id))
  }

  async function generateAIPlan() {
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch('/api/study-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        setError(`AI plan unavailable right now (${res.status}). Add sessions manually.`)
        setGenerating(false)
        return
      }
      const result = await res.json()
      if (result?.plan?.length) {
        const inserts = result.plan.map((p: any, i: number) => ({
          student_id:    userId,
          school_id:     school?.id,
          day:           p.day,
          subject:       p.subject,
          time:          p.time,
          duration_mins: p.duration_mins ?? 60,
          color:         COLORS[i % COLORS.length],
        }))
        const { data: inserted, error: insErr } = await supabase
          .from('study_plans')
          .insert(inserts)
          .select()
        if (insErr) { setError(insErr.message); setGenerating(false); return }
        if (inserted) setPlan(prev => [...prev, ...inserted])
      } else {
        setError('AI couldn\'t generate a plan. Try adding sessions manually.')
      }
    } catch (e: any) {
      console.error('[schedule] AI generate error:', e)
      setError('AI plan generation failed. Add sessions manually instead.')
    }
    setGenerating(false)
  }

  return (
    <RolePageWrapper userId={userId} role="student" profile={profile} school={school} title="Study Plan">
        <>

          {error && (
            <div className={`glass-card ${motion.riseIn}`} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 14px', background: 'var(--danger-subtle)',
              borderColor: 'rgba(239,68,68,0.3)',
              marginBottom: 'var(--space-4)',
            }}>
              <AlertIcon size={16} color="var(--danger)" />
              <span style={{ fontSize: '0.8rem', color: 'var(--danger)', flex: 1 }}>{error}</span>
              <button onClick={() => setError(null)} className={motion.pressable}
                style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', display: 'flex', padding: 4 }}
              ><XIcon size={14} /></button>
            </div>
          )}

          {/* Action buttons */}
          <div className={motion.riseIn} style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-5)', flexWrap: 'wrap' }}>
            <button
              onClick={() => setShowAdd(!showAdd)} className={motion.pressable}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '9px 18px', background: schoolColor, color: '#fff',
                border: 'none', borderRadius: 999, fontWeight: 700,
                fontSize: '0.82rem', cursor: 'pointer',
              }}
            >
              <PlusIcon size={14} color="white" /> Add Session
            </button>
            <button
              onClick={generateAIPlan}
              disabled={generating} className={motion.pressable}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '9px 18px', background: 'rgba(236,72,153,0.12)',
                border: '1px solid rgba(236,72,153,0.25)', color: '#EC4899',
                borderRadius: 999, fontWeight: 700, fontSize: '0.82rem',
                cursor: 'pointer', opacity: generating ? 0.6 : 1,
              }}
            >
              <SparkleIcon size={14} color="#EC4899" /> {generating ? 'Generating...' : 'AI Generate'}
            </button>
          </div>

          {/* Add session form */}
          {showAdd && (
            <div className={`glass-card ${motion.riseIn}`} style={{
              flexDirection: 'column', alignItems: 'stretch',
              padding: 'var(--space-5)', marginBottom: 'var(--space-5)',
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>

                {/* Subject */}
                <div style={{ gridColumn: '1/-1', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Subject *</label>
                  <input
                    value={newItem.subject}
                    onChange={e => setNewItem(p => ({ ...p, subject: e.target.value }))}
                    placeholder="e.g. Mathematics"
                    className="input"
                  />
                </div>

                {/* Day */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Day</label>
                  <select
                    value={newItem.day}
                    onChange={e => setNewItem(p => ({ ...p, day: e.target.value }))}
                    className="input"
                  >
                    {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>

                {/* Time */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Time</label>
                  <input
                    type="time"
                    value={newItem.time}
                    onChange={e => setNewItem(p => ({ ...p, time: e.target.value }))}
                    className="input"
                  />
                </div>

                {/* Duration */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Duration (mins)</label>
                  <select
                    value={newItem.duration_mins}
                    onChange={e => setNewItem(p => ({ ...p, duration_mins: Number(e.target.value) }))}
                    className="input"
                  >
                    {[30, 45, 60, 90, 120].map(d => <option key={d} value={d}>{d} min</option>)}
                  </select>
                </div>

                {/* Color */}
                <div style={{ gridColumn: '1/-1', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Color</label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {COLORS.map(c => (
                      <button
                        key={c}
                        onClick={() => setNewItem(p => ({ ...p, color: c }))}
                        className={motion.pressable}
                        style={{
                          width: 28, height: 28, borderRadius: '50%', background: c,
                          border: newItem.color === c ? '3px solid var(--text-primary)' : '2px solid transparent',
                          cursor: 'pointer',
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
                <button
                  onClick={addSession}
                  disabled={saving || !newItem.subject.trim()}
                  className={`btn btn-primary ${motion.pressable}`}
                  style={{ flex: 1, opacity: saving ? 0.6 : 1 }}
                >
                  {saving ? 'Adding...' : 'Add'}
                </button>
                <button
                  onClick={() => setShowAdd(false)}
                  className={`btn btn-secondary ${motion.pressable}`}
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Plan list */}
          {loading
            ? <SkeletonList count={3} variant="row" />
            : plan.length === 0
              ? (
                <div className={`${styles.empty} ${motion.riseIn}`}>
                  <CalendarIcon size={40} color="var(--text-faint)" strokeWidth={1} />
                  <p>No study plan yet. Add sessions or let AI build one for you.</p>
                </div>
              )
              : (
                <>
                  {DAYS.map(d => {
                    const dayItems = plan
                      .filter(p => p.day === d)
                      .sort((a, b) => a.time.localeCompare(b.time))
                    if (dayItems.length === 0) return null
                    return (
                      <div key={d} className={motion.riseIn} style={{ marginBottom: 'var(--space-5)' }}>
                        <p className={styles.sectionLabel}>{d.toUpperCase()}</p>
                        <div className={styles.list}>
                          {dayItems.map((item, i) => (
                            <div key={item.id} className={`glass-card ${styles.card} ${motion.staggerItem}`} style={{ animationDelay: `${i * 30}ms` }}>
                              <div
                                className={styles.cardIcon}
                                style={{ background: (item.color ?? schoolColor) + '25' }}
                              >
                                <CalendarIcon size={16} color={item.color ?? schoolColor} />
                              </div>
                              <div className={styles.cardBody}>
                                <p className={styles.cardTitle}>{item.subject}</p>
                                <p className={styles.cardMeta}>{item.time} · {item.duration_mins} min</p>
                              </div>
                              <button
                                onClick={() => deleteSession(item.id)}
                                className={motion.pressable}
                                style={{
                                  width: 30, height: 30, display: 'flex',
                                  alignItems: 'center', justifyContent: 'center',
                                  background: 'var(--danger-subtle)', border: '1px solid rgba(239,68,68,0.3)',
                                  borderRadius: 8, cursor: 'pointer', flexShrink: 0,
                                  color: 'var(--danger)',
                                }}
                              >
                                <XIcon size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </>
              )
          }
          <div className={styles.spacer} />
        </>
    </RolePageWrapper>
  )
}
