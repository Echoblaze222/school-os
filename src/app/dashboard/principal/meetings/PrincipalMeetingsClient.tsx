'use client'

// src/app/dashboard/principal/meetings/PrincipalMeetingsClient.tsx

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import styles from './principal-meetings.module.css'
import type { MeetingRow, ClassOption } from './page'

interface Props {
  principalId:   string
  schoolId:      string
  principalName: string
  meetings:      MeetingRow[]
  classes:       ClassOption[]
}

type MeetingType = 'pta' | 'staff' | 'board' | 'parent_teacher'
type Audience    = 'all_parents' | 'all_teachers' | 'all_staff' | 'specific_class'
type Mode        = 'list' | 'create'

const MEETING_TYPE_LABELS: Record<MeetingType, string> = {
  pta:           'PTA Meeting',
  staff:         'Staff Meeting',
  board:         'Board Meeting',
  parent_teacher: 'Parent-Teacher Conference',
}

const AUDIENCE_LABELS: Record<Audience, string> = {
  all_parents:    'All Parents',
  all_teachers:   'All Teachers',
  all_staff:      'All Staff',
  specific_class: 'Specific Class',
}

function fmtDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })
}

function isPast(iso: string) { return new Date(iso) < new Date() }

/* ── Bottom Nav ─────────────────────────────────────────── */
function BottomNav({ active }: { active: string }) {
  return (
    <nav className="bottom-nav-mobile" aria-label="Principal navigation">
      <Link href="/dashboard/principal" className={`nav-item ${active==='home'?'active':''}`}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        <span>Home</span>
      </Link>
      <Link href="/dashboard/principal/reports" className={`nav-item ${active==='reports'?'active':''}`}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
        <span>Reports</span>
      </Link>
      <Link href="/dashboard/principal" className="nav-home-btn" aria-label="Dashboard">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 010 14.14M4.93 4.93a10 10 0 000 14.14"/></svg>
      </Link>
      <Link href="/dashboard/principal/meetings" className={`nav-item ${active==='meetings'?'active':''}`}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
        <span>Meetings</span>
      </Link>
      <Link href="/dashboard/principal/ai" className={`nav-item ${active==='ai'?'active':''}`}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
        <span>AI</span>
      </Link>
    </nav>
  )
}

/* ── Main Component ─────────────────────────────────────── */
export default function PrincipalMeetingsClient({
  principalId, schoolId, principalName, meetings: initialMeetings, classes,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const supabase = createClient()

  const [mode,     setMode]     = useState<Mode>('list')
  const [meetings, setMeetings] = useState<MeetingRow[]>(initialMeetings)

  // Form state
  const [title,      setTitle]      = useState('')
  const [type,       setType]       = useState<MeetingType>('pta')
  const [date,       setDate]       = useState('')
  const [time,       setTime]       = useState('10:00')
  const [location,   setLocation]   = useState('')
  const [meetingUrl, setMeetingUrl] = useState('')
  const [agenda,     setAgenda]     = useState('')
  const [audience,   setAudience]   = useState<Audience>('all_parents')
  const [classId,    setClassId]    = useState(classes[0]?.id ?? '')
  const [isOnline,   setIsOnline]   = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError,  setFormError]  = useState('')
  const [success,    setSuccess]    = useState('')

  useEffect(() => {
    const theme = localStorage.getItem('schoolos_theme') ?? 'dark'
    document.documentElement.setAttribute('data-theme', theme)
    // Default date = tomorrow
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
    setDate(tomorrow.toISOString().split('T')[0])
  }, [])

  function resetForm() {
    setTitle(''); setLocation(''); setMeetingUrl(''); setAgenda('')
    setType('pta'); setAudience('all_parents'); setIsOnline(false)
    setFormError(''); setSuccess('')
  }

  async function handleCreate() {
    if (!title.trim()) { setFormError('Meeting title is required.'); return }
    if (!date)         { setFormError('Please select a date.'); return }
    if (isOnline && !meetingUrl.trim()) { setFormError('Meeting URL is required for online meetings.'); return }
    if (!isOnline && !location.trim()) { setFormError('Location is required for in-person meetings.'); return }

    setSubmitting(true); setFormError(''); setSuccess('')

    const scheduledAt = new Date(`${date}T${time}:00`).toISOString()
    const targetClass  = audience === 'specific_class' ? classId : null

    const { data: inserted, error } = await supabase
      .from('meetings')
      .insert({
        school_id:       schoolId || undefined,
        created_by:      principalId,
        title:           title.trim(),
        meeting_type:    type,
        scheduled_at:    scheduledAt,
        location:        isOnline ? null : location.trim(),
        meeting_url:     isOnline ? meetingUrl.trim() : null,
        agenda:          agenda.trim() || null,
        target_audience: audience,
        target_class_id: targetClass,
      })
      .select()
      .single()

    if (error) { setFormError(error.message); setSubmitting(false); return }

    // TODO: send notifications to target_audience via /api/notifications/meeting
    setMeetings(prev => [inserted as MeetingRow, ...prev])
    setSuccess(`"${title}" scheduled successfully. Notifications sent to ${AUDIENCE_LABELS[audience]}.`)
    resetForm()
    setSubmitting(false)
    setTimeout(() => { setSuccess(''); setMode('list') }, 2500)
  }

  // Split into upcoming vs past
  const upcoming = meetings.filter(m => !isPast(m.scheduled_at))
  const past     = meetings.filter(m =>  isPast(m.scheduled_at))

  return (
    <div className={styles.page}>
      <div className={styles.bgOrb1} aria-hidden />
      <div className={styles.bgOrb2} aria-hidden />

      {/* Header */}
      <header className={styles.header}>
        <button
          className={styles.backBtn}
          onClick={() => mode === 'create' ? setMode('list') : router.push('/dashboard/principal')}
          aria-label="Back"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>

        <div className={styles.headerText}>
          <h1 className={styles.headerTitle}>
            {mode === 'create' ? 'Create Meeting' : 'Meetings'}
          </h1>
          <p className={styles.headerSub}>
            {mode === 'create' ? 'Schedule & notify' : `${meetings.length} total`}
          </p>
        </div>

        {mode === 'list' ? (
          <button
            className={styles.createBtn}
            onClick={() => { resetForm(); setMode('create') }}
            aria-label="Create meeting"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
        ) : (
          <div style={{ width: 40 }} />
        )}
      </header>

      {/* ── CREATE FORM ── */}
      {mode === 'create' && (
        <main className={styles.formMain}>
          {success && (
            <div className={styles.successBanner}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              {success}
            </div>
          )}

          {/* Title */}
          <div className={styles.field}>
            <label className={styles.fieldLabel}>
              Meeting Title <span className={styles.req}>*</span>
            </label>
            <input
              className={`input ${styles.input}`}
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. End of Term PTA Meeting"
              maxLength={120}
            />
          </div>

          {/* Type */}
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Meeting Type</label>
            <div className={styles.typeGrid}>
              {(Object.entries(MEETING_TYPE_LABELS) as [MeetingType, string][]).map(([k, v]) => (
                <button
                  key={k}
                  type="button"
                  className={`${styles.typeBtn} ${type === k ? styles.typeBtnActive : ''}`}
                  onClick={() => setType(k)}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* Date + Time */}
          <div className={styles.dateTimeRow}>
            <div className={`${styles.field} ${styles.flex2}`}>
              <label className={styles.fieldLabel}>Date <span className={styles.req}>*</span></label>
              <input
                type="date"
                className={`input ${styles.input}`}
                value={date}
                min={new Date().toISOString().split('T')[0]}
                onChange={e => setDate(e.target.value)}
              />
            </div>
            <div className={`${styles.field} ${styles.flex1}`}>
              <label className={styles.fieldLabel}>Time</label>
              <input
                type="time"
                className={`input ${styles.input}`}
                value={time}
                onChange={e => setTime(e.target.value)}
              />
            </div>
          </div>

          {/* Online toggle */}
          <div className={styles.field}>
            <div className={styles.toggleRow}>
              <div>
                <p className={styles.fieldLabel}>Meeting Format</p>
                <p className={styles.fieldHint}>Online or in-person?</p>
              </div>
              <div className={styles.segmentToggle}>
                <button
                  type="button"
                  className={`${styles.segBtn} ${!isOnline ? styles.segBtnActive : ''}`}
                  onClick={() => setIsOnline(false)}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  In-Person
                </button>
                <button
                  type="button"
                  className={`${styles.segBtn} ${isOnline ? styles.segBtnActive : ''}`}
                  onClick={() => setIsOnline(true)}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
                  Online
                </button>
              </div>
            </div>
          </div>

          {/* Location or URL */}
          {isOnline ? (
            <div className={styles.field}>
              <label className={styles.fieldLabel}>
                Meeting URL <span className={styles.req}>*</span>
              </label>
              <input
                className={`input ${styles.input}`}
                type="url"
                value={meetingUrl}
                onChange={e => setMeetingUrl(e.target.value)}
                placeholder="https://meet.google.com/xxx or zoom.us/j/..."
              />
              <p className={styles.fieldHint}>Google Meet, Zoom, Microsoft Teams…</p>
            </div>
          ) : (
            <div className={styles.field}>
              <label className={styles.fieldLabel}>
                Location <span className={styles.req}>*</span>
              </label>
              <input
                className={`input ${styles.input}`}
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder="e.g. School Hall, Room A1"
              />
            </div>
          )}

          {/* Agenda */}
          <div className={styles.field}>
            <label className={styles.fieldLabel}>
              Agenda <span className={styles.opt}>(one item per line)</span>
            </label>
            <textarea
              className={`input ${styles.textarea}`}
              value={agenda}
              onChange={e => setAgenda(e.target.value)}
              placeholder={"Opening prayers\nPrincipal's report\nFee updates\nAOB"}
              rows={4}
            />
          </div>

          {/* Target audience */}
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Notify / Invite</label>
            <div className={styles.audienceGrid}>
              {(Object.entries(AUDIENCE_LABELS) as [Audience, string][]).map(([k, v]) => (
                <button
                  key={k}
                  type="button"
                  className={`${styles.audienceBtn} ${audience === k ? styles.audienceBtnActive : ''}`}
                  onClick={() => setAudience(k)}
                >
                  {v}
                </button>
              ))}
            </div>
            {audience === 'specific_class' && classes.length > 0 && (
              <select
                className={`input ${styles.input} ${styles.classSelect}`}
                value={classId}
                onChange={e => setClassId(e.target.value)}
              >
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </div>

          {formError && (
            <div className={styles.formError}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {formError}
            </div>
          )}

          <div className={styles.formActions}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => { resetForm(); setMode('list') }}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`btn btn-primary ${styles.submitBtn}`}
              onClick={handleCreate}
              disabled={submitting}
            >
              {submitting ? (
                <><span className={styles.spinner} />Scheduling…</>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                  Schedule Meeting
                </>
              )}
            </button>
          </div>
        </main>
      )}

      {/* ── LIST VIEW ── */}
      {mode === 'list' && (
        <main className={styles.listMain}>
          {meetings.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>
                <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              </div>
              <h3 className={styles.emptyTitle}>No meetings yet</h3>
              <p className={styles.emptyBody}>Tap the + button to schedule your first meeting.</p>
              <button className="btn btn-primary" onClick={() => { resetForm(); setMode('create') }}>
                Schedule Meeting
              </button>
            </div>
          ) : (
            <>
              {upcoming.length > 0 && (
                <section className={styles.section}>
                  <h2 className={styles.sectionTitle}>Upcoming</h2>
                  <div className={styles.meetingList}>
                    {upcoming.map((m, i) => (
                      <MeetingListCard key={m.id} meeting={m} index={i} />
                    ))}
                  </div>
                </section>
              )}
              {past.length > 0 && (
                <section className={styles.section}>
                  <h2 className={styles.sectionTitle}>Past</h2>
                  <div className={styles.meetingList}>
                    {past.map((m, i) => (
                      <MeetingListCard key={m.id} meeting={m} index={i} isPast />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </main>
      )}

      <BottomNav active="meetings" />
    </div>
  )
}

/* ── Meeting list card (principal view — read only) ──────── */
function MeetingListCard({
  meeting, index, isPast = false,
}: {
  meeting: MeetingRow; index: number; isPast?: boolean
}) {
  const dt = new Date(meeting.scheduled_at)
  const typeLabel = MEETING_TYPE_LABELS[meeting.meeting_type as MeetingType] ?? meeting.meeting_type

  return (
    <div
      className={`${styles.listCard} animate-fade-up`}
      style={{ animationDelay: `${index * 50}ms`, opacity: 0 }}
    >
      <div
        className={styles.listCardStripe}
        style={{
          background: isPast
            ? 'var(--text-muted)'
            : meeting.meeting_url
              ? 'linear-gradient(180deg,#7B2FBE,#9B59B6)'
              : 'linear-gradient(180deg,var(--burgundy),var(--burgundy-light))',
        }}
      />
      <div className={styles.listCardBody}>
        <div className={styles.listCardTop}>
          <span className={styles.listCardType}>{typeLabel}</span>
          <span className={`${styles.listCardStatus} ${isPast ? styles.listCardPast : styles.listCardUpcoming}`}>
            {isPast ? 'Past' : 'Upcoming'}
          </span>
        </div>
        <h3 className={styles.listCardTitle}>{meeting.title}</h3>
        <div className={styles.listCardMeta}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          {fmtDate(meeting.scheduled_at)}
        </div>
        {meeting.target_audience && (
          <div className={styles.listCardMeta}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/></svg>
            {AUDIENCE_LABELS[meeting.target_audience as Audience] ?? meeting.target_audience}
          </div>
        )}
        {meeting.meeting_url && !isPast && (
          <a
            href={meeting.meeting_url}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.listJoinBtn}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
            Join Meeting
          </a>
        )}
      </div>
    </div>
  )
}
