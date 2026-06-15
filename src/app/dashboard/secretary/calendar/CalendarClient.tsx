'use client'
// src/app/dashboard/secretary/calendar/CalendarClient.tsx

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import styles from '../secretary.module.css'

const EVENT_TYPES = ['Academic', 'Holiday', 'Exam', 'Meeting', 'Sports', 'Cultural', 'Other']
const TYPE_COLORS: Record<string, string> = {
  Academic: '#3B82F6', Holiday: '#10B981', Exam: '#EF4444',
  Meeting: '#F59E0B', Sports: '#8B5CF6', Cultural: '#EC4899', Other: '#6B7280',
}

interface CalEvent { id: string; title: string; event_type: string; start_date: string; end_date: string | null; description: string | null; all_day: boolean }
interface Props { events: CalEvent[]; profile: any; school: any; userId: string }

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

export default function CalendarClient({ events: init, profile, school, userId }: Props) {
  const today     = new Date()
  const [events,  setEvents]  = useState(init)
  const [curYear, setCurYear] = useState(today.getFullYear())
  const [curMonth,setCurMonth]= useState(today.getMonth())
  const [modal,   setModal]   = useState(false)
  const [editItem,setEditItem]= useState<CalEvent | null>(null)
  const [delItem, setDelItem] = useState<CalEvent | null>(null)
  const [saving,  setSaving]  = useState(false)
  const [msg,     setMsg]     = useState('')
  const [form,    setForm]    = useState({ title: '', event_type: 'Academic', start_date: today.toISOString().slice(0,10), end_date: '', description: '', all_day: true })

  const supabase = createClient()
  const sc       = school?.primary_color ?? '#7C3AED'

  // Build calendar grid
  const firstDay  = new Date(curYear, curMonth, 1).getDay()
  const daysInMonth = new Date(curYear, curMonth + 1, 0).getDate()
  const cells: (number | null)[] = Array(firstDay).fill(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  function eventsOnDay(d: number) {
    const dateStr = `${curYear}-${String(curMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    return events.filter(e => e.start_date?.slice(0,10) === dateStr || (e.end_date && e.start_date?.slice(0,10) <= dateStr && e.end_date?.slice(0,10) >= dateStr))
  }

  function prevMonth() { if (curMonth === 0) { setCurMonth(11); setCurYear(y => y-1) } else setCurMonth(m => m-1) }
  function nextMonth() { if (curMonth === 11) { setCurMonth(0); setCurYear(y => y+1) } else setCurMonth(m => m+1) }

  function openAdd(day?: number) {
    const dateStr = day ? `${curYear}-${String(curMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}` : today.toISOString().slice(0,10)
    setForm({ title: '', event_type: 'Academic', start_date: dateStr, end_date: '', description: '', all_day: true })
    setEditItem(null); setMsg(''); setModal(true)
  }

  function openEdit(e: CalEvent) {
    setForm({ title: e.title, event_type: e.event_type, start_date: e.start_date?.slice(0,10), end_date: e.end_date?.slice(0,10) ?? '', description: e.description ?? '', all_day: e.all_day })
    setEditItem(e); setMsg(''); setModal(true)
  }

  async function save() {
    if (!form.title.trim()) { setMsg('Title required.'); return }
    setSaving(true); setMsg('')

    if (editItem) {
      const { error } = await supabase.from('events').update({ title: form.title, event_type: form.event_type, start_date: form.start_date, end_date: form.end_date || null, description: form.description || null, all_day: form.all_day }).eq('id', editItem.id)
      if (!error) { setEvents(p => p.map(e => e.id === editItem.id ? { ...e, ...form, end_date: form.end_date || null, description: form.description || null } : e)); setModal(false) }
      else setMsg(error.message)
    } else {
      const { data, error } = await supabase.from('events').insert({ title: form.title, event_type: form.event_type, start_date: form.start_date, end_date: form.end_date || null, description: form.description || null, all_day: form.all_day, school_id: profile?.school_id, created_by: userId }).select().single()
      if (!error && data) { setEvents(p => [data, ...p]); setModal(false) }
      else setMsg(error?.message ?? 'Failed')
    }
    setSaving(false)
  }

  async function deleteEvent() {
    if (!delItem) return
    setSaving(true)
    await supabase.from('events').delete().eq('id', delItem.id)
    setEvents(p => p.filter(e => e.id !== delItem.id))
    setDelItem(null); setSaving(false)
  }

  // Upcoming events list (next 30 days)
  const upcoming = events
    .filter(e => new Date(e.start_date) >= today)
    .sort((a,b) => a.start_date.localeCompare(b.start_date))
    .slice(0, 10)

  return (
    <RolePageWrapper userId={userId} role="secretary" profile={profile} school={school} title="Calendar">
      {/* Month nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-5)' }}>
        <button onClick={prevMonth} style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', cursor: 'pointer', color: 'var(--text-primary)', fontSize: '1.1rem' }}>‹</button>
        <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{MONTHS[curMonth]} {curYear}</p>
        <button onClick={nextMonth} style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', cursor: 'pointer', color: 'var(--text-primary)', fontSize: '1.1rem' }}>›</button>
      </div>

      {/* Day labels */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
        {DAYS.map(d => <p key={d} style={{ textAlign: 'center', fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', margin: 0, padding: '4px 0' }}>{d}</p>)}
      </div>

      {/* Calendar grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 'var(--space-6)' }}>
        {cells.map((d, i) => {
          const dayEvents = d ? eventsOnDay(d) : []
          const isToday   = d === today.getDate() && curMonth === today.getMonth() && curYear === today.getFullYear()
          return (
            <div key={i} onClick={() => d && openAdd(d)}
              style={{ minHeight: 48, padding: '4px 2px', background: d ? 'var(--glass-bg)' : 'transparent', border: `1px solid ${d ? 'var(--glass-border)' : 'transparent'}`, borderRadius: 'var(--radius-md)', cursor: d ? 'pointer' : 'default', position: 'relative', transition: 'all 0.15s' }}>
              {d && <>
                <p style={{ fontSize: '0.72rem', fontWeight: isToday ? 800 : 500, color: isToday ? sc : 'var(--text-secondary)', textAlign: 'center', margin: '2px 0', width: isToday ? 22 : 'auto', height: isToday ? 22 : 'auto', borderRadius: isToday ? '50%' : 0, background: isToday ? sc + '22' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: 'auto', marginRight: 'auto' }}>{d}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {dayEvents.slice(0,2).map(e => (
                    <div key={e.id} onClick={ev => { ev.stopPropagation(); openEdit(e) }}
                      style={{ fontSize: '0.5rem', fontWeight: 600, background: (TYPE_COLORS[e.event_type] ?? '#6B7280') + '33', color: TYPE_COLORS[e.event_type] ?? '#6B7280', borderRadius: 2, padding: '1px 3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.title}
                    </div>
                  ))}
                  {dayEvents.length > 2 && <p style={{ fontSize: '0.5rem', color: 'var(--text-muted)', margin: 0, textAlign: 'center' }}>+{dayEvents.length-2}</p>}
                </div>
              </>}
            </div>
          )
        })}
      </div>

      {/* Upcoming events */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)' }}>
        <p className={styles.sectionLabel} style={{ margin: 0 }}>Upcoming Events</p>
        <button className={styles.btnPrimary} onClick={() => openAdd()} style={{ height: 36, padding: '0 var(--space-4)', fontSize: '0.78rem' }}>+ Add Event</button>
      </div>

      {upcoming.length === 0 ? (
        <div className={styles.emptyState} style={{ paddingTop: 'var(--space-6)' }}><p className={styles.emptyEmoji}>📅</p><p className={styles.emptyTitle}>No upcoming events</p></div>
      ) : (
        upcoming.map(e => (
          <div key={e.id} className={styles.listItem}>
            <div className={styles.listIconBox} style={{ background: (TYPE_COLORS[e.event_type] ?? sc) + '22' }}>
              <span style={{ fontSize: '1.1rem' }}>📅</span>
            </div>
            <div className={styles.listContent}>
              <p className={styles.listTitle}>{e.title}</p>
              <p className={styles.listSub}>{new Date(e.start_date).toLocaleDateString('en-NG', { weekday: 'short', day: '2-digit', month: 'short' })}{e.end_date ? ` → ${new Date(e.end_date).toLocaleDateString('en-NG', { day: '2-digit', month: 'short' })}` : ''}</p>
            </div>
            <span className={styles.listBadge} style={{ background: (TYPE_COLORS[e.event_type] ?? '#6B7280') + '22', color: TYPE_COLORS[e.event_type] ?? '#6B7280' }}>{e.event_type}</span>
            <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
              <button onClick={() => openEdit(e)} style={{ width: 30, height: 30, borderRadius: 'var(--radius-md)', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', cursor: 'pointer', fontSize: '0.75rem' }}>✏️</button>
              <button onClick={() => setDelItem(e)} style={{ width: 30, height: 30, borderRadius: 'var(--radius-md)', background: 'var(--danger-subtle)', border: '1px solid rgba(239,68,68,0.2)', cursor: 'pointer', fontSize: '0.75rem' }}>🗑️</button>
            </div>
          </div>
        ))
      )}

      {/* Create/Edit Modal */}
      {modal && (
        <div className={styles.modalOverlay} onClick={() => setModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>{editItem ? 'Edit Event' : 'Add Event'}</h2>
            <div className={styles.formGroup}><label className={styles.formLabel}>Title *</label><input className={styles.formInput} value={form.title} onChange={e => setForm(p => ({...p, title: e.target.value}))} placeholder="Event title" /></div>
            <div className={styles.formGroup}><label className={styles.formLabel}>Type</label>
              <select className={styles.formSelect} value={form.event_type} onChange={e => setForm(p => ({...p, event_type: e.target.value}))}>
                {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
              <div className={styles.formGroup}><label className={styles.formLabel}>Start Date *</label><input className={styles.formInput} type="date" value={form.start_date} onChange={e => setForm(p => ({...p, start_date: e.target.value}))} /></div>
              <div className={styles.formGroup}><label className={styles.formLabel}>End Date</label><input className={styles.formInput} type="date" value={form.end_date} onChange={e => setForm(p => ({...p, end_date: e.target.value}))} /></div>
            </div>
            <div className={styles.formGroup}><label className={styles.formLabel}>Description</label><textarea className={styles.formTextarea} value={form.description} onChange={e => setForm(p => ({...p, description: e.target.value}))} rows={3} placeholder="Optional details…" /></div>
            {msg && <p style={{ fontSize: '0.78rem', color: '#EF4444', margin: '0 0 var(--space-3)' }}>{msg}</p>}
            <div className={styles.modalActions}><button className={styles.btnGhost} onClick={() => setModal(false)}>Cancel</button><button className={styles.btnPrimary} onClick={save} disabled={saving}>{saving ? 'Saving…' : editItem ? 'Save' : 'Add Event'}</button></div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {delItem && (
        <div className={styles.modalOverlay} onClick={() => setDelItem(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Delete Event?</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 'var(--space-5)' }}>"<strong>{delItem.title}</strong>" will be permanently removed.</p>
            <div className={styles.modalActions}><button className={styles.btnGhost} onClick={() => setDelItem(null)}>Cancel</button><button className={styles.btnDanger} onClick={deleteEvent} disabled={saving}>{saving ? 'Deleting…' : 'Delete'}</button></div>
          </div>
        </div>
      )}
      <div style={{ height: 110 }} />
    </RolePageWrapper>
  )
                                                              }
