'use client'
// src/app/terms/page.tsx

import { useRouter } from 'next/navigation'
import styles from './terms.module.css'

const SECTIONS = [
  {
    number: '01',
    title: 'Acceptance of Terms',
    body: `By registering a school on SchoolOS, or by accessing any part of the platform in any role, you agree to be bound by these Terms and Conditions and by our Privacy Policy, which is incorporated by reference. If you do not agree, do not use the platform.

If you are registering a school, you confirm that you are authorized to bind that school to these Terms.`,
  },
  {
    number: '02',
    title: 'The Service',
    intro: 'SchoolOS is a multi-role school management platform operated by Echoblaze for Nigerian schools. It provides tools for:',
    items: [
      'Academic management: classes, subjects, timetables, attendance, assignments, grading, results, report cards, and certificates',
      'Financial management: fee structures, invoicing, payment collection and tracking, expense records',
      'Communication: in-app chat, announcements, notifications, and meetings',
      'Live video classes and recordings',
      'Health and clinic records, where the school appoints a nurse',
      'Counseling records, where the school appoints a counselor',
      'Hostel/boarding management',
      'Library management',
      'Sports and extracurricular management',
      'Admissions processing',
      'AI-assisted decision support',
      'Role-based dashboards for Principal, Vice Principal, Teacher, Bursar, Secretary, Librarian, Nurse, Counselor, Coach, Examination Officer, Hostel/Boarding Staff, ICT Officer, Student, and Parent/Guardian',
    ],
    footer: 'Not every school will use every feature. Availability of specific features may depend on your subscription tier or plan.',
  },
  {
    number: '03',
    title: 'Account Registration',
    items: [
      'You must provide accurate and complete information when registering your school and its users',
      'The Principal account created at registration is the highest-privilege account for that school. The school is responsible for keeping its credentials secure',
      'Individual staff, student, and parent accounts are provisioned by the school via unique access codes. The school is responsible for distributing access codes only to the correct individuals, and for promptly revoking access when someone leaves the school',
      'Student and parent accounts are created and managed by the school on the relevant individual\u2019s behalf; SchoolOS does not independently verify the identity of students or parents beyond the access code the school issues them',
      'We reserve the right to suspend or terminate accounts where false information is provided, or where an access code is shared or used by someone other than its intended recipient',
    ],
  },
  {
    number: '04',
    title: 'Free Trial',
    body: `New schools may be offered a free trial period before a subscription payment is required. The length of the trial and any grace period after it ends are set out at registration and may vary. At the end of the trial, the school will need to complete payment to retain full access; unpaid schools enter the read-only mode described in Section 6.`,
  },
  {
    number: '05',
    title: 'Roles, Permissions & School Responsibility',
    intro: 'SchoolOS enforces role-based access so each user type sees only the data relevant to their function. The school is responsible for:',
    items: [
      'Appointing the correct role and permissions to each staff member',
      'Ensuring staff given access to sensitive features (health records, counseling records) are appropriately qualified and bound by the school\u2019s own confidentiality obligations',
      'Obtaining appropriate consent from parents/guardians before entering a student\u2019s data into the platform, including for health, counseling, and live-class-recording features',
      'Promptly removing or reassigning access when a staff member\u2019s role changes or ends',
    ],
  },
  {
    number: '06',
    title: 'Subscription and Payment',
    items: [
      'A one-time setup fee may apply before a school\u2019s account becomes fully active; this may be payable in installments where offered',
      'Ongoing access is billed per active student, per term, at a rate determined by the school\u2019s total active student count, with tiered pricing as published on the platform',
      'Schools may choose termly or discounted annual billing, as offered',
      'All payments are processed securely through Paystack. We do not store card or bank account details',
      'If a subscription is not renewed before it lapses, the school enters read-only mode: existing data remains accessible for viewing, but new records cannot be created or edited until payment resumes. Data is not deleted for non-payment alone',
      'Refunds are not issued for partial terms or unused periods, except at our sole discretion',
    ],
  },
  {
    number: '07',
    title: 'Acceptable Use',
    intro: 'You agree not to:',
    items: [
      'Use the platform for any unlawful purpose',
      'Attempt to access data belonging to another school, or to a user outside your own permitted role and scope',
      'Reverse-engineer, copy, scrape, or reproduce any part of the platform',
      'Upload malicious files, code, or content, or attempt to disrupt the platform\u2019s operation',
      'Misrepresent your identity, your role, or your school\u2019s information',
      'Share your login credentials or access code with anyone other than as intended by the school',
      'Use the chat, announcement, or live-class features to harass, threaten, or bully another user',
      'Record a live class or share a recording outside the school community without the school\u2019s authorization',
      'Rely on AI-generated output as a substitute for professional medical, psychological, legal, or safeguarding judgment',
    ],
  },
  {
    number: '08',
    title: 'Content and Data Ownership',
    body: `As between you and Echoblaze, your school's data (student records, staff records, messages, and all content you or your school enter into the platform) remains the property of your school. You grant Echoblaze a limited licence to host, process, and display that data solely for the purpose of providing the Service.

All platform software, design, branding, and underlying technology are the intellectual property of Echoblaze. Nothing in these Terms transfers that intellectual property to you.`,
  },
  {
    number: '09',
    title: 'AI Features',
    body: `SchoolOS integrates AI features, currently powered by Anthropic Claude, with Google Gemini as an automatic fallback. These features are decision-support tools only. AI output must be reviewed by a qualified person before being relied upon, and must never be treated as a substitute for professional medical, psychological, legal, or safeguarding judgment. Echoblaze is not liable for decisions made solely on the basis of AI-generated output without appropriate human review.`,
  },
  {
    number: '10',
    title: 'Live Classes and Recordings',
    body: `Where a school uses live video classes, sessions may be recorded at the teacher's discretion. The school is responsible for ensuring students and parents are informed that classes may be recorded, consistent with the school's own policies and applicable law. Recordings are accessible only within the relevant school's account.`,
  },
  {
    number: '11',
    title: 'Third-Party Services',
    body: `The Service relies on third-party infrastructure and processors, including Supabase, Vercel, Paystack, Resend, Anthropic, Google, and LiveKit, each described further in our Privacy Policy. Echoblaze is not responsible for outages, errors, or data handling by these providers beyond what Echoblaze can reasonably control through its own contracts with them.`,
  },
  {
    number: '12',
    title: 'Service Availability',
    body: `Echoblaze aims for high uptime but does not guarantee uninterrupted or error-free service. Scheduled maintenance, third-party outages, or events outside Echoblaze's control may cause temporary unavailability. Where reasonably possible, planned downtime will be communicated in advance.`,
  },
  {
    number: '13',
    title: 'Confidentiality',
    body: `Each party agrees to keep the other's confidential information (including, for the school, student and staff data, and for Echoblaze, its proprietary technology) confidential, and to use it only for the purposes of this agreement, except as required by law.`,
  },
  {
    number: '14',
    title: 'Indemnification',
    body: `Your school agrees to indemnify and hold Echoblaze harmless from claims, damages, or expenses arising from: (a) false or inaccurate information provided during registration or account setup; (b) the school's failure to obtain necessary consent before entering a student's data, including health, counseling, or recording-related data, into the platform; or (c) the school's or its users' breach of these Terms.`,
  },
  {
    number: '15',
    title: 'Termination',
    body: `Echoblaze may suspend or terminate a school's account for breach of these Terms, non-payment, or conduct that harms the platform or other users. A school may terminate its own account at any time by written request. On termination, the school may request an export of its data within 30 days, after which the data may be deleted in accordance with our Privacy Policy's retention provisions.`,
  },
  {
    number: '16',
    title: 'Warranty Disclaimer',
    body: `The Service is provided "as is" and "as available." Echoblaze disclaims all warranties, express or implied, including fitness for a particular purpose, to the maximum extent permitted by law. Echoblaze does not warrant that AI-generated output will be accurate, complete, or suitable for any particular decision.`,
  },
  {
    number: '17',
    title: 'Limitation of Liability',
    body: `To the maximum extent permitted by law, Echoblaze is not liable for indirect, incidental, or consequential damages arising from use of the platform, including loss of data, loss of revenue, or disruption to school operations. This limitation does not apply to liability for gross negligence, willful misconduct, fraud, death or personal injury caused by negligence, or any obligation that cannot be limited or excluded under the Nigeria Data Protection Act 2023 or other applicable law.

Subject to the above, Echoblaze's total liability arising from or relating to the Service is limited to the fees paid by the school in the three months preceding the event giving rise to the claim.`,
  },
  {
    number: '18',
    title: 'Force Majeure',
    body: `Neither party is liable for delay or failure to perform caused by events beyond its reasonable control, including natural disasters, internet or power infrastructure failures, government action, or third-party service outages.`,
  },
  {
    number: '19',
    title: 'General Provisions',
    items: [
      'Assignment: you may not assign or transfer your rights under these Terms without our written consent. We may assign these Terms in connection with a merger, acquisition, or sale of assets',
      'Severability: if any provision of these Terms is found unenforceable, the remaining provisions continue in full force and effect',
      'Entire agreement: these Terms, together with our Privacy Policy, constitute the entire agreement between you and Echoblaze regarding the Service',
    ],
  },
  {
    number: '20',
    title: 'Changes to These Terms',
    body: `We may update these Terms from time to time. Schools will be notified of material changes via platform notification or email. Continued use of the platform after changes take effect constitutes acceptance of the revised Terms.`,
  },
  {
    number: '21',
    title: 'Dispute Resolution & Governing Law',
    body: `The parties will first attempt to resolve any dispute informally through good-faith negotiation. These Terms are governed by the laws of the Federal Republic of Nigeria. Any disputes not resolved informally shall be submitted to the courts of Lagos State, Nigeria.`,
  },
  {
    number: '22',
    title: 'Contact',
    body: `For questions about these Terms, contact: piussimon717@gmail.com`,
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
            \u2190 Back
          </button>
          <div className={styles.badge}>Legal</div>
          <h1 className={styles.title}>Terms &amp; Conditions</h1>
          <p className={styles.subtitle}>
            Please read these terms carefully before registering your school or using the SchoolOS platform.
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
                {'items' in s && s.items && (
                  <ul className={styles.list}>
                    {s.items.map((item, i) => (
                      <li key={i} className={styles.listItem}>
                        <span className={styles.listDot} />
                        {item}
                      </li>
                    ))}
                  </ul>
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
            By using SchoolOS, you confirm that you have read, understood, and agreed to these Terms and Conditions.
          </p>
          <div className={styles.footerLinks}>
            <button className={styles.footerLink} onClick={() => router.push('/privacy')}>
              Privacy Policy \u2192
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
