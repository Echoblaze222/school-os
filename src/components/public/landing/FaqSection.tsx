'use client'
// src/components/public/landing/FaqSection.tsx
// Each answer has a short lead sentence plus a list of specifics, so a
// parent skimming gets the point and a principal evaluating the product
// can open the same answer and see exactly what is covered. Everything
// here describes behaviour that already exists in the product.
//
// Pricing figures come from src/lib/billing.ts (per-student term rates,
// yearly discount, grace period, platform fee). If those constants change,
// update the first and fifth answers below to match.

import { useState } from 'react'
import { ChevronDownIcon, CheckIcon } from '@/components/Icons'
import styles from './FaqSection.module.css'

type Faq = {
  q: string
  lead: string
  points: string[]
  note?: string
}

const FAQS: Faq[] = [
  {
    q: 'How much does SchoolOS cost?',
    lead: 'Registering your school is free. After that, you pay a subscription each term, based on how many active students your school has.',
    points: [
      'There is no setup fee, and your first four months (one term) start at no charge.',
      'After that, the subscription is per active student, per four-month term: \u20a61,000 for schools up to 250 students, \u20a62,000 for 251 to 500, and \u20a63,000 for 501 and above.',
      'The rate for your school\u2019s size applies to all your students. For example, a school with 200 students pays \u20a6200,000 a term.',
      'Pay for a full year (three terms) at once and take 20% off.',
      'Billing uses the highest number of active students during the period, so the figure stays fair and predictable.',
      'Every school gets the same full set of features, whatever its size.',
      'Your principal renews online with Paystack under Subscriptions in the dashboard, and gets a 7-day grace period after a term ends before access is restricted.',
    ],
    note: 'Online school-fee payments from parents carry a separate platform fee of 3%, capped at \u20a610,000 per payment.',
  },
  {
    q: 'How do we get started?',
    lead: 'Most schools can register in a few minutes and start adding people the same day.',
    points: [
      'Register your school online and follow the step-by-step setup.',
      'Sign in as principal and add your classes, staff and students.',
      'Each person receives an access code from the school.',
      'They choose \u201cNew user\u201d on the login page, enter their code and set their own password.',
      'A short first-time setup follows, which includes accepting the Terms and Privacy Policy.',
    ],
    note: 'You only need a phone or computer with a web browser. Nothing has to be installed.',
  },
  {
    q: 'Who can use SchoolOS?',
    lead: 'Everyone in the school community gets a dashboard built for what they do, and only what they do.',
    points: [
      'Principals and proprietors: a School Health Score, staff, student and class management, and subscription oversight.',
      'Teachers: assignments, grading, result entry, attendance, syllabus tracking, live classes and a class chat room.',
      'Bursars and secretaries: their own dashboards, with fee payments reaching the bursar as they happen.',
      'Students: assignments, timetable, results, live classes, the school library and study plans.',
      'Parents: pay fees, see results, attendance and report cards, message teachers and join parent-teacher meetings.',
      'Appointed roles: vice principal, examination officers and invigilators, counselors, ICT officers, hostel wardens and house parents, nurses, librarians and coaches.',
    ],
  },
  {
    q: 'Do parents and students need to install an app?',
    lead: 'No. SchoolOS runs in the browser, so it works on the devices your school community already has.',
    points: [
      'Open it in any modern browser on a phone, tablet or computer.',
      'On a phone, add it to the home screen and it opens like an app, with its own icon.',
      'No app store, no large download, and no separate version for each device.',
    ],
  },
  {
    q: 'How are school fees collected?',
    lead: 'Through Paystack, with the money paid out to your school\u2019s own account.',
    points: [
      'Parents pay in the app, from their phone, without a trip to the school office.',
      'Each payment produces an instant digital receipt.',
      'Your bursar sees payments reflected in the dashboard in real time.',
      'A platform fee of 3%, capped at \u20a610,000 per payment, is taken from each online payment before the rest reaches your school.',
    ],
  },
  {
    q: 'Is our school\u2019s data private?',
    lead: 'Yes. Each school\u2019s records are kept separate from every other school\u2019s, and people only see what their role allows.',
    points: [
      'Role dashboards are locked to their role: a teacher cannot open the principal\u2019s pages.',
      'Students and parents see only their own or their child\u2019s records.',
      'Signed-in sessions end automatically after 30 minutes of inactivity, which helps on shared phones and computers.',
      'Acceptance of the Terms and Privacy Policy is recorded when each person first signs in.',
    ],
  },
  {
    q: 'Can we control what shows on our public school profile?',
    lead: 'Yes. Public listing is opt-in and off by default.',
    points: [
      'Turn it on from your school\u2019s Settings when you are ready.',
      'You choose what appears: description, facilities, programs, admission status and photos.',
      'Once listed, parents can find your school through Find a school.',
      'Internal records, staff information and financial data are never shown publicly.',
    ],
  },
  {
    q: 'What happens to our data if we stop using SchoolOS?',
    lead: 'Your school\u2019s data belongs to your school.',
    points: [
      'Contact SchoolOS support before closing your account and ask for an export of your records.',
      'Doing this first means you keep your results, attendance and other records for your own files.',
    ],
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
                <div className={`${styles.answer} animate-fade-up`}>
                  <p className={styles.lead}>{item.lead}</p>
                  <ul className={styles.points}>
                    {item.points.map(point => (
                      <li key={point} className={styles.point}>
                        <CheckIcon size={15} className={styles.check} />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                  {item.note && <p className={styles.note}>{item.note}</p>}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
