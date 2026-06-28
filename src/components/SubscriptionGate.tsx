'use client'

// SubscriptionGate.tsx
// Shown to students (and optionally other roles) when the school's
// subscription has lapsed. Replaces the dashboard content entirely.
// The principal must renew — then setup_status goes back to 'active'
// and this gate disappears automatically on next page load.

import { PhoneIcon } from '@/components/Icons'
import styles from './SubscriptionGate.module.css'

interface Props {
  schoolName:   string
  schoolColor?: string
  status:       'expired' | 'suspended' | 'locked' | string
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

        {/* WhatsApp support button — uses PhoneIcon from Icons.tsx */}
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
