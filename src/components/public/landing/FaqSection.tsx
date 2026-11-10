'use client'
// src/components/public/landing/FaqSection.tsx

import { useState } from 'react'
import { ChevronDownIcon } from '@/components/Icons'
import styles from './FaqSection.module.css'

const FAQS = [
  {
    q: 'How much does SchoolOS cost?',
    a: 'Registering your school is free, and your portal goes live as soon as you finish setup. Every school gets the same full set of features. Your principal can review subscription and billing details under Subscriptions in the dashboard.',
  },
  {
    q: 'How do we get started?',
    a: 'Register your school, which takes a few minutes, and follow the step-by-step setup. Your principal then adds staff, classes and students. Each person receives an access code from the school, which they use to activate their account and choose a password.',
  },
  {
    q: 'Who can use SchoolOS?',
    a: 'Principals and proprietors, teachers, bursars, secretaries, students and parents each get their own dashboard. Staff can also be appointed to additional roles: vice principal, examination officers and invigilators, counselors, ICT officers, hostel wardens and house parents, nurses, librarians and coaches. Every person sees only the tools their role needs.',
  },
  {
    q: 'Do parents and students need to install an app?',
    a: 'No installation required. SchoolOS runs in the browser and can be added to a phone\u2019s home screen like an app, so it works on the devices your school community already has.',
  },
  {
    q: 'How are school fees collected?',
    a: 'Through Paystack, directly into your school\u2019s own account. Parents pay in-app and receive an instant digital receipt; your bursar sees payments reflected in the dashboard in real time.',
  },
  {
    q: 'Is our school\u2019s data private?',
    a: 'Each school\u2019s records are kept separate from every other school\u2019s, and people only see what their role allows. A teacher cannot open the principal\u2019s pages, and students and parents see only their own or their child\u2019s records.',
  },
  {
    q: 'Can we control what shows on our public school profile?',
    a: 'Yes. Public listing is opt-in and off by default. Once enabled from your school\u2019s Settings, you choose what appears: description, facilities, programs, admission status, and photos. Internal records, staff information, and financial data are never shown publicly.',
  },
  {
    q: 'What happens to our data if we stop using SchoolOS?',
    a: 'Your school\u2019s data belongs to your school. Reach out to support for an export of your records before closing an account.',
  },
]

export default function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  return (
    <section className="page-content">
      <div className={styles.headingRow}>
        <h2 className="h2">Frequently asked questions</h2>
      </div>

      <div className={styles.list}>
        {FAQS.map((item, i) => {
          const isOpen = openIndex === i
          return (
            <div key={item.q} className={`${styles.item} glass-card`}>
              <button
                type="button"
                className={styles.question}
                aria-expanded={isOpen}
                onClick={() => setOpenIndex(isOpen ? null : i)}
              >
                <span>{item.q}</span>
                <ChevronDownIcon size={16} className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`} />
              </button>
              {isOpen && (
                <p className={`${styles.answer} animate-fade-up`}>{item.a}</p>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
