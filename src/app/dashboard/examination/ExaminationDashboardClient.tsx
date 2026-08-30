'use client'
// src/app/dashboard/examination/ExaminationDashboardClient.tsx

import Link from 'next/link'
import RoleHeroHeader from '@/components/RoleHeroHeader'
import GaugeStat from '@/components/GaugeStat'
import AiInsightBanner from '@/components/AiInsightBanner'
import BottomDock from '@/components/BottomDock'
import ContextSwitcher from '@/components/ContextSwitcher'
import { FeatureGroup } from '@/components/AllFeaturesSheet'
import {
  CalendarIcon, ClockIcon, ShieldIcon, CheckCircleIcon,
  FileTextIcon, AlertCircleIcon, BarChartIcon,
} from '@/components/Icons'
import styles from './examination.module.css'
import motion from '@/components/dashboard-motion.module.css'

interface Capabilities {
  manageExams: boolean
  assignInvigilators: boolean
  createDocuments: boolean
  reviewDocuments: boolean
  enterResults: boolean
  verifyResults: boolean
  publishResults: boolean
  resolveIncident: boolean
}

interface Props {
  userId: string
  profile: any
  school: any
  appointmentLabels: string[]
  activeSession: { id: string; name: string; term: string; academic_year: string; start_date: string; end_date: string; status: string } | null
  upcomingExamCount: number
  pendingVerificationCount: number
  openIncidentCount: number
  myDutyCount: number
  myUpcomingDuties: any[]
  capabilities: Capabilities
}

const FEATURE_GROUPS: FeatureGroup[] = [
  { name: 'Exams', items: [
    { id: 'sessions',   label: 'Exam Sessions', href: '/dashboard/examination/sessions',   Icon: CalendarIcon },
    { id: 'timetable',  label: 'Timetable',     href: '/dashboard/examination/timetable',  Icon: ClockIcon },
  ]},
  { name: 'Conduct', items: [
    { id: 'invigilation', label: 'Invigilation',    href: '/dashboard/examination/invigilation', Icon: ShieldIcon },
    { id: 'attendance',   label: 'Exam Attendance', href: '/dashboard/examination/attendance',   Icon: CheckCircleIcon },
    { id: 'incidents',    label: 'Incidents',       href: '/dashboard/examination/incidents',    Icon: AlertCircleIcon },
  ]},
  { name: 'Results', items: [
    { id: 'documents', label: 'Question Papers',  href: '/dashboard/examination/documents', Icon: FileTextIcon },
    { id: 'results',   label: 'Verify & Publish', href: '/dashboard/examination/results',   Icon: BarChartIcon },
  ]},
]

function buildInsight(props: Pick<Props, 'openIncidentCount' | 'pendingVerificationCount' | 'upcomingExamCount' | 'myDutyCount' | 'capabilities'>): string {
  const { openIncidentCount, pendingVerificationCount, upcomingExamCount, myDutyCount, capabilities } = props
  if (openIncidentCount > 0) {
    return `${openIncidentCount} exam incident${openIncidentCount === 1 ? '' : 's'} still open and unresolved.`
  }
  if (capabilities.verifyResults && pendingVerificationCount > 0) {
    return `${pendingVerificationCount} approved result${pendingVerificationCount === 1 ? '' : 's'} waiting on verification.`
  }
  if (myDutyCount > 0) {
    return `You have ${myDutyCount} upcoming invigilation dut${myDutyCount === 1 ? 'y' : 'ies'}.`
  }
  if (upcomingExamCount > 0) {
    return `${upcomingExamCount} exam${upcomingExamCount === 1 ? '' : 's'} scheduled in the next 7 days.`
  }
  return 'No exams scheduled in the next 7 days, nothing urgent flagged right now.'
}

export default function ExaminationDashboardClient({
  userId, profile, school, appointmentLabels, activeSession,
  upcomingExamCount, pendingVerificationCount, openIncidentCount,
  myDutyCount, myUpcomingDuties, capabilities,
}: Props) {
  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const roleLabel = appointmentLabels.length > 0 ? appointmentLabels.join(', ') : 'Examination Committee'

  return (
    <div className={styles.page} style={{ background: 'color-mix(in srgb, var(--brand) 6%, var(--bg-base))' }}>
      <RoleHeroHeader
        userId={userId}
        role="examination"
        roleLabel={roleLabel}
        profile={profile}
        school={school}
        greeting={`${greeting}, ${firstName}`}
        headline="Sessions, timetables, and results, all in one place."
        sub={activeSession
          ? `${activeSession.name} · ${activeSession.term} ${activeSession.academic_year}`
          : 'No exam session currently scheduled'}
        featureGroups={FEATURE_GROUPS}
      />

      <ContextSwitcher />

      <main className={styles.main}>
        {activeSession ? (
          <div className={`glass-card ${styles.sessionCard} ${motion.riseIn}`}>
            <p className={styles.sessionEyebrow}>Active session</p>
            <p className={styles.sessionName}>{activeSession.name}</p>
            <p className={styles.sessionMeta}>
              {activeSession.term} · {activeSession.academic_year} · {activeSession.start_date} to {activeSession.end_date}
            </p>
          </div>
        ) : (
          <div className={`glass-card-flat ${styles.sessionCard} ${motion.riseIn}`}>
            <p style={{ margin: 0, fontSize: 14, opacity: 0.75 }}>
              No exam session is currently scheduled or ongoing.
              {capabilities.manageExams && (
                <> <Link href="/dashboard/examination/sessions" style={{ color: 'var(--brand)', fontWeight: 600 }}>Create one →</Link></>
              )}
            </p>
          </div>
        )}

        <div className={motion.riseIn} style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(104px, 1fr))', gap: 12,
          marginBottom: 'var(--space-4)',
        }}>
          <div className={`glass-card ${motion.pressable}`} style={{ padding: 16, borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
            <GaugeStat label="Exams this week" value={upcomingExamCount} color="var(--brand)" caption="next 7 days" />
          </div>
          {capabilities.verifyResults && (
            <div className={`glass-card ${motion.pressable}`} style={{ padding: 16, borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
              <GaugeStat label="Awaiting verification" value={pendingVerificationCount} color="var(--status-warn, #E4572E)" caption="approved results" delayMs={80} />
            </div>
          )}
          <div className={`glass-card ${motion.pressable}`} style={{ padding: 16, borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
            <GaugeStat label="Open incidents" value={openIncidentCount} color="var(--danger)" caption="unresolved" delayMs={160} />
          </div>
          <div className={`glass-card ${motion.pressable}`} style={{ padding: 16, borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
            <GaugeStat label="My duties" value={myDutyCount} color="var(--brand-2, var(--brand))" caption="upcoming invigilation" delayMs={240} />
          </div>
        </div>

        <div style={{ marginBottom: 'var(--space-4)' }}>
          <AiInsightBanner
            insight={buildInsight({ openIncidentCount, pendingVerificationCount, upcomingExamCount, myDutyCount, capabilities })}
            actionLabel={openIncidentCount > 0 ? 'Review incidents →' : capabilities.verifyResults && pendingVerificationCount > 0 ? 'Verify results →' : 'View timetable →'}
            actionHref={openIncidentCount > 0 ? '/dashboard/examination/incidents' : capabilities.verifyResults && pendingVerificationCount > 0 ? '/dashboard/examination/results' : '/dashboard/examination/timetable'}
          />
        </div>

        {myUpcomingDuties.length > 0 && (
          <>
            <p className={styles.sectionLabel}>Your upcoming invigilation duty</p>
            {myUpcomingDuties.map((d: any) => {
              const et = Array.isArray(d.exam_timetable) ? d.exam_timetable[0] : d.exam_timetable
              const cs = et?.class_subjects ? (Array.isArray(et.class_subjects) ? et.class_subjects[0] : et.class_subjects) : null
              const subj = cs?.subjects?.name ?? 'Exam'
              const cls  = cs?.classes?.name ?? ''
              return (
                <div key={d.id} className={`glass-card-flat ${styles.dutyRow}`}>
                  <div>
                    <p className={styles.dutyTitle}>{subj} {cls && `· ${cls}`}</p>
                    <p className={styles.dutyMeta}>{et?.exam_date} · {et?.start_time}–{et?.end_time}</p>
                  </div>
                  <span className={styles.dutyStatus} style={{
                    color: d.status === 'confirmed' ? 'var(--status-ok, #3FA66B)' : 'var(--status-warn, #E4572E)',
                  }}>{d.status}</span>
                </div>
              )
            })}
          </>
        )}

        {myUpcomingDuties.length === 0 && (
          <div className={`glass-card ${styles.emptyState}`}>
            <ShieldIcon size={28} />
            <p>No invigilation duty assigned to you right now.</p>
          </div>
        )}
      </main>

      <BottomDock role="examination" aiHref="/dashboard/examination/ai" groups={FEATURE_GROUPS} />
    </div>
  )
}
