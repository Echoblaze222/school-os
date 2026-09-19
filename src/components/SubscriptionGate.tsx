'use client'

// SubscriptionGate.tsx
// Shown to students (and optionally other roles) when the school's
// subscription has lapsed. Replaces the dashboard content entirely.
// The principal must renew - then setup_status goes back to 'active'
// and this gate disappears automatically on next page load.
//
// NOTE (found during the school-locked branding fix): middleware.ts
// currently redirects any non-principal billing-locked or hard-locked
// user to /school-locked BEFORE the dashboard page.tsx that renders this
// component ever runs - so as of this commit, the `if (sub.locked)`
// branches in every role's page.tsx that render <SubscriptionGate> are
// unreachable in practice. Left in place deliberately (defense-in-depth
// matches this codebase's own stated pattern of not relying on a single
// enforcement layer - see middleware.ts's own comments), and fixed for
// correctness anyway rather than left to drift further. Worth a decision
// at some point on whether to keep both layers or simplify to one.

import { PhoneIcon } from '@/components/Icons'
import styles from './SubscriptionGate.module.css'

interface Props {
  schoolName:   string
  schoolColor?: string
  status:       'expired' | 'suspended' | 'locked' | 'cancelled' | string
}

const STATUS_COPY: Record<string, { emoji: string; heading: string; sub: string }> = {
  expired: {
    emoji:   '🔒',
    heading: 'Subscription Expired',
    sub:     "Your school's subscription for this term has ended. Please contact your school admin or principal to renew so you can continue using your dashboard.",
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
  // Was missing entirely, so a cancelled school fell through to the
  // 'expired' copy ('...has ended', implying a renewal is simply overdue)
  // rather than reflecting that the school explicitly chose not to renew.
  // docs/lane2-subscription-billing-payment-enforcement/00-README.md
  // documents this distinct copy as the intended behavior.
  cancelled: {
    emoji:   '🚫',
    heading: 'Subscription Cancelled',
    sub:     'Your school chose not to renew its SchoolOS subscription. Please contact your school admin or principal if you believe this is a mistake, or to arrange renewal.',
  },
}

export default function SubscriptionGate({ schoolName, schoolColor = '#7C3AED', status }: Props) {
  const copy = STATUS_COPY[status] ?? STATUS_COPY.expired

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

        <div className={styles.infoBox}>
          <p className={styles.infoTitle}>What you need to do:</p>
          <ol className={styles.steps}>
            <li>Speak to your <strong>school admin or principal</strong></li>
            <li>Ask them to renew the SchoolOS subscription for this term</li>
            <li>Once payment is confirmed, your dashboard will unlock automatically</li>
          </ol>
        </div>

        {/* WhatsApp support button - uses PhoneIcon from Icons.tsx */}
        <a
          href={`https://wa.me/2348086883144?text=Hello%2C%20my%20school%20(${encodeURIComponent(schoolName)})%20subscription%20has%20expired.%20Please%20help%20me%20renew.`}
          target="_blank"
          rel="noreferrer"
          className={styles.contactBtn}
          style={{ background: schoolColor }}
        >
          <PhoneIcon size={16} color="#fff" strokeWidth={2.2} />
          Contact SchoolOS Support
        </a>

        {/* Phone number */}
        <p className={styles.phone}>+234 808 688 3144</p>

        <p className={styles.footer}>
          If you believe this is a mistake, please contact your school admin.
        </p>
      </div>
    </div>
  )
}
