'use client'
// src/components/public/landing/AudienceSection.tsx
// Tabbed "who it's for" section. Content is grounded in features that
// actually exist in the product (role dashboards already shipped), not
// aspirational marketing copy. Each role also shows a blob-shaped photo
// with a caption (pre-masked files in public/branding).

import { useState } from 'react'
import Image from 'next/image'
import { CrownIcon, BookOpenIcon, UsersIcon, GraduationCapIcon, CheckIcon } from '@/components/Icons'
import motion from '@/components/dashboard-motion.module.css'
import styles from './AudienceSection.module.css'

const AUDIENCES = [
  {
    key: 'schools',
    label: 'Principals & Proprietors',
    icon: CrownIcon,
    image: '/branding/classroom-maths.webp',
    alt: 'A teacher at a blackboard teaching a full classroom of students',
    caption: 'Results and report cards that are accurate and ready on time',
    points: [
      'A School Health Score that surfaces attendance, fee, and performance trends at a glance',
      'Staff, student, and class management from one dashboard',
      'Subscription and payment oversight, with Paystack payouts to your school account',
    ],
  },
  {
    key: 'teachers',
    label: 'Teachers',
    icon: BookOpenIcon,
    image: '/branding/raised-hand.webp',
    alt: 'A pupil raising her hand to answer a teacher\u2019s question',
    caption: 'More time for the pupils who need you, less for registers',
    points: [
      'Assignments, grading, and result entry without paper registers',
      'Attendance and syllabus tracking per class',
      'Live classes and a class chat room for each subject',
    ],
  },
  {
    key: 'parents',
    label: 'Parents',
    icon: UsersIcon,
    image: '/branding/smiling-class.webp',
    alt: 'A smiling pupil sitting at her desk in a full classroom',
    caption: 'Know how your child is doing, without a trip to the office',
    points: [
      'Pay school fees directly, with an instant digital receipt',
      'See results, attendance, and report cards as they\u2019re published',
      'Message teachers and join parent-teacher meetings in-app',
    ],
  },
  {
    key: 'students',
    label: 'Students',
    icon: GraduationCapIcon,
    image: '/branding/happy-student.webp',
    alt: 'A smiling girl in a yellow jacket celebrating in class',
    caption: 'Learning they look forward to, with everything in one place',
    points: [
      'Assignments, timetable, and results in one place',
      'Join live classes and access the school library',
      'Track study plans and past results across terms',
    ],
  },
]

export default function AudienceSection() {
  const [active, setActive] = useState(AUDIENCES[0].key)
  const current = AUDIENCES.find(a => a.key === active)!

  return (
    <section className="page-content">
      <div className={styles.headingRow}>
        <h2 className="h2">See what SchoolOS does for every role in your school</h2>
      </div>

      <div className={styles.tabRow} role="tablist" aria-label="Choose your role">
        {AUDIENCES.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            role="tab"
            aria-selected={active === key}
            type="button"
            onClick={() => setActive(key)}
            className={`${styles.tab} ${active === key ? styles.tabActive : ''} ${motion.pressable} ${motion.focusable}`}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      <div key={current.key} className={`${styles.panel} glass-card ${motion.riseIn}`}>
        <ul className={styles.pointList}>
          {current.points.map(point => (
            <li key={point} className={styles.point}>
              <CheckIcon size={16} className={styles.checkIcon} />
              <span>{point}</span>
            </li>
          ))}
        </ul>
        <figure className={styles.figure}>
          <Image
            src={current.image}
            alt={current.alt}
            width={900}
            height={900}
            sizes="(min-width: 760px) 260px, 60vw"
            className={styles.blob}
          />
          <figcaption className={styles.caption}>{current.caption}</figcaption>
        </figure>
      </div>
    </section>
  )
}
