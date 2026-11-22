'use client'

// SubscriptionGate.tsx
// Shown when a role is blocked by a lock. Replaces the dashboard content.
//
// Billing is per student now: the 'student_unpaid' status is the only billing
// state, and it is shown to that one student, pointing at the pay page. The
// other statuses are whole-school locks set by a super admin or by an unpaid
// setup, which only SchoolOS support can resolve.
//
// NOTE: middleware.ts redirects locked users before the dashboard page.tsx
// that renders this component runs, so these branches are defence in depth.

import Link from 'next/link'
import { PhoneIcon } from '@/components/Icons'
import styles from './SubscriptionGate.module.css'

interface Props {
  schoolName:   string
  schoolColor?: string
  status:       'expired' | 'suspended' | 'locked' | 'cancelled' | 'student_unpaid' | string
}

const STATUS_COPY: Record<string, { emoji: string; heading: string; sub: string }> = {
  student_unpaid: {
    emoji:   '🔒',
    heading: 'Subscription unpaid',
    sub:     'Your SchoolOS subscription for this term has not been paid yet. You or your parent can pay it now, and your dashboard unlocks as soon as payment is confirmed.',
  },
  expired: {
    emoji:   '🔒',
    heading: 'Portal Not Yet Active',
    sub:     "Your school's setup has not been completed yet. Please contact your school admin or principal.",
  },
  suspended: {
    emoji:   '⚠️',
    heading: 'Account Suspended',
    sub:     "Your school's account has been suspended. Please contact your school admin or principal to resolve this.",
  },
  locked: {
    emoji:   '🚫',
    heading: 'Account Locked',
    sub:     'Access to this dashboard has been locked. Please contact your school admin or principal for assistance.',
  },
  cancelled: {
    emoji:   '🚫',
    heading: 'Account Inactive',
    sub:     'Access to this school account is currently inactive. Please contact your school admin or principal.',
  },
}

export default function SubscriptionGate({ schoolName, schoolColor = '#7C3AED', status }: Props) {
  const copy = STATUS_COPY[status] ?? STATUS_COPY.expired
  const isStudentUnpaid = status === 'student_unpaid'

  return (
    <div className={styles.overlay}>
      <div className={styles.card}>
        <div className={styles.emoji}>{copy.emoji}</div>

        <h1 className={styles.heading} style={{ color: schoolColor }}>
          {copy.heading}
        </h1>

        <p className={styles.school}>{schoolName}</p>

        <p className={styles.message}>{copy.sub}</p>

        <div className={styles.divider} style={{ background: schoolColor }} />

        {isStudentUnpaid ? (
          <Link
            href="/dashboard/student/subscribe"
            className={styles.contactBtn}
            style={{ background: schoolColor }}
          >
            Pay my subscription
          </Link>
        ) : (
          <>
            <div className={styles.infoBox}>
              <p className={styles.infoTitle}>What you need to do:</p>
              <ol className={styles.steps}>
                <li>Speak to your <strong>school admin or principal</strong></li>
                <li>Ask them to contact SchoolOS support</li>
                <li>Once resolved, your dashboard will unlock automatically</li>
              </ol>
            </div>

            <a
              href={`https://wa.me/2348086883144?text=Hello%2C%20my%20school%20(${encodeURIComponent(schoolName)})%20portal%20is%20locked.%20Please%20help.`}
              target="_blank"
              rel="noreferrer"
              className={styles.contactBtn}
              style={{ background: schoolColor }}
            >
              <PhoneIcon size={16} color="#fff" strokeWidth={2.2} />
              Contact SchoolOS Support
            </a>

            <p className={styles.phone}>+234 808 688 3144</p>
          </>
        )}

        <p className={styles.footer}>
          If you believe this is a mistake, please contact your school admin.
        </p>
      </div>
    </div>
  )
}
