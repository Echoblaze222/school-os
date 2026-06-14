'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { MeetingRow } from './page'
import styles from '../principal.module.css'

interface Props { meetings: MeetingRow[]; principalId: string; schoolId: string }

const AUDIENCE_OPTIONS = [
  { value: 'all_staff', label: 'All Staff' },
  { value: 'teachers', label: 'Teachers Only' },
  { value: 'parents', label: 'Parents Only' },
  { value: 'all', label: 'Everyone' },
]

function fmtDt(iso: string) { return new Date(iso).toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) }
function isPast(iso: string) { return new Date(iso).getTime() < Date.now() }

const IconSun=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
const IconMoon=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z"/></svg>
const IconChevronLeft=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><path d="M15 18l-6-6 6-6"/></svg>
const IconPlus=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
const IconCheck=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><polyline points="20 6 9 17 4 12"/></svg>
const IconAlertCircle=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
const IconExternalLink=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={13} height={13}><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>

export default function MeetingsClient({ meetings: initial, principalId, schoolId }: Props) {
  const [isDark, setIsDark] = useState(true)
  const [mounted, setMounted] = useState(false)
  const [meetings, setMeetings] = useState<MeetingRow[]>(initial)
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [url, setUrl] = useState('')
  const [audience, setAudience] = useState('all_staff')
  const [scheduledAt, setScheduledAt] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [status, setStatus] = useState<'idle'|'success'|'error'>('idle')
  const [errMsg, setErrMsg] = useState('')

  useEffect(()=>{
    const s=localStorage.getItem('schoolos_theme'); const dark=s!=='light'
    setIsDark(dark); document.documentElement.setAttribute('data-theme',dark?'dark':'light'); setMounted(true)
  },[])
  const toggleTheme=()=>{ const n=!isDark; setIsDark(n); document.documentElement.setAttribute('data-theme',n?'dark':'light'); localStorage.setItem('schoolos_theme',n?'dark':'light') }

  async function handleCreate() {
    if (!title.trim()||!url.trim()||!scheduledAt) return
    setSubmitting(true); setStatus('idle')
    const supabase = createClient()
    const now = new Date().toISOString()

    const { data: meeting, error } = await supabase.from('online_meetings').insert({
      title: title.trim(), agenda: desc.trim()||null, meeting_url: url.trim(),
      target_audience: audience, scheduled_at: scheduledAt,
      meeting_type: 'online', location: null,
      school_id: schoolId, created_by: principalId, created_at: now,
    }).select('id,title,meeting_type,scheduled_at,location,meeting_url,agenda,target_audience,created_at').single()

    if (error) { setSubmitting(false); setStatus('error'); setErrMsg(error.message); return }

    // Bulk notify targeted users
    const roleMap: Record<string,string[]> = {
      all_staff: ['teacher','bursar','secretary','principal'],
      teachers: ['teacher'], parents: ['parent'], all: ['teacher','bursar','secretary','principal','parent','student'],
    }
    const roles = roleMap[audience] ?? ['teacher']
    const { data: targets } = await supabase.from('profiles').select('id').in('role', roles).eq('school_id', schoolId)
    if ((targets ?? []).length > 0) {
      const notifs = (targets as any[]).map((t: any) => ({
        user_id: t.id, title: `New Meeting: ${title.trim()}`,
        body: `Scheduled for ${new Date(scheduledAt).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}. Join: ${url.trim()}`,
        type: 'meeting', read: false, created_at: now,
      }))
      await supabase.from('notifications').insert(notifs)
    }

    setMeetings(p=>[meeting as MeetingRow, ...p])
    setSubmitting(false); setStatus('success')
    setTitle(''); setDesc(''); setUrl(''); setScheduledAt('')
    setTimeout(()=>{ setStatus('idle'); setShowForm(false) }, 1500)
  }

  if (!mounted) return null

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link href="/dashboard/principal" className={styles.backBtn} style={{marginBottom:8,display:'inline-flex'}}><IconChevronLeft /> Dashboard</Link>
          <h1 className={styles.pageTitle}>Schedule <span>Meetings</span></h1>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.themeBtn} onClick={toggleTheme}>{isDark?<IconSun />:<IconMoon />}</button>
          <button className={styles.primaryBtn} onClick={()=>setShowForm(p=>!p)}><IconPlus /> {showForm?'Cancel':'New Meeting'}</button>
        </div>
      </header>

      <div style={{position:'relative',zIndex:1,padding:'var(--space-6)',display:'grid',gridTemplateColumns:'1fr',gap:'var(--space-5)',maxWidth:960}}>
        {/* Create form */}
        {showForm && (
          <div className={styles.card} style={{animationDelay:'0ms'}}>
            <div className={styles.cardHeader}><div><p className={styles.cardTitle}>Schedule a New Meeting</p><p className={styles.cardSubtitle}>All targeted users will be notified instantly</p></div></div>
            <div className={styles.cardBody}>
              {status==='success'&&<div className={styles.statusSuccess} style={{marginBottom:'var(--space-3)'}}><IconCheck /> Meeting created and notifications sent!</div>}
              {status==='error'&&<div className={styles.statusError} style={{marginBottom:'var(--space-3)'}}><IconAlertCircle /> {errMsg}</div>}
              <div className={styles.fieldGroup}><label className={styles.fieldLabel}>Title *</label><input className={styles.fieldInput} placeholder="e.g. PTA Meeting — 2nd Term" value={title} onChange={e=>setTitle(e.target.value)} /></div>
              <div className={styles.fieldGroup}><label className={styles.fieldLabel}>Description</label><textarea className={`${styles.fieldInput} ${styles.fieldTextarea}`} placeholder="Agenda, notes…" value={desc} onChange={e=>setDesc(e.target.value)} rows={3} /></div>
              <div className={styles.fieldRow}>
                <div className={styles.fieldGroup}><label className={styles.fieldLabel}>Zoom / Meet URL *</label><input className={styles.fieldInput} placeholder="https://meet.google.com/…" value={url} onChange={e=>setUrl(e.target.value)} /></div>
                <div className={styles.fieldGroup}><label className={styles.fieldLabel}>Scheduled Date & Time *</label><input type="datetime-local" className={styles.fieldInput} value={scheduledAt} onChange={e=>setScheduledAt(e.target.value)} /></div>
              </div>
              <div className={styles.fieldGroup}><label className={styles.fieldLabel}>Target Audience *</label>
                <select className={`${styles.fieldInput} ${styles.fieldSelect}`} value={audience} onChange={e=>setAudience(e.target.value)}>
                  {AUDIENCE_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
            <div className={styles.actionRow}>
              <button className={styles.submitBtn} disabled={submitting||!title.trim()||!url.trim()||!scheduledAt} onClick={handleCreate}>{submitting?'Creating…':'Create & Notify'}</button>
            </div>
          </div>
        )}

        {/* Meetings list */}
        <div className={styles.card} style={{animationDelay:showForm?'80ms':'0ms'}}>
          <div className={styles.cardHeader}><div><p className={styles.cardTitle}>All Meetings</p><p className={styles.cardSubtitle}>{meetings.length} scheduled</p></div></div>
          <div className={styles.cardBody} style={{padding:0}}>
            {meetings.length===0
              ? <div className={styles.emptyState}>No meetings yet. Schedule one above.</div>
              : meetings.map(m=>{
                const past = isPast(m.scheduled_at)
                return (
                  <div key={m.id} style={{padding:'var(--space-5) var(--space-6)',borderBottom:'1px solid var(--glass-border)',display:'flex',alignItems:'flex-start',gap:'var(--space-4)',opacity:past?.75:1}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:'flex',alignItems:'center',gap:'var(--space-2)',marginBottom:4}}>
                        <p style={{fontFamily:'var(--font-display)',fontSize:'1rem',fontWeight:600,color:'var(--text-primary)'}}>{m.title}</p>
                        <span className={`${styles.badge} ${past?styles.badgeMuted:styles.badgeBurgundy}`}>{past?'Past':'Upcoming'}</span>
                        <span className={`${styles.badge} ${styles.badgeInfo}`}>{AUDIENCE_OPTIONS.find(o=>o.value===m.target_audience)?.label??m.target_audience}</span>
                      </div>
                      {m.agenda&&<p style={{fontSize:'.78rem',color:'var(--text-secondary)',marginBottom:6,lineHeight:1.5}}>{m.agenda}</p>}
                      <p style={{fontSize:'.72rem',color:'var(--text-muted)'}}>{fmtDt(m.scheduled_at)}</p>
                    </div>
                    <a href={m.meeting_url ?? undefined} target="_blank" rel="noopener noreferrer" style={{display:'inline-flex',alignItems:'center',gap:5,padding:'6px 12px',borderRadius:99,background:'var(--glass-bg)',border:'1px solid var(--glass-border)',color:'var(--text-secondary)',fontSize:'.72rem',fontWeight:700,textDecoration:'none',letterSpacing:'.04em',textTransform:'uppercase',whiteSpace:'nowrap',flexShrink:0}}>
                      <IconExternalLink /> Join
                    </a>
                  </div>
                )
              })}
          </div>
        </div>
      </div>
    </div>
  )
}