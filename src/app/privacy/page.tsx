// src/app/privacy/page.tsx
// Privacy Policy. Content lives in this file as data; the layout (white page,
// black text, contents list, print styles) is src/components/legal/LegalDocument.tsx.
//
// Keep this in step with what the platform really does. When a feature that
// touches personal data changes (a new provider, a new kind of record, a new
// cookie), update the matching section here and bump the version and date.

import type { Metadata } from 'next'
import LegalDocument, { type LegalSection } from '@/components/legal/LegalDocument'

export const metadata: Metadata = {
  title: 'Privacy Policy | SchoolOS',
  description: 'How SchoolOS collects, uses, shares and protects personal data.',
}

const SUMMARY = [
  'Each school decides what student, staff and parent data is entered into SchoolOS. For that data the school is the controller and Echoblaze is its processor.',
  'We never sell personal data and we never show advertising.',
  'Health and counseling records are restricted to the staff and family members who need them.',
  'Some of our service providers operate outside Nigeria. We use safeguards for those transfers.',
  'You can ask to access, correct or delete your data, and you can complain to the Nigeria Data Protection Commission.',
]

const SECTIONS: LegalSection[] = [
  {
    title: 'Introduction',
    paragraphs: [
      'This Privacy Policy explains how Echoblaze ("Echoblaze", "we", "us") collects, uses, shares and protects personal data through SchoolOS (the "Platform"), a school management platform for Nigerian schools. The Platform includes our website, web application and Android app.',
      'It applies to everyone whose personal data is processed through the Platform: school staff, students, parents and guardians, applicants for admission and visitors, whether or not they hold their own login. Student records are usually entered by school staff, so this policy also covers data you may never have typed in yourself.',
      'We process personal data in line with the Nigeria Data Protection Act 2023 ("NDPA") and the General Application and Implementation Directive 2025 issued by the Nigeria Data Protection Commission ("NDPC").',
    ],
  },
  {
    title: 'Our role: controller and processor',
    paragraphs: [
      'Each school that uses SchoolOS decides what personal data about its students, staff, parents and applicants is entered into the Platform, and why. For that school data, the school is the data controller and Echoblaze acts as the school\u2019s data processor, handling the data on the school\u2019s instructions in order to provide the Platform.',
      'Echoblaze is a data controller in its own right for the limited data it needs to run the Platform itself: sign-in and account security, audit and abuse-prevention records, billing records, accounts created directly with us on the public sign-up page, and support requests.',
      'If you are a student, parent or staff member and want to use a right over data that your school holds, please contact your school first (see Section 15).',
    ],
  },
  {
    title: 'Who this policy covers',
    intro: 'This policy covers the personal data of:',
    items: [
      'School leaders and staff: Principal, Vice Principal, Teachers, Bursar, Secretary, Librarian, Nurse, Counselor, Coach, Examination Officer, Hostel and Boarding Staff, and ICT Officer',
      'Students',
      'Parents and guardians, including the records of the children linked to their account',
      'Applicants for admission, and visitors who create an account on the public sign-up page',
      'Visitors who browse the public pages of the Platform',
    ],
  },
  {
    title: 'Personal data we collect',
    groups: [
      {
        label: 'Account and identity data',
        items: [
          'Full name, email address and phone number',
          'Role and appointment (for example Vice Principal, Head of Department or class teacher)',
          'Profile photograph, where uploaded',
          'Sign-in credentials. Passwords are stored only in hashed form, never in plain text',
          'Access codes issued by a school for account setup',
          'The date and time you accepted the Terms and this policy, and your onboarding progress',
        ],
      },
      {
        label: 'Identity verification data (onboarding)',
        items: [
          'During onboarding you may be asked to upload a passport photograph and to enter your National Identification Number (NIN)',
          'We send the NIN to our identity verification provider, Dojah, which checks it against the National Identity Management Commission (NIMC) database and returns the registered name, date of birth, gender, phone number and photograph so that you can confirm them',
          'We store your NIN, whether it was verified and when, a verification log entry, and the passport photograph you uploaded. We do not store the photograph returned by NIMC',
          'If live verification is not available, your NIN is recorded and may be reviewed later by your school administrator',
        ],
      },
      {
        label: 'School registration data',
        items: [
          'School name, type, address, city, state and contact details',
          'School logo and brand colour',
          'The Principal\u2019s full name, email address and phone number',
          'Subscription and billing history',
        ],
      },
      {
        label: 'Academic data',
        items: [
          'Classes, subjects and timetables',
          'Attendance records',
          'Assignments, submissions and grades',
          'Quiz and exam results, including individual answers to computer-based tests',
          'Report cards, transcripts, academic history, notes and syllabus content',
          'Certificates issued by a school (see Section 8)',
        ],
      },
      {
        label: 'Financial data',
        items: [
          'Fee structures, invoices and payment records (amounts, dates, methods, references and receipt numbers)',
          'Bank-transfer payment claims, including any proof-of-payment file uploaded',
          'School expense records, visible to bursar roles only',
          'We do not receive or store card numbers or bank login details. These are handled by Paystack',
        ],
      },
      {
        label: 'Health, counseling and discipline data (special category)',
        items: [
          'Health profiles, medical records, clinic visits and medication records, where a school uses the nurse feature',
          'Counseling cases, session notes and referrals, where a school uses the counseling feature',
          'Disciplinary and behaviour records: the type of record, a description, the date and the staff member who logged it',
          'Parental consent records kept by a school: the type of consent, whether it was granted, the method, the guardian\u2019s name and who recorded it',
        ],
      },
      {
        label: 'Communications data',
        items: [
          'Chat messages, group chats and attachments',
          'Announcements, notifications (including whether they were read), reminders you create, and meeting records',
          'Delivery records for email messages: the recipient address, the message content and the delivery status',
        ],
      },
      {
        label: 'Live classes',
        items: [
          'Audio and video during a live session, carried by our video provider, LiveKit',
          'Who joined, when they joined and left, and for how long',
          'Recordings, where a teacher chooses to record',
        ],
      },
      {
        label: 'Hostel, library, sports and admissions data',
        items: [
          'Room and bed assignments, leave requests, roll calls, incident and maintenance reports',
          'Library loan history, team rosters, positions and match records',
          'For admissions: the applicant\u2019s name, email address and phone number, the class applied for, form responses, uploaded documents, messages with the school and the status history of the application',
        ],
      },
      {
        label: 'Technical and security data',
        items: [
          'IP address, browser and device type, and sign-in times',
          'Audit log entries recording what action was taken, on which record, with the IP address and browser details',
          'Counters tied to an IP address or email address that limit repeated requests, used to block abuse',
          'Push notification subscriptions for each device on which you enable notifications',
          'A session cookie and an inactivity timer cookie (see Section 17)',
        ],
      },
      {
        label: 'Public pages',
        items: [
          'Accounts created on the public sign-up page: name, email address and the role chosen (parent or student)',
          'Anonymous counts of views and clicks on school promotions: an event type, a time and a session reference',
          'Reports made about public content: the reason, any details and optional contact information',
        ],
      },
    ],
  },
  {
    title: 'How we use personal data and why',
    paragraphs: [
      'We use personal data only for the purposes below, and only where we have a lawful basis under the NDPA.',
    ],
    table: {
      head: ['Purpose', 'Examples', 'Lawful basis'],
      rows: [
        ['Providing the Platform', 'Accounts and roles, school records, dashboards, report cards, timetables, attendance', 'Performance of a contract with the school; the school\u2019s own lawful basis for its records'],
        ['Identity verification and account security', 'NIN checks, sign-in security, session management, rate limiting, audit logs, abuse prevention', 'Legitimate interests in protecting users and the Platform; legal obligation where one applies'],
        ['Payments and billing', 'Fee payments, subscriptions, receipts, reconciliation', 'Performance of a contract; legal obligation for accounting and tax records'],
        ['Notifications and messages', 'In-app, push and email messages about your account and your school', 'Performance of a contract for service messages; your consent or preference for optional channels'],
        ['AI-assisted features', 'Answers from the assistant when you ask for them', 'Performance of a contract: you request the feature'],
        ['Health and counseling records', 'Clinic visits, medication records, counseling cases', 'The explicit consent of the person, or of the parent or guardian for a child, recorded by the school; or another ground the NDPA permits for health care and safety. The school is responsible for establishing the ground'],
        ['Improving and securing the Platform', 'Aggregated, de-identified usage patterns, fixing faults', 'Legitimate interests'],
        ['Legal compliance and disputes', 'Responding to lawful requests, protecting legal rights', 'Legal obligation; legitimate interests'],
      ],
    },
    footer: 'We do not use personal data for advertising. We do not sell personal data. We do not use children\u2019s data for behavioural profiling.',
  },
  {
    title: 'Notifications and messaging',
    paragraphs: [
      'Notifications appear inside the app and, if you enable them, as push notifications. Web push uses your browser\u2019s push service. On Android, where enabled, push notifications are delivered through Firebase Cloud Messaging, a Google service. We store one push subscription for each device you enable.',
      'Emails, such as onboarding messages, receipts and reminders, are sent through our email provider (Brevo or Resend). We keep a record of each email, including the recipient, subject and content, so that failed messages can be retried and delivery problems can be investigated. Security and account notices, and certain critical school alerts, are sent regardless of your notification settings.',
      'You can turn push notifications off at any time in your browser or device settings.',
    ],
  },
  {
    title: 'AI-assisted features',
    intro: 'SchoolOS includes an AI assistant that is available to most staff roles and, in some cases, to students and parents. When you use it:',
    items: [
      'The message you type is sent to Anthropic (Claude). If Claude is unavailable, it is sent to Google (Gemini) as a fallback',
      'A summary of data relevant to your role and school is included as context. For example, a bursar\u2019s assistant may receive a summary of outstanding fees, a nurse\u2019s assistant receives aggregate counts rather than named individual health details, and a counselor\u2019s assistant is limited to that counselor\u2019s own cases',
      'The conversation is stored so the assistant keeps context across a session',
    ],
    footer: 'AI features are decision-support tools only. They do not make final decisions about a student\u2019s grades, discipline, admission, health or care, and a qualified member of staff must review any output before acting on it.',
  },
  {
    title: 'Public certificate verification',
    paragraphs: [
      'When a school issues a digital certificate through SchoolOS, a verification link or QR code is created. Anyone who has that link can see the certificate holder\u2019s full name, the school name, the certificate type, the graduation year, the issue date and the current status (valid or revoked). No contact details, grades or other academic data are shown.',
      'This works like checking the authenticity of a paper certificate. It also means that a certificate holder\u2019s name is visible to anyone who has or finds the link.',
    ],
  },
  {
    title: 'Sharing and service providers',
    paragraphs: [
      'We share personal data only with the service providers below, and only as far as needed to operate the Platform. Each provider acts as our sub-processor and is bound by its own terms. We do not give personal data to anyone else except as described at the end of this section.',
    ],
    table: {
      head: ['Provider', 'What it does for us', 'Personal data involved'],
      rows: [
        ['Supabase', 'Database, sign-in and file storage', 'All Platform data'],
        ['Vercel', 'Application hosting and delivery', 'Data in transit and server logs'],
        ['Paystack', 'Payment processing for subscriptions and fee payments', 'Payer name, email address, phone number and amount. We never receive card or bank details'],
        ['Brevo or Resend', 'Transactional email', 'Recipient name, email address and email content'],
        ['Dojah, with NIMC', 'NIN verification during onboarding', 'The NIN you enter, and the identity details returned for you to confirm'],
        ['Anthropic', 'AI assistant (primary)', 'Your prompts and a role-relevant summary'],
        ['Google', 'AI assistant (fallback, Gemini) and Android push notifications (Firebase Cloud Messaging)', 'The same data as Anthropic when used as fallback; a device token and the notification text'],
        ['LiveKit', 'Live video classes', 'Audio, video and participant details for live sessions'],
        ['Browser push services (Google, Apple, Mozilla)', 'Deliver web push notifications to your browser', 'Your push subscription and the notification, transmitted in encrypted form'],
      ],
    },
    footer: 'We may also disclose personal data where the law, a court order or a request from the NDPC requires it, to protect people\u2019s safety or our legal rights, or to a successor if Echoblaze is acquired or merges, in which case you will be told and this policy will continue to apply.',
  },
  {
    title: 'International transfers',
    paragraphs: [
      'Several of the providers in Section 9, including Supabase, Vercel, Anthropic, Google, LiveKit, Brevo and Dojah, operate infrastructure outside Nigeria. Personal data, including children\u2019s data, may therefore be processed outside Nigeria while the Platform runs.',
      'The NDPA allows such transfers where the destination provides an adequate level of protection, or where other safeguards or permitted grounds apply. We choose providers that maintain recognised data protection standards and we use contractual terms and, where the law allows, other approved transfer mechanisms. We are continuing to put formal data processing agreements in place with each provider.',
    ],
  },
  {
    title: 'Separation between schools',
    paragraphs: [
      'Every school\u2019s data is kept separate from every other school\u2019s. This is enforced in the database itself through Row Level Security policies, and not only in the user interface. Under normal operation a user from one school cannot read another school\u2019s data, including through direct API access.',
    ],
  },
  {
    title: 'Retention',
    items: [
      'Active school data is kept for as long as the school has an account on SchoolOS',
      'If a school\u2019s service period ends without renewal, the school moves to a read-only state. Data is not deleted automatically',
      'On a verified request to close an account, school data is deleted within 30 days, subject to the exceptions in this section',
      'Payment records may be kept longer where accounting, tax or other law requires it',
      'Certificate verification records may be kept indefinitely so that a certificate can still be verified in future',
      'Email delivery records, audit logs and identity verification logs are kept while the account is active, because they are needed for security, troubleshooting and accountability, and are removed with the school\u2019s data when an account is closed, unless the law requires us to keep them',
    ],
  },
  {
    title: 'Security',
    intro: 'We protect personal data with technical and organisational measures that include:',
    items: [
      'Hashed passwords and secure, expiring sessions. A session ends automatically after 30 minutes of inactivity',
      'Encryption of data in transit (HTTPS and TLS)',
      'Database-level access controls that restrict data by school and by role, independent of the application code',
      'Rate limiting on sign-in, sign-up and other public endpoints',
      'Verification of signed payment webhook events and of internal service calls',
      'Audit logging of sensitive actions',
      'Periodic security review',
    ],
    footer: 'Uploaded files, such as profile photographs and chat attachments, are stored with our storage provider and opened through links. Anyone who has an exact link may be able to open the file, so please do not share links to files you want to keep private. No system is perfectly secure.',
  },
  {
    title: 'Personal data breaches',
    paragraphs: [
      'If a personal data breach occurs, we will notify the affected school without undue delay so that it can meet its own duties as controller. Where a breach is likely to put people\u2019s rights and freedoms at risk, we will notify the NDPC within 72 hours of becoming aware of it, as the NDPA requires. Where the risk to individuals is high, we will tell the people affected without delay and explain what happened, what data was involved and what they can do.',
    ],
  },
  {
    title: 'Your rights',
    intro: 'Under the NDPA you have the right to:',
    items: [
      'Be informed about how your data is used, which this policy is intended to do',
      'Access the personal data held about you',
      'Have inaccurate or incomplete data corrected',
      'Have your data erased, subject to legal retention requirements',
      'Restrict or object to certain processing',
      'Receive your data in a portable format',
      'Withdraw consent at any time, where processing is based on consent, without affecting what was done before',
      'Not be subject to a decision based solely on automated processing that has legal or similarly significant effects',
    ],
    after: [
      'For students and other users whose accounts are managed by a school, requests are normally made through the school, because the school is the controller. We will help the school to respond. You may also contact us directly at schoolosweb@gmail.com or on +2348086883144. We will reply within 14 business days, and we may ask you to confirm your identity first.',
      'You have the right to lodge a complaint with the Nigeria Data Protection Commission (NDPC) if you believe your data has been handled unlawfully.',
    ],
  },
  {
    title: 'Children',
    paragraphs: [
      'SchoolOS serves schools that enrol minors. We do not collect children\u2019s data through a public sign-up page for children. Student records are entered and managed by the school, which acts as controller and is responsible for having the consent of a parent or legal guardian before a student under 18 is added to the Platform, including for health, counseling and live-class recording features. The Platform includes a record of parental consents that schools can use for this purpose.',
      'A person under 18 should create an account on the public sign-up page only with the knowledge and permission of a parent or guardian. We do not use children\u2019s data for advertising or behavioural profiling. If you believe a child\u2019s data has been provided without proper consent, contact us and the school so that it can be reviewed and removed.',
    ],
  },
  {
    title: 'Cookies and local storage',
    paragraphs: [
      'SchoolOS uses only what is needed to run the service. We do not use advertising cookies, tracking cookies or third-party analytics cookies.',
    ],
    items: [
      'Session cookies keep you signed in',
      'An inactivity timer cookie records your last activity so that we can sign you out after 30 minutes of inactivity. It expires after the same period',
      'Browser storage keeps your choices on your device: your light or dark theme, the school you last selected, and notification and app preferences',
      'A service worker lets the app receive push notifications and work with a weaker connection',
    ],
  },
  {
    title: 'Changes to this policy',
    paragraphs: [
      'We may update this policy from time to time. The effective date and version at the top of this page show when it last changed. If a change is material, we will notify schools through a Platform notification or by email before it takes effect. Continued use of the Platform after a change takes effect means you accept the updated policy.',
    ],
  },
  {
    title: 'Contact',
    paragraphs: [
      'For privacy questions, to exercise a right, or to raise a concern, contact Echoblaze, SchoolOS Data Protection, by email at schoolosweb@gmail.com or by phone on +2348086883144.',
    ],
  },
]

export default function PrivacyPage() {
  return (
    <LegalDocument
      title="Privacy Policy"
      subtitle="How SchoolOS collects, uses, shares and protects the personal data of schools, staff, students and families."
      effective="10 November 2026"
      version="3.0"
      summary={SUMMARY}
      sections={SECTIONS}
      relatedHref="/terms"
      relatedLabel="Terms and Conditions"
    />
  )
}
