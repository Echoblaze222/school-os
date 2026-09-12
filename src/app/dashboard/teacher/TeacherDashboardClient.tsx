'use client'
// src/app/dashboard/teacher/TeacherDashboardClient.tsx

import Link from 'next/link'
import ChatWidget from '@/components/ChatWidget'
import RecentActivity, { ActivityItem } from '@/components/RecentActivity'
import RoleHeroHeader from '@/components/RoleHeroHeader'
import AiInsightBanner from '@/components/AiInsightBanner'
import BottomDock from '@/components/BottomDock'
import ContextSwitcher from '@/components/ContextSwitcher'
import { FeatureGroup } from '@/components/AllFeaturesSheet'
import { TEACHER_FEATURE_GROUPS } from './featureGroups'
import {
  AwardIcon as ExamIcon,
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
        headline={`${counts.studentCount ?? 0} students · ${counts.classCount ?? 0} classes`}
        sub={(counts.pendingGrading ?? 0) > 0 ? `${counts.pendingGrading} submission${counts.pendingGrading === 1 ? '' : 's'} to grade` : 'All caught up on grading'}
        featureGroups={featureGroups}
      />

      <ContextSwitcher />

      <main className={styles.main}>

        <div className={motion.riseIn} style={{
          display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 12,
          marginTop: 'var(--space-6)', marginBottom: 'var(--space-4)',
        }}>
          <div className="glass-card-flat" style={{ padding: 18, borderRadius: 'var(--radius-xl)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)' }}>Students</p>
            <p style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }}>
              {counts.studentCount ?? 0}
            </p>
            <div style={{ display: 'flex', gap: 20, paddingTop: 10, marginTop: 2, borderTop: '1px solid var(--glass-border)' }}>
              <div>
                <p style={{ margin: 0, fontSize: '0.66rem', color: 'var(--text-muted)' }}>Classes</p>
                <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>{counts.classCount ?? 0}</p>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="glass-card-flat" style={{ padding: '12px 14px', borderRadius: 'var(--radius-lg)', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
              <p style={{ margin: 0, fontSize: '0.66rem', color: 'var(--text-muted)' }}>To grade</p>
              <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: (counts.pendingGrading ?? 0) > 0 ? 'var(--status-warn, #E4572E)' : 'var(--text-primary)' }}>{counts.pendingGrading ?? 0}</p>
            </div>
            <div className="glass-card-flat" style={{ padding: '12px 14px', borderRadius: 'var(--radius-lg)', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
              <p style={{ margin: 0, fontSize: '0.66rem', color: 'var(--text-muted)' }}>Assignments</p>
              <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>{counts.assignmentCount ?? 0}</p>
            </div>
            <div className="glass-card-flat" style={{ padding: '12px 14px', borderRadius: 'var(--radius-lg)', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
              <p style={{ margin: 0, fontSize: '0.66rem', color: 'var(--text-muted)' }}>Quizzes</p>
              <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>{counts.quizCount ?? 0}</p>
            </div>
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
