// src/components/public/landing/ValueProps.tsx

import { UsersIcon, WalletIcon, ClipboardIcon, MessageIcon } from '@/components/Icons'
import motion from '@/components/dashboard-motion.module.css'
import styles from './ValueProps.module.css'

const PILLARS = [
  {
    icon: UsersIcon,
    title: 'One portal, every role',
    body: 'Principals, teachers, bursars, secretaries, students and parents each get a dashboard built for what they actually do, on one shared school record.',
  },
  {
    icon: WalletIcon,
    title: 'Fees, handled properly',
    body: 'Termly fee structures, Paystack payments, digital receipts and expense tracking, so the bursar\u2019s books and the parent\u2019s receipt always agree.',
  },
  {
    icon: ClipboardIcon,
    title: 'Results you can trust',
    body: 'Attendance, assignments, exam results and report cards flow through one pipeline, reviewed and published by the people responsible for them.',
  },
  {
    icon: MessageIcon,
    title: 'Everyone stays in the loop',
    body: 'Announcements, in-app chat, live classes and meeting scheduling keep parents and staff connected without a dozen different group chats.',
  },
]

export default function ValueProps() {
  return (
    <section className="page-content">
      <div className={styles.headingRow}>
        <span className="overline">What is SchoolOS</span>
        <h2 className="h2">Everything a Nigerian school runs on, in one place</h2>
      </div>

      <div className={styles.grid}>
        {PILLARS.map(({ icon: Icon, title, body }, i) => (
          <div
            key={title}
            className={`${styles.card} glass-card ${motion.staggerItem}`}
            style={{ animationDelay: `${i * 70}ms` }}
          >
            <div className={styles.iconWrap}><Icon size={20} /></div>
            <h3 className="h4">{title}</h3>
            <p className="body">{body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
