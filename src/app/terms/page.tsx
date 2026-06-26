'use client'
// src/app/terms/page.tsx

import { useRouter } from 'next/navigation'
import styles from './terms.module.css'

const SECTIONS = [
  {
    number: '01',
    title: 'Acceptance of Terms',
    body: `By registering a school on SchoolOS or accessing any part of the platform, you — the school owner, principal, or authorised representative — agree to be bound by these Terms and Conditions. If you do not agree, do not use the platform.`,
  },
  {
    number: '02',
    title: 'The Service',
    body: `SchoolOS is a multi-role school management platform provided by Echoblaze. It gives schools a digital environment for managing administration, academics, finance, and communication across six roles: Principal, Teacher, Bursar, Secretary, Student, and Parent.`,
  },
  {
    number: '03',
    title: 'Account Registration',
    items: [
      'You must provide accurate and complete information during registration.',
      'The Principal account created at registration is the highest-privilege account in your school. You are responsible for keeping its credentials secure.',
      'Each user receives a unique access code. You are responsible for distributing these codes only to the correct individuals.',
      'SchoolOS reserves the right to suspend or terminate accounts where false information is provided.',
    ],
  },
  {
    number: '04',
    title: 'Subscription & Payment',
    items: [
      'A one-time setup fee is required before your school gains access to the platform.',
      'Ongoing access is billed per-student, per-term, based on your selected plan (Basic, Standard, or Premium).',
      'All payments are processed securely through Paystack. SchoolOS does not store your card or bank details.',
      'Subscriptions extend four months from the date of confirmed payment.',
      'If your subscription expires and is not renewed, your school enters read-only mode. No data will be deleted.',
      'Refunds are not issued for partial terms or unused periods, except at the sole discretion of Echoblaze.',
    ],
  },
  {
    number: '05',
    title: 'Installment Payments',
    body: `If you choose the installment payment option for the setup fee, you commit to completing all installment payments on the agreed schedule. Failure to complete installments may result in restricted access until the outstanding balance is cleared.`,
  },
  {
    number: '06',
    title: 'Acceptable Use',
    intro: 'You agree not to:',
    items: [
      'Use the platform for any unlawful purpose',
      'Attempt to access data belonging to another school',
      'Reverse-engineer, copy, or reproduce any part of the platform',
      'Upload malicious files, code, or content',
      'Misrepresent your identity or your school\'s information',
      'Share login credentials across multiple users',
    ],
  },
  {
    number: '07',
    title: 'Data & Privacy',
    items: [
      'Each school\'s data is completely isolated from all other schools on the platform.',
      'Student and staff data collected through SchoolOS is used solely to operate the platform for your school.',
      'SchoolOS does not sell your data to third parties.',
      'You are responsible for obtaining appropriate consent from parents and guardians before enrolling students on the platform.',
      'Full details are in our Privacy Policy.',
    ],
  },
  {
    number: '08',
    title: 'AI Features',
    body: `SchoolOS integrates AI tools powered by Anthropic Claude. These features are provided as decision-support tools. SchoolOS and Echoblaze are not liable for decisions made based on AI-generated output. AI responses should be reviewed by a qualified person before acting on them.`,
  },
  {
    number: '09',
    title: 'Uptime & Service Availability',
    body: `SchoolOS aims for maximum uptime but does not guarantee uninterrupted service. Scheduled maintenance, third-party outages (Supabase, Vercel, Paystack), or events outside our control may cause temporary unavailability. We will communicate planned downtime in advance where possible.`,
  },
  {
    number: '10',
    title: 'Intellectual Property',
    body: `All platform code, design, branding, and features are the intellectual property of Echoblaze. Your school's data remains your property. You grant SchoolOS a limited licence to process your data solely for the purpose of providing the service.`,
  },
  {
    number: '11',
    title: 'Termination',
    body: `Echoblaze reserves the right to suspend or terminate any school account that violates these Terms, fails to make payment, or engages in conduct that harms the platform or other users. Upon termination, you may request an export of your school's data within 30 days.`,
  },
  {
    number: '12',
    title: 'Limitation of Liability',
    body: `SchoolOS and Echoblaze are not liable for any indirect, incidental, or consequential damages arising from your use of the platform, including loss of data, loss of revenue, or disruption to school operations. Our total liability is limited to the amount paid by your school in the three months preceding any claim.`,
  },
  {
    number: '13',
    title: 'Changes to These Terms',
    body: `Echoblaze may update these Terms from time to time. Schools will be notified of material changes via platform notification or email. Continued use of the platform after changes take effect constitutes acceptance.`,
  },
  {
    number: '14',
    title: 'Governing Law',
    body: `These Terms are governed by the laws of the Federal Republic of Nigeria. Any disputes shall be resolved in the courts of Lagos State, Nigeria.`,
  },
  {
    number: '15',
    title: 'Contact',
    body: `For questions about these Terms, contact us at: piussimon717@gmail.com`,
  },
]

export default function TermsPage() {
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
          <h1 className={styles.title}>Terms &amp; Conditions</h1>
          <p className={styles.subtitle}>
            Please read these terms carefully before registering your school or using the SchoolOS platform.
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
                {s.body && <p className={styles.sectionText}>{s.body}</p>}
                {s.items && (
                  <ul className={styles.list}>
                    {s.items.map((item, i) => (
                      <li key={i} className={styles.listItem}>
                        <span className={styles.listDot} />
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <p className={styles.footerText}>
            By using SchoolOS, you confirm that you have read, understood, and agreed to these Terms and Conditions.
          </p>
          <div className={styles.footerLinks}>
            <button className={styles.footerLink} onClick={() => router.push('/privacy')}>
              Privacy Policy →
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
