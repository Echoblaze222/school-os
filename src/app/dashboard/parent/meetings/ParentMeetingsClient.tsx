'use client'

// src/app/dashboard/parent/meetings/ParentMeetingsClient.tsx

import { useRealtimeTable } from '@/hooks/useRealtimeTable'
import RolePageWrapper from '@/components/RolePageWrapper'
import styles from './parent-meetings.module.css'
import type { MeetingRow } from './page'

interface Props {
  userId:       string
  schoolId:     string
  meetings:     MeetingRow[]
  fetchError:   string | null
  profile:      any
  school:       any
  childClassId: string | null
}

const MEETING_TYPE_LABELS: Record<string, string> = {
  pta:            'PTA Meeting',
  staff:          'Staff Meeting',
  board:          'Board Meeting',
  parent_teacher: 'Parent-Teacher Conference',
  online:         'Online Meeting',
}

const AUDIENCE_LABELS: Record<string, string> = {
  all_parents:    'All Parents',
  all_teachers:   'All Teachers',
  all_staff:      'All Staff',
  specific_class: 'My Child\'s Class',
  all:            'Everyone',
}

function fmtDate(iso: string) {
  const d = new Date(iso)
  return (
    d.toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })
  )
}

function isPast(iso: string) { return new Date(iso) < new Date() }

export default function ParentMeetingsClient({
  userId, schoolId, meetings: initialMeetings, fetchError, profile, school, childClassId,
}: Props) {

  const [meetings] = useRealtimeTable<MeetingRow>({
    table:   'online_meetings',
    filter:  schoolId ? `school_id=eq.${schoolId}` : undefined,
    initial: initialMeetings,
    orderBy: (a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime(),
  })

  // Client-side mirror of the server filter
  const relevant = meetings.filter(m =>
    m.target_audience === 'all_parents' ||
    (m.target_audience === 'specific_class' && m.target_class_id === childClassId)
  )
  const upcoming = relevant.filter(m => !isPast(m.scheduled_at))
  const past     = relevant.filter(m =>  isPast(m.scheduled_at))

  return (
    <RolePageWrapper
      userId={userId}
      role="parent"
      profile={profile}
      school={school}
      title="Meetings"
    >
      <div className={styles.listMain}>

        {fetchError && (
          <div className={styles.errorBanner}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            Could not load meetings: {fetchError}
          </div>
        )}

        {relevant.length === 0 && !fetchError ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            </div>
            <h3 className={styles.emptyTitle}>No meetings scheduled</h3>
            <p className={styles.emptyBody}>When the school schedules a parent meeting, it will appear here.</p>
          </div>
        ) : (
          <>
            {upcoming.length > 0 && (
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Upcoming</h2>
                <div className={styles.meetingList}>
                  {upcoming.map((m, i) => (
                    <MeetingCard key={m.id} meeting={m} index={i} />
                  ))}
                </div>
              </section>
            )}
            {past.length > 0 && (
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Past</h2>
                <div className={styles.meetingList}>
                  {past.map((m, i) => (
                    <MeetingCard key={m.id} meeting={m} index={i} isPast />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      <div style={{ height: 80 }} />
    </RolePageWrapper>
  )
}

function MeetingCard({
  meeting, index, isPast = false,
}: {
  meeting: MeetingRow; index: number; isPast?: boolean
}) {
  const typeLabel     = MEETING_TYPE_LABELS[meeting.meeting_type] ?? meeting.meeting_type
  const audienceLabel = AUDIENCE_LABELS[meeting.target_audience]  ?? meeting.target_audience

  return (
    <div className={styles.listCard} style={{ animationDelay: `${index * 50}ms` }}>
      <div
        className={styles.listCardStripe}
        style={{
          background: isPast
            ? 'var(--text-muted)'
            : meeting.meeting_url
              ? 'linear-gradient(180deg,#7B2FBE,#9B59B6)'
              : 'linear-gradient(180deg,var(--burgundy),var(--burgundy-light,#a0002a))',
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
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          {fmtDate(meeting.scheduled_at)}
        </div>

        {meeting.location && (
          <div className={styles.listCardMeta}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
            </svg>
            {meeting.location}
          </div>
        )}

        <div className={styles.listCardMeta}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 00-3-3.87"/>
          </svg>
          {audienceLabel}
        </div>

        {meeting.agenda && (
          <p className={styles.listCardAgenda}>{meeting.agenda}</p>
        )}

        {meeting.meeting_url && !isPast && (
          <a href={meeting.meeting_url} target="_blank" rel="noopener noreferrer" className={styles.listJoinBtn}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>
            </svg>
            Join Meeting
          </a>
        )}
      </div>
    </div>
  )
}
