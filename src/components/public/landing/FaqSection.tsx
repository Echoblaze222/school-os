'use client'
// src/components/public/landing/FaqSection.tsx
// Each answer has a short lead sentence plus a list of specifics, so a
// parent skimming gets the point and a principal evaluating the product
// can open the same answer and see exactly what is covered. Questions are
// grouped into four categories with filter chips, so the longer list stays
// easy to scan. Everything here describes behaviour that already exists in
// the product (role dashboards, billing and feature set).
//
// Pricing figures come from src/lib/billing.ts (per-student term rates,
// yearly discount, grace period, platform fee and its cap). If those
// constants change, update the first and fifth answers below to match.

import { useState } from 'react'
import { ChevronDownIcon, CheckIcon } from '@/components/Icons'
import styles from './FaqSection.module.css'

type Category = 'start' | 'learn' | 'school' | 'safe'

type Faq = {
  cat: Category
  q: string
  lead: string
  points: string[]
  note?: string
}

const CATEGORIES: { key: Category | 'all'; label: string }[] = [
  { key: 'all',    label: 'All questions' },
  { key: 'start',  label: 'Pricing & setup' },
  { key: 'learn',  label: 'Teaching & learning' },
  { key: 'school', label: 'Running the school' },
  { key: 'safe',   label: 'Safety & data' },
]

const FAQS: Faq[] = [
  // ── Pricing & setup ──
  {
    cat: 'start',
    q: 'How much does SchoolOS cost?',
    lead: 'SchoolOS is free to join, with simple pricing that grows with your school: one rate per student each term, and every feature included.',
    points: [
      'Free to join: there is no setup fee, and your first four months (one term) are included so you can see the results for yourself.',
      'One clear rate per active student, per four-month term: \u20a61,000 for schools up to 250 students, \u20a62,000 for 251 to 500, and \u20a63,000 for 501 and above.',
      'The rate for your school\u2019s size covers all your students. A school with 200 students, for example, pays \u20a6200,000 a term, which is \u20a61,000 per pupil for results, fees, attendance and live classes in one place.',
      'The same full set of features at every size, so a small school gets the same tools as a large one.',
      'Save 20% when you pay for the full year (three terms) at once.',
      'Your subscription reflects the highest number of active students enrolled during the term.',
      'Your principal renews online with Paystack under Subscriptions in the dashboard, with a 7-day grace period after a term ends so a late renewal never interrupts teaching.',
    ],
    note: 'Online school-fee payments from parents carry a platform fee of 3%, and it never exceeds \u20a610,000 per payment, however large the payment.',
  },
  {
    cat: 'start',
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
    cat: 'start',
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
    cat: 'start',
    q: 'Do parents and students need to install an app?',
    lead: 'No. SchoolOS runs in the browser, so it works on the devices your school community already has.',
    points: [
      'Open it in any modern browser on a phone, tablet or computer.',
      'On a phone, add it to the home screen and it opens like an app, with its own icon.',
      'No app store, no large download, and no separate version for each device.',
    ],
  },

  // ── Teaching & learning ──
  {
    cat: 'learn',
    q: 'How do live classes work?',
    lead: 'Teachers host real-time online classes for the classes they teach, and students join from their own dashboard.',
    points: [
      'A teacher opens Live Class, starts a session for one of their assigned classes and teaches in real time.',
      'Students join from the Live Classes page of their dashboard, with nothing extra to install.',
      'Principals can see live classes across the school from their own Live Classes page.',
      'Each subject also has a class chat room, so questions can continue after the lesson.',
    ],
    note: 'Live classes are included for every school, whatever its size.',
  },
  {
    cat: 'learn',
    q: 'How do assignments and quizzes work?',
    lead: 'Teachers set the work, students submit it, and marking is organised in one place instead of in piles of paper.',
    points: [
      'Teachers create assignments for their classes and see every submission on one page.',
      'Students find their assignments in their dashboard, and parents can see them too.',
      'Quizzes support multiple-choice and short-answer questions, with a time limit set by the teacher.',
      'Multiple-choice answers are marked automatically, and the teacher reviews the results for each quiz.',
      'Quizzes can also run in CBT exam mode, for test-style practice on a screen.',
      'A quiz only reaches students once the teacher publishes it.',
    ],
  },
  {
    cat: 'learn',
    q: 'How do results and report cards work?',
    lead: 'Teachers enter scores once, and results and report cards are then available to everyone who needs them.',
    points: [
      'Teachers enter scores by class and subject on the Results page.',
      'Principals review results and report cards across the whole school.',
      'Students see their own results and report cards in their dashboard.',
      'Parents see their child\u2019s results as they are published, with a switcher for families who have more than one child at the school.',
      'Schools can design and issue graduation certificates, which students can view and download.',
      'Teachers can get help drafting end-of-term report card comments from their AI assistant.',
    ],
  },
  {
    cat: 'learn',
    q: 'How do attendance, timetables and the syllabus work?',
    lead: 'Daily school routines move from paper registers into the app, and everyone sees the same information.',
    points: [
      'Teachers mark attendance class by class, without a paper register.',
      'Parents can see their child\u2019s attendance record, and the school sees attendance trends on the principal\u2019s overview.',
      'Students and parents can check the timetable at any time.',
      'Teachers track syllabus coverage, so it is clear what has been taught and what is left.',
    ],
  },
  {
    cat: 'learn',
    q: 'Can we run exams on SchoolOS?',
    lead: 'Yes. Exam officers get tools for the whole exam period, and students can sit quizzes in CBT exam mode.',
    points: [
      'Create exam sessions and build an exam timetable.',
      'Assign invigilators to sessions and venues.',
      'Record exam-day attendance for each session.',
      'Log incidents such as malpractice, and keep exam documents together.',
      'Review exam results from the same dashboard.',
    ],
  },
  {
    cat: 'learn',
    q: 'What can the AI assistants do?',
    lead: 'Every role has its own AI assistant, which can use the school\u2019s real figures and walk people through the app step by step.',
    points: [
      'Students get an AI Tutor for explanations, practice questions with worked solutions, WAEC, NECO and JAMB-style preparation, and study plans.',
      'Teachers get help with lesson plans, quiz questions and end-of-term report card comments.',
      'Principals get an insights assistant that reads live enrolment, results, fee and attendance figures.',
      'Bursars can have fee reminder messages drafted for them.',
      'Parents get plain-language help understanding results and supporting learning at home.',
      'Step-by-step answers include buttons that open the right screen in the app.',
    ],
    note: 'The assistants only draft. Announcements, quizzes and reminders are never published or sent until a person has reviewed them.',
  },

  // ── Running the school ──
  {
    cat: 'school',
    q: 'How are school fees collected?',
    lead: 'Through Paystack, with payments paid out to your school\u2019s own account.',
    points: [
      'Parents pay in the app, from their phone, without a trip to the school office.',
      'Each payment produces an instant digital receipt.',
      'Your bursar sees payments reflected in the dashboard in real time, so the school\u2019s records and the parent\u2019s receipt always agree.',
      'A platform fee of 3% applies to each online payment, and it never exceeds \u20a610,000 per payment, however large the payment.',
    ],
  },
  {
    cat: 'school',
    q: 'What can our bursar do in SchoolOS?',
    lead: 'The bursar gets a complete finance desk, from the first invoice to the final report.',
    points: [
      'Invoices are generated automatically each term for every enrolled student, based on your fee structures.',
      'Record a payment against an invoice and a receipt is created automatically, ready to download as a PDF.',
      'See debtors at a glance and send fee reminders to parents.',
      'Track school expenses alongside fee income.',
      'Produce financial reports and export your data when you need it.',
      'Schools that deal in more than one currency can set their own exchange rates.',
    ],
  },
  {
    cat: 'school',
    q: 'How do parents, teachers and the school stay in touch?',
    lead: 'Messages, announcements and meetings all live inside SchoolOS, so important news is not lost in crowded group chats.',
    points: [
      'Parents can message teachers or the school office from their dashboard.',
      'Announcements can go to everyone, or only to teachers, students, parents or staff.',
      'Notices and a school calendar keep events and deadlines visible.',
      'Parent-teacher meetings are arranged in the app.',
      'Notifications alert people to new messages and updates.',
    ],
  },
  {
    cat: 'school',
    q: 'Does SchoolOS cover boarding, health, the library and sports?',
    lead: 'Yes. Specialist staff get their own dashboards, so these jobs do not have to live in notebooks.',
    points: [
      'Hostel wardens manage rooms, roll call, incidents, maintenance requests and student leave requests.',
      'Nurses keep health records, log clinic visits, track medications and manage clinic stock.',
      'Teachers and parents can see important medical and allergy flags for the pupils concerned.',
      'Counselors schedule sessions, track cases and manage referrals.',
      'Librarians run the catalog and book checkouts, and students and parents can browse the library.',
      'Coaches manage teams, matches and training schedules.',
    ],
  },
  {
    cat: 'school',
    q: 'What can a principal see at a glance?',
    lead: 'A live picture of the whole school, so decisions are based on real numbers rather than guesses.',
    points: [
      'Overview cards for enrolment, revenue, attendance and pending fees.',
      'A School Health Score that brings attendance, fee and performance trends together.',
      'Analytics, results and report cards across every class.',
      'Staff, student and class management, access codes, promotions, transfers and alumni records.',
      'Announcements, meetings and leadership tools for the school team.',
    ],
  },

  // ── Safety & data ──
  {
    cat: 'safe',
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
    cat: 'safe',
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
    cat: 'safe',
    q: 'What happens to our data if we stop using SchoolOS?',
    lead: 'Your school\u2019s data belongs to your school.',
    points: [
      'Contact SchoolOS support before closing your account and ask for an export of your records.',
      'Doing this first means you keep your results, attendance and other records for your own files.',
    ],
  },
]

export default function FaqSection() {
  const [category, setCategory] = useState<Category | 'all'>('all')
  const [openQ, setOpenQ] = useState<string | null>(FAQS[0].q)

  const visible = category === 'all' ? FAQS : FAQS.filter(f => f.cat === category)

  return (
    <section className="page-content">
      <div className={styles.headingRow}>
        <h2 className="h2">Frequently asked questions</h2>
      </div>

      <div className={styles.chips} role="group" aria-label="Filter questions by topic">
        {CATEGORIES.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            aria-pressed={category === key}
            className={`${styles.chip} ${category === key ? styles.chipActive : ''}`}
            onClick={() => { setCategory(key); setOpenQ(null) }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className={styles.list}>
        {visible.map(item => {
          const isOpen = openQ === item.q
          return (
            <div key={item.q} className={`${styles.item} glass-card`}>
              <button
                type="button"
                className={styles.question}
                aria-expanded={isOpen}
                onClick={() => setOpenQ(isOpen ? null : item.q)}
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
