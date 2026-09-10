'use client'
// src/app/dashboard/teacher/TeacherDashboardClient.tsx

import Link from 'next/link'
import ChatWidget from '@/components/ChatWidget'
import RecentActivity, { ActivityItem } from '@/components/RecentActivity'
import RoleHeroHeader from '@/components/RoleHeroHeader'
import GaugeStat from '@/components/GaugeStat'
import KpiCard from '@/components/KpiCard'
import AiInsightBanner from '@/components/AiInsightBanner'
import BottomDock from '@/components/BottomDock'
import ContextSwitcher from '@/components/ContextSwitcher'
import { FeatureGroup } from '@/components/AllFeaturesSheet'
import { TEACHER_FEATURE_GROUPS } from './featureGroups'
import {
  BookOpenIcon, PeopleIcon, AwardIcon as ExamIcon,
} from '@/components/Icons'
import styles from './teacher.module.css'
import motion from '@/components/dashboard-motion.module.css'

// The exam-committee item is spliced in below only for teachers who
// actually hold an active exam appointment - a teacher with none of
// these appointments never sees it, per "one user, multiple contexts":
// the extra dashboard only appears while the appointment is active,
// base teacher functionality is unaffected either way.
const FEATURE_GROUPS = TEACHER_FEATURE_GROUPS

interface Props {
  profile: any
  school:  any
  userId:  string
  counts?: {
    classCount:      number
    studentCount:    number
    assignmentCount: number
    pendingGrading:  number
    quizCount:       number
  }
  activities: ActivityItem[]
  /** Label of this teacher's active exam-committee appointment, if any
   *  (e.g. "Examination Officer"). Undefined/null = not on the committee,
   *  the whole affordance stays hidden, see teacher/page.tsx for the query. */
  examAppointmentLabel?: string | null
}

function buildInsight(counts: any): string {
  if ((counts.pendingGrading ?? 0) > 5) {
    return `${counts.pendingGrading} submissions are waiting to be graded. The oldest ones are starting to pile up. Clearing these keeps feedback useful for students.`
  }
  if ((counts.pendingGrading ?? 0) > 0) {
    return `${counts.pendingGrading} submission${counts.pendingGrading === 1 ? '' : 's'} waiting to be graded across your classes.`
  }
  return `You're fully caught up on grading. ${counts.assignmentCount ?? 0} assignments are currently open across your classes.`
}

export default function TeacherDashboardClient({ profile, school, userId, counts = {} as any, activities, examAppointmentLabel }: Props) {
  const schoolColor = school?.primary_color ?? '#7C3AED'
  const firstName   = profile?.full_name?.split(' ')[0] ?? 'Teacher'

  const teacherRoleLabel =
    profile?.teacher_role_type === 'class_teacher'   ? 'Class Teacher' :
    profile?.teacher_role_type === 'subject_teacher' ? 'Subject Teacher' :
    profile?.teacher_role_type === 'both'            ? 'Class + Subject Teacher' : 'Teacher'

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const featureGroups: FeatureGroup[] = examAppointmentLabel
    ? FEATURE_GROUPS.map(g => g.name === 'Account'
        ? { ...g, items: [...g.items, { id: 'examination', label: 'Examination Team', href: '/dashboard/examination', Icon: ExamIcon }] }
        : g)
    : FEATURE_GROUPS

  async function handleDeleteActivity(id: string) {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    await supabase.from('recent_activities').delete().eq('id', id).eq('user_id', userId)
  }

  return (
    <div className={styles.page} style={{ background: 'color-mix(in srgb, var(--brand) 6%, var(--bg-base))' }}>
      <RoleHeroHeader
        userId={userId}
        role="teacher"
        roleLabel={teacherRoleLabel}
        profile={profile}
        school={school}
        greeting={`${greeting}, ${firstName}`}
        headline="Your classroom, today."
        sub={`${counts.studentCount ?? 0} students across ${counts.classCount ?? 0} classes`}
        featureGroups={featureGroups}
      />

      <ContextSwitcher />

      <main className={styles.main}>

        <div className={motion.riseIn} style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(104px, 1fr))', gap: 12,
          marginTop: 'var(--space-6)', marginBottom: 'var(--space-4)',
        }}>
          <div className={`glass-card ${motion.pressable}`} style={{ padding: 16, borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
            <GaugeStat label="To grade" value={counts.pendingGrading ?? 0}
              color="var(--status-warn, #E4572E)" caption="submissions" />
          </div>
          <div className={`glass-card ${motion.pressable}`} style={{ padding: 16, borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
            <GaugeStat label="Open assignments" value={counts.assignmentCount ?? 0}
              color="var(--status-ok, #3FA66B)" caption="across your classes" delayMs={80} />
          </div>
          <div className={`glass-card ${motion.pressable}`} style={{ padding: 16, borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
            <GaugeStat label="Published quizzes" value={counts.quizCount ?? 0}
              color="var(--brand-2, var(--brand))" caption="live now" delayMs={160} />
          </div>
        </div>

        <div style={{ marginBottom: 'var(--space-4)' }}>
          <AiInsightBanner
            insight={buildInsight(counts)}
            actionLabel="Open grading →"
            actionHref="/dashboard/teacher/grades"
          />
        </div>

        {examAppointmentLabel && (
          <Link
            href="/dashboard/examination"
            className={`glass-card ${motion.pressable}`}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: 14,
              borderRadius: 'var(--radius-xl)', marginBottom: 'var(--space-4)',
              textDecoration: 'none', color: 'inherit',
            }}
          >
            <div style={{
              width: 40, height: 40, borderRadius: 'var(--radius-full)',
              background: 'var(--brand-subtle)', display: 'flex',
              alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <ExamIcon size={20} color="var(--brand)" />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontWeight: 600 }}>Examination Team</p>
              <p style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>
                You're appointed {examAppointmentLabel}, open the committee dashboard →
              </p>
            </div>
          </Link>
        )}

        <div className={styles.statsRow} style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
          <KpiCard label="Classes" value={counts.classCount ?? 0} icon={<BookOpenIcon size={16} />} context="You teach" />
          <KpiCard label="Students" value={counts.studentCount ?? 0} icon={<PeopleIcon size={16} />} context="Across your classes" />
        </div>

        <RecentActivity
          items={activities}
          accentColor={schoolColor}
          onDelete={handleDeleteActivity}
          emptyLabel="Nothing yet. Grading, attendance, and messages will show up here"
        />

        <div className={styles.spacer} />
      </main>

      <BottomDock aiHref="/dashboard/teacher/ai" groups={featureGroups} role="teacher" />
      <ChatWidget userId={userId} role="teacher" schoolColor={schoolColor} />
    </div>
  )
}
