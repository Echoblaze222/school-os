'use client'
// src/app/privacy/page.tsx

import { useRouter } from 'next/navigation'
import styles from './privacy.module.css'

const DATA_TABLE = [
  { service: 'Supabase',  purpose: 'Database hosting, authentication, file storage', data: 'All platform data (this is the primary database)', link: 'supabase.com/privacy' },
  { service: 'Vercel',    purpose: 'Application hosting and content delivery', data: 'All data in transit through the platform', link: 'vercel.com/legal/privacy-policy' },
  { service: 'Paystack',  purpose: 'Payment processing for subscriptions and fee payments', data: 'Payer name, email, phone, and payment amount. We never receive or store card or bank details.', link: 'paystack.com/privacy' },
  { service: 'Resend',    purpose: 'Transactional email (onboarding, receipts, reminders)', data: 'Recipient name, email address, and email content', link: 'resend.com/privacy' },
  { service: 'Anthropic (Claude)', purpose: 'Primary AI assistant features', data: 'Chat prompts and a role-relevant data summary (see Section 15)', link: 'anthropic.com/privacy' },
  { service: 'Google (Gemini)', purpose: 'Backup AI provider, used automatically if Claude is unavailable', data: 'The same data sent to Anthropic, on a fallback basis', link: 'policies.google.com/privacy' },
  { service: 'LiveKit',   purpose: 'Live video classes and video call infrastructure', data: 'Audio, video, and participant metadata for live sessions', link: 'livekit.io/legal/privacy-policy' },
]

const SECTIONS = [
  {
    number: '01',
    title: 'Introduction',
    body: `Echoblaze ("we", "us", "our") operates SchoolOS, a school management platform built for Nigerian schools. This Privacy Policy explains what personal data we collect, how we use it, how we protect it, and your rights regarding it.

By using SchoolOS, your school agrees to the practices described in this policy. This policy applies to everyone whose data is processed through SchoolOS, whether or not they hold their own login, including students whose records are entered by school staff.`,
  },
  {
    number: '02',
    title: 'Who This Policy Covers',
    intro: 'SchoolOS is used by many different types of school staff and community members. This policy covers the personal data of:',
    items: [
      'Principal: full administrative access to their school',
      'Vice Principal: school-wide operational access, plus authority over assigned departments',
      'Teacher: access to their assigned classes, subjects, and students',
      'Bursar: financial records, fee management, payment processing',
      'Secretary: administrative records, admissions, staff/student records',
      'Librarian: library catalogue and loan records',
      'Nurse: student health and medical records, clinic visits, medication administration',
      'Counselor: confidential counseling cases, notes, sessions, and referrals',
      'Coach: sports team rosters and records',
      'Examination Officer: exam scheduling, invigilation, incident records, results oversight',
      'Hostel/Boarding Staff: room assignments, leave requests, roll call, incident records',
      'ICT Officer: technical support tickets, device/account administration',
      'Student: their own academic, attendance, and personal records',
      'Parent/Guardian: records for their own linked children only',
    ],
  },
  {
    number: '03',
    title: 'Data We Collect: Identity, Account & School Data',
    groups: [
      {
        label: 'Identity and account data',
        items: [
          'Full name, email address, phone number',
          'Role and, where applicable, appointment (e.g. Vice Principal, Head of Department, class teacher)',
          'Profile photo / avatar, where uploaded',
          'Login credentials (passwords are never stored in plain text; see Section 10)',
          'Access codes issued to staff, students, and parents for account setup',
        ],
      },
      {
        label: 'School data',
        items: [
          'School name, type, address, city, state, contact details',
          'School logo and brand colour',
          'Principal\u2019s full name, email, and phone number',
          'Subscription and billing history',
        ],
      },
      {
        label: 'Technical data, collected automatically',
        items: [
          'Login timestamps and session activity',
          'IP address and browser/device type (for security and fraud prevention)',
          'Push notification device tokens, where notifications are enabled',
        ],
      },
    ],
  },
  {
    number: '04',
    title: 'Data We Collect: Academic & Financial Data',
    groups: [
      {
        label: 'Academic data',
        items: [
          'Class, subject, and timetable assignments',
          'Attendance records',
          'Assignments, submissions, and grades',
          'Quiz and exam results, and (for CBT quizzes) individual question responses',
          'Report cards, transcripts, and academic history',
          'Syllabus and academic notes',
          'Certificates issued (e.g. graduation certificates); see Section 8 on public verification',
        ],
      },
      {
        label: 'Financial data',
        items: [
          'Fee structures, invoices, and payment records (amounts, dates, methods, receipt numbers)',
          'Payment claims submitted for bank-transfer payments, including any proof-of-payment file uploaded',
          'School expense records (bursar-facing only)',
        ],
      },
    ],
    footer: 'We do not collect or store card numbers or bank account details. All card/bank payment processing is handled entirely by Paystack, under their own privacy policy.',
  },
  {
    number: '05',
    title: 'Special Category Data: Health, Counseling & Discipline',
    groups: [
      {
        label: 'Health data (where a school uses the nurse/clinic feature)',
        items: [
          'Student health profiles, including known conditions and allergies',
          'Medical records and clinic visit history',
          'Medication administration records',
        ],
      },
      {
        label: 'Counseling data (where a school uses the counseling feature)',
        items: [
          'Counseling cases, session notes, and referrals for students referred to or seen by a school counselor',
        ],
      },
      {
        label: 'Disciplinary / behaviour records',
        items: [
          'Type of record, description, date, and the staff member who logged it',
        ],
      },
    ],
    footer: 'Health and counseling data are sensitive "special category" data. Health data access is restricted to staff with an active nurse appointment, the student themselves, their linked parent/guardian, and (for narrow safety-relevant knowledge such as an allergy) the student\u2019s class teachers. Counseling data is restricted to the specific counselor assigned to the case, verified by an active counseling appointment, and is not visible to other staff, other counselors, or (unless a school\u2019s own policy provides otherwise) parents by default. Neither is ever used for marketing, profiling, or shared outside the school.',
  },
  {
    number: '06',
    title: 'Communications, Live Classes & Recordings',
    groups: [
      {
        label: 'Communications data',
        items: [
          'Messages sent through the platform\u2019s chat feature, including group chats, direct messages, and file attachments',
          'Announcements and notices posted by staff',
          'Push and in-app notifications, and whether they have been read',
          'Meeting records and scheduling',
        ],
      },
      {
        label: 'Live video classes (where a school uses this feature, powered by LiveKit)',
        items: [
          'Audio and video during the live session',
          'A list of who joined a session and when',
          'Recordings of sessions, where a teacher chooses to record',
        ],
      },
    ],
    footer: 'Live classes may include minors. Recordings are stored and made available only within the class\u2019s own school. Schools should ensure students and parents are aware that classes may be recorded, consistent with the school\u2019s own policies.',
  },
  {
    number: '07',
    title: 'Hostel, Library & Admissions Data',
    groups: [
      {
        label: 'Hostel / boarding data',
        items: ['Room and bed assignments, leave requests and approval status, roll call records, incident and maintenance reports'],
      },
      {
        label: 'Library and extracurricular data',
        items: ['Library loan and checkout history; sports team rosters, positions, and match records'],
      },
      {
        label: 'Admissions data',
        items: ['Application form responses, uploaded admission documents, and communication during the application process'],
      },
    ],
  },
  {
    number: '08',
    title: 'Public Certificate Verification',
    body: `If a school issues a digital certificate (e.g. a graduation certificate) through SchoolOS, a verification link or QR code is generated. Anyone with that link can look up the certificate holder's full name, the school name, certificate type, graduation year, issue date, and current status (valid/revoked). No other information, such as contact details, grades, or other academic data, is exposed through this feature.

This is intentional and works like verifying the authenticity of a paper certificate, but it does mean a certificate holder's name becomes accessible to anyone who has or discovers the link.`,
  },
  {
    number: '09',
    title: 'How We Use Your Data',
    intro: 'We use the data collected solely to:',
    items: [
      'Operate and deliver the SchoolOS platform to your school',
      'Create and manage user accounts, roles, and access codes',
      'Send onboarding messages, credentials, receipts, and reminders',
      'Process and confirm subscription and fee payments',
      'Provide AI-assisted features as decision-support tools',
      'Enable communication features (chat, announcements, live classes)',
      'Investigate security incidents, fraud, or policy violations',
      'Improve the platform based on aggregated, de-identified usage patterns',
    ],
    footer: 'We do not use your data to serve advertisements. We do not sell your data to any third party.',
  },
  {
    number: '10',
    title: 'AI Assistant Interactions',
    intro: 'SchoolOS includes an AI assistant available to most staff roles and, in some cases, students and parents. When it is used:',
    items: [
      'The message you type is sent to Anthropic (Claude), and, as an automatic fallback if Claude is unavailable, to Google (Gemini)',
      'A summary of data relevant to your role and school is included as context: for example, a bursar\u2019s assistant may be given a summary of outstanding fees, a nurse\u2019s assistant may be given aggregate counts rather than named individual health details, and a counselor\u2019s assistant is scoped only to that counselor\u2019s own cases',
      'Conversation history with the assistant is stored so it has context across a session',
    ],
    footer: 'AI providers process this data to generate a response. AI features are decision-support tools only: they do not make final decisions about a student\u2019s grades, discipline, admission, health, or counseling care, and outputs should always be reviewed by a qualified staff member before being acted on.',
  },
  {
    number: '11',
    title: 'Data Sharing & Third-Party Processors',
    body: 'We share data only with the service providers below, strictly to operate the platform. No other third party receives your data.',
    table: true,
  },
  {
    number: '12',
    title: 'International Data Transfers',
    body: `Some of the service providers listed in Section 11 (including Supabase, Vercel, Anthropic, Google, and LiveKit) operate infrastructure outside Nigeria. This means personal data, including children's data, may be transferred and processed outside Nigeria in the course of operating the platform.

The Nigeria Data Protection Act 2023 requires appropriate safeguards for such transfers. We take steps to work only with providers who maintain appropriate data protection standards, and we are working toward formal data processing agreements with each provider as part of our ongoing compliance program.`,
  },
  {
    number: '13',
    title: 'Data Isolation Between Schools',
    body: `Every school's data on SchoolOS is isolated from every other school. This is enforced at the database level using Row Level Security policies, not just at the interface level. A user from one school cannot access another school's data under normal operation, including via direct API access.`,
  },
  {
    number: '14',
    title: 'Data Retention',
    items: [
      'Active school data is retained for as long as the school maintains an account on SchoolOS',
      'If a school\u2019s subscription lapses, the school enters a read-only state. Data is not deleted automatically',
      'On a verified request to close an account, school data is deleted within 30 days, subject to the exceptions below',
      'Payment records may be retained for longer where required for accounting, tax, or legal compliance purposes',
      'Certificate verification records may be retained indefinitely, to preserve the ability to verify a certificate\u2019s authenticity in future',
    ],
  },
  {
    number: '15',
    title: 'Security',
    intro: 'We implement the following measures to protect your data:',
    items: [
      'Passwords are hashed, never stored in plain text',
      'Sessions are managed via secure, expiring cookies',
      'All data in transit is encrypted (HTTPS/TLS)',
      'Database-level access controls restrict data by school and role, independent of the application code',
      'Payment webhook events are cryptographically verified',
      'Sensitive administrative actions require additional verification',
      'The platform undergoes periodic security review',
    ],
    footer: 'No system is perfectly secure. In the event of a data breach affecting your school, we will notify you without undue delay and, where required, within the timeframe set by the Nigeria Data Protection Act 2023.',
  },
  {
    number: '16',
    title: 'Your Rights',
    intro: 'Subject to the Nigeria Data Protection Act 2023, you have the right to:',
    items: [
      'Access: request a copy of the personal data we hold about you or your school',
      'Correction: request that inaccurate data be corrected',
      'Deletion: request that your data be deleted, subject to legal retention requirements',
      'Portability: request an export of your data in a portable format',
      'Objection: object to how we process your data in specific circumstances',
      'Restriction: request that processing of your data be limited in certain circumstances',
    ],
    footer: 'For students and other users whose accounts are managed by a school, these requests are ordinarily made through the school. You also have the right to lodge a complaint with the Nigeria Data Protection Commission (NDPC). To exercise any of these rights directly with us, contact piussimon717@gmail.com. We will respond within 14 business days.',
  },
  {
    number: '17',
    title: 'Nigeria Data Protection Act 2023 Compliance',
    intro: 'SchoolOS is committed to compliance with the Nigeria Data Protection Act 2023 and the Nigeria Data Protection Commission (NDPC)\u2019s regulations. This includes:',
    items: [
      'Processing personal data only on lawful grounds',
      'Collecting only data that is necessary for the stated purpose',
      'Taking appropriate steps for any transfer of personal data outside Nigeria (see Section 12)',
      'Respecting the rights of data subjects as outlined above',
      'Maintaining appropriate technical and organisational security measures',
    ],
  },
  {
    number: '18',
    title: 'Cookies',
    body: `SchoolOS uses essential cookies only: specifically, a secure session cookie required to keep you logged in. We do not use advertising cookies, tracking cookies, or third-party analytics cookies.`,
  },
  {
    number: '19',
    title: 'Push Notifications',
    body: `If you enable notifications, we store a device token used solely to deliver notifications from SchoolOS to your device. Browser (web) push notifications are active; Android push notifications via Firebase Cloud Messaging are a planned feature not yet active in production.`,
  },
  {
    number: '20',
    title: "Children's Data",
    body: `SchoolOS serves schools that enrol students of all ages, including minors. We do not directly collect data from children through a public sign-up flow. All student data is entered and managed by the school (acting as data controller for its own records), typically after the school has obtained appropriate consent from a parent or guardian under its own enrollment process.

Schools are responsible for ensuring they have appropriate parental or guardian consent before adding a student's data to the platform, including for health, counseling, and live-class-recording features. We do not use children's data for advertising or behavioural profiling.`,
  },
  {
    number: '21',
    title: 'Changes to This Policy',
    body: `We may update this Privacy Policy from time to time. When we do, we will update the date at the top of this page and notify schools via platform notification or email if the changes are material. Continued use of SchoolOS after changes take effect means you accept the updated policy.`,
  },
  {
    number: '22',
    title: 'Contact Us',
    body: `For any privacy-related questions, data requests, or concerns:\n\nEchoblaze, SchoolOS Privacy\nEmail: piussimon717@gmail.com`,
  },
]

export default function PrivacyPage() {
  const router = useRouter()

  return (
    <div className={styles.page}>
      <div className={styles.bgGlow} />
      <div className={styles.bgGrid} />

      <div className={styles.container}>

        {/* Header */}
        <div className={styles.header}>
          <button className={styles.backBtn} onClick={() => router.back()}>
            \u2190 Back
          </button>
          <div className={styles.badge}>Legal</div>
          <h1 className={styles.title}>Privacy Policy</h1>
          <p className={styles.subtitle}>
            We take the privacy of your school, staff, and students seriously. Here is exactly what we collect, why, and how we protect it.
          </p>
          <p className={styles.lastUpdated}>Last updated: September 2026 \u00b7 Echoblaze</p>
        </div>

        {/* Sections */}
        <div className={styles.sections}>
          {SECTIONS.map((s) => (
            <div key={s.number} className={styles.section}>
              <div className={styles.sectionNumber}>{s.number}</div>
              <div className={styles.sectionBody}>
                <h2 className={styles.sectionTitle}>{s.title}</h2>

                {'intro' in s && s.intro && <p className={styles.sectionIntro}>{s.intro}</p>}

                {'body' in s && s.body && s.body.split('\n\n').map((para, i) => (
                  <p key={i} className={styles.sectionText}>{para}</p>
                ))}

                {/* Grouped lists */}
                {'groups' in s && s.groups && (
                  <div className={styles.groups}>
                    {s.groups.map((g, gi) => (
                      <div key={gi} className={styles.group}>
                        <p className={styles.groupLabel}>{g.label}</p>
                        <ul className={styles.list}>
                          {g.items.map((item, ii) => (
                            <li key={ii} className={styles.listItem}>
                              <span className={styles.listDot} />
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}

                {/* Regular list */}
                {'items' in s && s.items && !('groups' in s) && (
                  <ul className={styles.list}>
                    {s.items.map((item, i) => (
                      <li key={i} className={styles.listItem}>
                        <span className={styles.listDot} />
                        {item}
                      </li>
                    ))}
                  </ul>
                )}

                {/* Third-party table */}
                {'table' in s && s.table && (
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th className={styles.th}>Service</th>
                          <th className={styles.th}>Purpose</th>
                          <th className={styles.th}>What Data</th>
                          <th className={styles.th}>Their Policy</th>
                        </tr>
                      </thead>
                      <tbody>
                        {DATA_TABLE.map((row, i) => (
                          <tr key={i} className={styles.tr}>
                            <td className={styles.td}><strong>{row.service}</strong></td>
                            <td className={styles.td}>{row.purpose}</td>
                            <td className={styles.td}>{row.data}</td>
                            <td className={styles.td}>
                              <span className={styles.tableLink}>{row.link}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {'footer' in s && s.footer && (
                  <p className={styles.sectionFooter}>{s.footer}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <p className={styles.footerText}>
            Your data belongs to you. SchoolOS processes it only to run your school's platform, nothing more.
          </p>
          <div className={styles.footerLinks}>
            <button className={styles.footerLink} onClick={() => router.push('/terms')}>
              Terms &amp; Conditions \u2192
            </button>
            <button className={styles.footerLink} onClick={() => router.push('/login')}>
              Back to Login \u2192
            </button>
          </div>
          <p className={styles.copyright}>\u00a9 2026 Echoblaze \u00b7 SchoolOS \u00b7 Built in Nigeria</p>
        </div>

      </div>
    </div>
  )
}
