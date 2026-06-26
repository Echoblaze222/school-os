'use client'
// src/app/privacy/page.tsx

import { useRouter } from 'next/navigation'
import styles from './privacy.module.css'

const DATA_TABLE = [
  { service: 'Supabase',   purpose: 'Database hosting and authentication',  link: 'supabase.com/privacy' },
  { service: 'Vercel',     purpose: 'Platform hosting and delivery',         link: 'vercel.com/legal/privacy-policy' },
  { service: 'Paystack',   purpose: 'Payment processing',                    link: 'paystack.com/privacy' },
  { service: 'Resend',     purpose: 'Transactional emails',                  link: 'resend.com/privacy' },
  { service: 'Anthropic',  purpose: 'AI features (Claude API)',              link: 'anthropic.com/privacy' },
]

const SECTIONS = [
  {
    number: '01',
    title: 'Introduction',
    body: `Echoblaze ("we", "us", "our") operates SchoolOS, a school management platform built for Nigerian schools. This Privacy Policy explains what personal data we collect, how we use it, how we protect it, and your rights regarding it.\n\nBy using SchoolOS, your school agrees to the practices described in this policy. This policy applies to all users of the platform: Principals, Teachers, Bursars, Secretaries, Students, and Parents.`,
  },
  {
    number: '02',
    title: 'Who This Policy Covers',
    intro: 'This policy covers:',
    items: [
      'School administrators (Principals, Secretaries) who register and manage the school account',
      'Staff members (Teachers, Bursars) whose accounts are created by the school',
      'Students whose records are entered into the platform by the school',
      'Parents/Guardians who are linked to student accounts by the school',
    ],
  },
  {
    number: '03',
    title: 'Data We Collect',
    groups: [
      {
        label: 'From schools during registration',
        items: [
          'School name, type, address, city, and state',
          'School email address and phone number',
          'School logo and brand colour',
          'Principal\'s full name, email address, and phone number',
        ],
      },
      {
        label: 'From staff accounts',
        items: [
          'Full name, email address, phone number',
          'Role, assigned classes or subjects',
          'Platform activity (attendance records marked, grades posted, notes uploaded)',
        ],
      },
      {
        label: 'From student records',
        items: [
          'Full name, class level, admission number',
          'Academic records (assignments, grades, results, attendance)',
          'Guardian/parent contact information',
        ],
      },
      {
        label: 'From parents',
        items: [
          'Full name, email address, phone number',
          'Messages sent through the platform',
        ],
      },
      {
        label: 'Automatically collected',
        items: [
          'Login timestamps and session activity',
          'Device type and browser (for security and compatibility)',
          'IP address (for fraud prevention)',
        ],
      },
      {
        label: 'Payment data',
        items: [
          'We do not collect or store card numbers or bank account details. All payment processing is handled entirely by Paystack under their own privacy policy.',
        ],
      },
    ],
  },
  {
    number: '04',
    title: 'How We Use Your Data',
    intro: 'We use the data collected solely to:',
    items: [
      'Operate and deliver the SchoolOS platform to your school',
      'Create and manage user accounts and access codes',
      'Send onboarding emails, welcome messages, and access credentials',
      'Process and confirm subscription payments via Paystack',
      'Send subscription renewal reminders and receipts',
      'Provide AI-powered features (data is processed by Anthropic\'s API under strict data handling terms)',
      'Investigate security incidents or policy violations',
      'Improve the platform based on usage patterns (anonymised)',
    ],
    footer: 'We do not use your data to serve advertisements. We do not sell your data to any third party.',
  },
  {
    number: '05',
    title: 'Data Sharing',
    body: 'We share data only with the following trusted third parties, strictly to operate the platform. No other third parties receive your data.',
    table: true,
  },
  {
    number: '06',
    title: 'Student Data — Special Protections',
    intro: 'We take the privacy of students seriously. The following protections apply specifically to student data:',
    items: [
      'Student records are only accessible to users within the same school, based on their role permissions',
      'No student\'s data is ever visible to another school on the platform',
      'Student data is never used for advertising, profiling, or sold to any third party',
      'Parents can only view data for their own linked children — never for any other student',
      'Schools are responsible for obtaining appropriate parental consent before enrolling students on the platform',
    ],
  },
  {
    number: '07',
    title: 'Data Isolation Between Schools',
    body: `Every school's data on SchoolOS is completely isolated from every other school. This is enforced at the database level using Row Level Security (RLS) policies in PostgreSQL — not just at the interface level. A user from School A cannot access any data from School B under any circumstances, including direct API access.`,
  },
  {
    number: '08',
    title: 'Data Retention',
    items: [
      'Active school data is retained for as long as the school maintains an account on SchoolOS',
      'If a school\'s subscription expires, the school enters read-only mode. Data is not deleted immediately',
      'If a school requests account deletion, all school data will be permanently deleted within 30 days of the confirmed request',
      'Payment records may be retained for up to 7 years for accounting and legal compliance purposes',
    ],
  },
  {
    number: '09',
    title: 'Security',
    intro: 'We implement the following security measures to protect your data:',
    items: [
      'All passwords are hashed using bcrypt — never stored in plain text',
      'User sessions are managed via secure, HTTP-only cookies that expire automatically',
      'All data is transmitted over HTTPS/TLS encryption',
      'Database access is protected by Row Level Security at the PostgreSQL engine level',
      'Paystack webhook events are verified using HMAC-SHA512 cryptographic signatures',
      'Sensitive Super-Admin operations require secondary PIN verification',
    ],
    footer: 'No system is perfectly secure. In the event of a data breach affecting your school, we will notify you within 72 hours of becoming aware of it.',
  },
  {
    number: '10',
    title: 'Your Rights',
    intro: 'As a school administrator or individual user, you have the right to:',
    items: [
      'Access — request a copy of the personal data we hold about you or your school',
      'Correction — request that inaccurate data be corrected',
      'Deletion — request that your data be deleted (subject to legal retention requirements)',
      'Export — request an export of your school\'s data in a portable format',
      'Objection — object to how we process your data in specific circumstances',
    ],
    footer: 'To exercise any of these rights, contact us at piussimon717@gmail.com. We will respond within 14 business days.',
  },
  {
    number: '11',
    title: 'NDPR Compliance',
    intro: 'SchoolOS is committed to compliance with the Nigeria Data Protection Regulation (NDPR) issued by NITDA. This includes:',
    items: [
      'Processing personal data only on lawful grounds',
      'Collecting only data that is necessary for the stated purpose',
      'Not transferring personal data outside Nigeria without adequate safeguards',
      'Respecting the rights of data subjects as outlined above',
      'Maintaining appropriate technical and organisational security measures',
    ],
  },
  {
    number: '12',
    title: 'Cookies',
    body: `SchoolOS uses only essential cookies — specifically, a secure session cookie to keep you logged in. We do not use advertising cookies, tracking cookies, or third-party analytics cookies.`,
  },
  {
    number: '13',
    title: "Children's Data",
    body: `SchoolOS serves schools that enrol students of all ages, including minors. We do not directly collect data from children. All student data is entered and managed by the school (the data controller). Schools are responsible for ensuring they have appropriate parental or guardian consent before adding a student's data to the platform.`,
  },
  {
    number: '14',
    title: 'Changes to This Policy',
    body: `We may update this Privacy Policy from time to time. When we do, we will update the date at the top of this page and notify schools via platform notification or email if the changes are material. Continued use of SchoolOS after changes take effect means you accept the updated policy.`,
  },
  {
    number: '15',
    title: 'Contact Us',
    body: `For any privacy-related questions, data requests, or concerns:\n\nEchoblaze — SchoolOS Privacy\nEmail: piussimon717@gmail.com\nWebsite: school-os-sphg.vercel.app`,
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
            ← Back
          </button>
          <div className={styles.badge}>Legal</div>
          <h1 className={styles.title}>Privacy Policy</h1>
          <p className={styles.subtitle}>
            We take the privacy of your school, staff, and students seriously. Here is exactly what we collect, why, and how we protect it.
          </p>
          <p className={styles.lastUpdated}>Last updated: June 2026 · Echoblaze</p>
        </div>

        {/* Sections */}
        <div className={styles.sections}>
          {SECTIONS.map((s) => (
            <div key={s.number} className={styles.section}>
              <div className={styles.sectionNumber}>{s.number}</div>
              <div className={styles.sectionBody}>
                <h2 className={styles.sectionTitle}>{s.title}</h2>

                {s.intro && <p className={styles.sectionIntro}>{s.intro}</p>}

                {s.body && s.body.split('\n\n').map((para, i) => (
                  <p key={i} className={styles.sectionText}>{para}</p>
                ))}

                {/* Grouped lists (Section 03) */}
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
                          <th className={styles.th}>Their Policy</th>
                        </tr>
                      </thead>
                      <tbody>
                        {DATA_TABLE.map((row, i) => (
                          <tr key={i} className={styles.tr}>
                            <td className={styles.td}><strong>{row.service}</strong></td>
                            <td className={styles.td}>{row.purpose}</td>
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
            Your data belongs to you. SchoolOS processes it only to run your school's platform — nothing more.
          </p>
          <div className={styles.footerLinks}>
            <button className={styles.footerLink} onClick={() => router.push('/terms')}>
              Terms &amp; Conditions →
            </button>
            <button className={styles.footerLink} onClick={() => router.push('/login')}>
              Back to Login →
            </button>
          </div>
          <p className={styles.copyright}>© 2026 Echoblaze · SchoolOS · Built in Nigeria</p>
        </div>

      </div>
    </div>
  )
}
