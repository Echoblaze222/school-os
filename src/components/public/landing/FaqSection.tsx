'use client'
// src/components/public/landing/FaqSection.tsx

import { useState } from 'react'
import { ChevronDownIcon } from '@/components/Icons'
import styles from './FaqSection.module.css'

const FAQS = [
  {
    q: 'How much does SchoolOS cost?',
    a: 'Registration is a one-time setup fee of \u20a6150,000, or \u20a650,000 across three monthly installments. This covers your school\u2019s portal setup and onboarding. You can review the full breakdown during registration before you pay anything.',
  },
  {
    q: 'Do parents and students need to install an app?',
    a: 'No installation required. SchoolOS runs in the browser and can be added to a phone\u2019s home screen like an app, so it works on the devices your school community already has.',
  },
  {
    q: 'Can we control what shows on our public school profile?',
    a: 'Yes. Public listing is opt-in and off by default. Once enabled from your school\u2019s Settings, you choose what appears: description, facilities, programs, admission status, and photos. Internal records, staff information, and financial data are never shown publicly.',
  },
  {
    q: 'How are school fees collected?',
    a: 'Through Paystack, directly into your school\u2019s own account. Parents pay in-app and receive an instant digital receipt; your bursar sees payments reflected in the dashboard in real time.',
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
        <span className="overline">Questions</span>
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
