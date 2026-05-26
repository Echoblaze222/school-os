'use client'

// src/app/dashboard/teacher/meetings/TeacherMeetingsClient.tsx
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import styles from './teacher-meetings.module.css'
import type { TeacherMeeting } from './page'

interface Props { teacherId: string; meetings: TeacherMeeting[] }

type Tab = 'upcoming' | 'past'

const TYPE_LABELS: Record<string,string> = {
  pta:'PTA Meeting', staff:'Staff Meeting', board:'Board Meeting', parent_teacher:'Parent-Teacher'
}

function fmtDate(iso: string) {
  const d = new Date(iso)
  return {
    long: d.toLocaleDateString('en-NG',{weekday:'long',day:'numeric',month:'long',year:'numeric'}),
    time: d.toLocaleTimeString('en-NG',{hour:'2-digit',minute:'2-digit'}),
    day:  d.getDate(),
    mon:  d.toLocaleDateString('en-NG',{month:'short'}),
    isPast: d < new Date(),
    daysAway: Math.ceil((d.getTime() - Date.now()) / 86400000),
  }
}

export default function TeacherMeetingsClient({ meetings }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('upcoming')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', localStorage.getItem('schoolos_theme') ?? 'dark')
  }, [])

  const now      = new Date()
  const upcoming = meetings.filter(m => new Date(m.scheduled_at) >= now)
  const past     = meetings.filter(m => new Date(m.scheduled_at) <  now)
  const displayed = tab === 'upcoming' ? upcoming : past

  return (
    <div className={styles.page}>
      <div className={styles.bgOrb1} aria-hidden />
      <div className={styles.bgOrb2} aria-hidden />

      <header className={styles.header}>
        <button onClick={() => router.push('/dashboard/teacher')} className={styles.backBtn} aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div className={styles.headerText}>
          <h1 className={styles.headerTitle}>Meetings</h1>
          <p className={styles.headerSub}>{upcoming.length > 0 ? `${upcoming.length} upcoming` : 'No upcoming'}</p>
        </div>
        <button className={styles.themeBtn} aria-label="Toggle theme"
          onClick={() => { const c=document.documentElement.getAttribute('data-theme')??'dark';const n=c==='dark'?'light':'dark';document.documentElement.setAttribute('data-theme',n);localStorage.setItem('schoolos_theme',n) }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/></svg>
        </button>
      </header>

      {/* Notice — read-only */}
      <div className={styles.noticeBanner}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        Only the Principal can create meetings. Contact your Principal to schedule one.
      </div>

      {/* Tabs */}
      <div className={styles.tabBar} role="tablist">
        {(['upcoming','past'] as Tab[]).map(t => (
          <button key={t} role="tab" aria-selected={tab===t}
            className={`${styles.tab} ${tab===t?styles.tabActive:''}`}
            onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase()+t.slice(1)}
            {(t==='upcoming'?upcoming:past).length > 0 && (
              <span className={`${styles.tabBadge} ${tab===t?styles.tabBadgeActive:''}`}>
                {(t==='upcoming'?upcoming:past).length}
              </span>
            )}
          </button>
        ))}
      </div>

      <main className={styles.main} role="tabpanel">
        {displayed.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            </div>
            <h3 className={styles.emptyTitle}>{tab==='upcoming'?'No upcoming meetings':'No past meetings'}</h3>
            <p className={styles.emptyBody}>Meetings scheduled by the Principal will appear here.</p>
          </div>
        ) : (
          <div className={styles.meetingList}>
            {displayed.map((m, i) => {
              const dt = fmtDate(m.scheduled_at)
              const isOnline = !!m.meeting_url
              const typeLabel = TYPE_LABELS[m.meeting_type] ?? m.meeting_type

              return (
                <article
                  key={m.id}
                  className={`${styles.card} animate-fade-up`}
                  style={{ animationDelay:`${i*60}ms`, opacity:0 }}
                >
                  <div
                    className={styles.cardStripe}
                    style={{
                      background: dt.isPast
                        ? 'var(--text-muted)'
                        : isOnline
                          ? 'linear-gradient(180deg,#7B2FBE,#9B59B6)'
                          : 'linear-gradient(180deg,var(--burgundy),var(--burgundy-light))',
                    }}
                  />
                  <div className={styles.cardBody}>
                    {/* Top */}
                    <div className={styles.cardTopRow}>
                      <div className={styles.dateBadge}>
                        <span className={styles.dateBadgeDay}>{dt.day}</span>
                        <span className={styles.dateBadgeMonth}>{dt.mon}</span>
                      </div>
                      <div className={styles.cardMeta}>
                        <div className={styles.typeRow}>
                          <span className={styles.typeChip}>{typeLabel}</span>
                          {isOnline && (
                            <span className={styles.onlineChip}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
                              Online
                            </span>
                          )}
                        </div>
                        <h3 className={styles.cardTitle}>{m.title}</h3>
                      </div>
                    </div>

                    {/* Details */}
                    <div className={styles.cardDetails}>
                      <span className={styles.detailItem}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        {dt.long} · {dt.time}
                      </span>
                      {m.location && (
                        <span className={styles.detailItem}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                          {m.location}
                        </span>
                      )}
                      {!dt.isPast && dt.daysAway > 0 && (
                        <span className={styles.countdownChip}>
                          {dt.daysAway === 1 ? '⏰ Tomorrow' : `⏰ In ${dt.daysAway} days`}
                        </span>
                      )}
                    </div>

                    {/* Agenda preview */}
                    {m.agenda && (
                      <div className={styles.agendaPreview}>
                        <span className={styles.agendaLabel}>Agenda</span>
                        <p className={styles.agendaText}>
                          {m.agenda.split('\n').filter(Boolean).slice(0,2).join(' · ')}
                          {m.agenda.split('\n').filter(Boolean).length > 2 && '…'}
                        </p>
                      </div>
                    )}

                    {/* Join button — only for online + upcoming */}
                    {isOnline && m.meeting_url && !dt.isPast && (
                      <a
                        href={m.meeting_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.joinBtn}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
                        Join Now
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                      </a>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </main>

      <nav className="bottom-nav" aria-label="Teacher navigation">
        <Link href="/dashboard/teacher" className="nav-item"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg><span>Home</span></Link>
        <Link href="/dashboard/teacher/results" className="nav-item"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg><span>Results</span></Link>
        <Link href="/dashboard/teacher" className="nav-home"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 010 14.14M4.93 4.93a10 10 0 000 14.14"/></svg></Link>
        <Link href="/dashboard/teacher/meetings" className="nav-item active"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg><span>Meetings</span></Link>
        <Link href="/dashboard/teacher/messages" className="nav-item"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg><span>Messages</span></Link>
      </nav>
    </div>
  )
}
