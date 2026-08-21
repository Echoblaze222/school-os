'use client'
// src/app/dashboard/applications/ApplicationsTrackerClient.tsx

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  ClipboardIcon, ClockIcon, CheckCircleIcon, XIcon, LogOutIcon,
  ChevronRightIcon, SchoolIcon, CalendarIcon,
} from '@/components/Icons'
import styles from './applications.module.css'

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft - not submitted',
  submitted: 'Submitted',
  under_review: 'Under Review',
  more_info_required: 'More Information Required',
  shortlisted: 'Shortlisted',
  interview_scheduled: 'Interview Scheduled',
  assessment_scheduled: 'Assessment Scheduled',
  accepted: 'Accepted',
  rejected: 'Not Successful',
  withdrawn: 'Withdrawn',
  expired: 'Expired',
}

const STATUS_STYLE: Record<string, string> = {
  draft: styles.badgeGray,
  submitted: styles.badgeBlue,
  under_review: styles.badgeBlue,
  more_info_required: styles.badgeYellow,
  shortlisted: styles.badgeBlue,
  interview_scheduled: styles.badgeBlue,
  assessment_scheduled: styles.badgeBlue,
  accepted: styles.badgeGreen,
  rejected: styles.badgeRed,
  withdrawn: styles.badgeGray,
  expired: styles.badgeGray,
}

interface Application {
  id: string
  school_id: string
  applicant_name: string
  class_applying_for: string | null
  status: string
  submitted_at: string | null
  interview_at: string | null
  assessment_at: string | null
  created_at: string
  schools: { name: string; logo_url: string | null; primary_color: string | null } | null
}

interface Props {
  profile: { id: string; full_name: string; email: string } | null
  applications: Application[]
}

export default function ApplicationsTrackerClient({ profile, applications }: Props) {
  const [apps] = useState(applications)
  const router = useRouter()
  const supabase = createClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>SchoolOS</p>
          <h1 className={styles.title}>My Applications</h1>
          <p className={styles.subtitle}>{profile?.full_name}</p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/find-school" className={styles.newAppBtn}>Find a School</Link>
          <button className={styles.signOutBtn} onClick={handleSignOut} aria-label="Sign out">
            <LogOutIcon size={16} color="var(--text-muted)" />
          </button>
        </div>
      </header>

      {apps.length === 0 ? (
        <div className={styles.emptyState}>
          <ClipboardIcon size={36} color="var(--text-muted)" />
          <p className={styles.emptyTitle}>No applications yet</p>
          <p className={styles.emptyHint}>Find a participating school and send your first admission request.</p>
          <Link href="/find-school" className={styles.emptyCta}>Find a School</Link>
        </div>
      ) : (
        <div className={styles.list}>
          {apps.map(app => (
            <Link key={app.id} href={`/dashboard/applications/${app.id}`} className={styles.card}>
              <div
                className={styles.cardIcon}
                style={{ background: (app.schools?.primary_color ?? '#800020') + '22' }}
              >
                <SchoolIcon size={18} color={app.schools?.primary_color ?? '#800020'} />
              </div>
              <div className={styles.cardBody}>
                <p className={styles.cardSchool}>{app.schools?.name ?? 'School'}</p>
                <p className={styles.cardMeta}>
                  {app.class_applying_for ?? 'General application'}
                  {app.interview_at && (
                    <> · <CalendarIcon size={11} color="var(--text-muted)" /> Interview {new Date(app.interview_at).toLocaleDateString('en-NG', { day: '2-digit', month: 'short' })}</>
                  )}
                </p>
              </div>
              <span className={`${styles.badge} ${STATUS_STYLE[app.status] ?? styles.badgeGray}`}>
                {STATUS_LABEL[app.status] ?? app.status}
              </span>
              <ChevronRightIcon size={16} color="var(--text-muted)" />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
