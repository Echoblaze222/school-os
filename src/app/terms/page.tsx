// src/app/terms/page.tsx
// Terms and Conditions. Content lives in this file as data; the layout (white
// page, black text, contents list, print styles) is
// src/components/legal/LegalDocument.tsx.
//
// Keep this in step with the product and with the Privacy Policy. When pricing,
// the free service period, or a feature changes, update the matching section
// here and bump the version and date.

import type { Metadata } from 'next'
import LegalDocument, { type LegalSection } from '@/components/legal/LegalDocument'

export const metadata: Metadata = {
  title: 'Terms and Conditions | SchoolOS',
  description: 'The terms that govern the use of SchoolOS by schools, staff, students and families.',
}

const SUMMARY = [
  'Registering a school is free. A school gets full access for an initial service period, currently four months. After that, a paid subscription may apply at the rates published on the Platform.',
  'The school owns its data. Echoblaze processes it only to provide SchoolOS, on the school\u2019s instructions.',
  'Schools are responsible for the accuracy of what they enter, for giving access only to the right people, and for obtaining parental consent for children.',
  'AI features support decisions. A qualified person must review their output.',
  'These Terms are governed by Nigerian law.',
]

const SECTIONS: LegalSection[] = [
  {
    title: 'Acceptance and eligibility',
    paragraphs: [
      'By registering a school on SchoolOS, or by using any part of the platform in any role, you agree to these Terms and Conditions ("Terms") and to our Privacy Policy, which forms part of these Terms. If you do not agree, do not use the platform.',
      'If you register a school or accept these Terms for a school, you confirm that you are authorised to bind that school.',
      'You must be at least 18 years old to register a school or to create an account yourself. Children use the platform through accounts that their school provides, or that are created with the knowledge and permission of a parent or guardian. If you are under 18, you must have the permission of your parent or guardian to use the platform.',
    ],
  },
  {
    title: 'Definitions',
    items: [
      '"Echoblaze", "we" and "us" mean the operator of SchoolOS',
      '"Platform" or "Service" means SchoolOS, including the website, web application, Android app and related services',
      '"School" means the institution that registers on the Platform',
      '"User" means anyone who uses the Platform, including school staff, students, parents and guardians, applicants and visitors',
      '"School Data" means the data that a School and its Users enter into the Platform, including student and staff records, messages and files',
    ],
  },
  {
    title: 'The Service',
    intro: 'SchoolOS is a multi-role school management platform for Nigerian schools. It provides tools for:',
    items: [
      'Academic management: classes, subjects, timetables, attendance, assignments, grading, results, report cards and certificates',
      'Financial management: fee structures, invoicing, payment collection and tracking, and expense records',
      'Communication: in-app chat, announcements, notifications and meetings',
      'Live video classes and recordings',
      'Health and clinic records, where the school appoints a nurse',
      'Counseling records, where the school appoints a counselor',
      'Hostel and boarding, library, and sports and extracurricular management',
      'Admissions, including applications from the public',
      'AI-assisted decision support',
      'Role-based dashboards for Principal, Vice Principal, Teacher, Bursar, Secretary, Librarian, Nurse, Counselor, Coach, Examination Officer, Hostel and Boarding Staff, ICT Officer, Student, and Parent or Guardian',
    ],
    footer: 'Not every School will use every feature, and the availability of some features may depend on the School\u2019s plan.',
  },
  {
    title: 'Accounts, access and security',
    items: [
      'You must give accurate and complete information when you register a School or create an account',
      'The Principal account created when a School registers has the highest level of access for that School. The School is responsible for keeping its credentials secure',
      'Staff, student and parent accounts are provisioned by the School using unique access codes. The School must give each code only to the right person and must promptly remove access when someone leaves or changes role',
      'A visitor may also create an account on the public sign-up page, without a School code, as a parent or student, in order to browse schools and send admission requests. Such an account does not belong to any School until a School admits the person or links the account',
      'Echoblaze does not independently verify the identity of students or parents beyond the access code a School issues, other than through the identity verification described in Section 5',
      'To protect accounts, a signed-in session ends automatically after 30 minutes of inactivity',
      'You are responsible for activity under your account. Tell us promptly if you suspect unauthorised use',
      'We may suspend or terminate an account where false information has been given, or where an access code or credentials are shared or used by someone other than the intended person',
    ],
  },
  {
    title: 'Identity verification',
    paragraphs: [
      'As part of onboarding, Users may be asked to verify their identity by entering a National Identification Number (NIN) and uploading a passport photograph. The NIN is checked against the National Identity Management Commission database through a third-party provider.',
      'You agree to provide only your own NIN and photograph and to keep the information accurate. If live verification is unavailable, your NIN may be recorded and reviewed later by your School administrator. We may restrict access to an account whose identity cannot be confirmed. How this data is handled is described in the Privacy Policy.',
    ],
  },
  {
    title: 'Free registration, service period and fees',
    items: [
      'Registering a School on SchoolOS is free. The School\u2019s account is activated on registration with access to the full Platform for an initial service period, which is currently four months from the registration date',
      'After the initial service period, continued access may require a paid subscription. Where a subscription applies, it is billed per active student, per term, at the tiered rates published on the Platform, with annual billing where offered. The rates published when you buy apply. We aim to give the Principal reasonable notice before a service period ends',
      'Payments to Echoblaze are processed by Paystack. We do not store card or bank account details',
      'If a service period or subscription lapses, the School moves to read-only mode: existing data can still be viewed, but new records cannot be created or edited until access is renewed. Data is not deleted for non-payment alone',
      'Fees are not refunded for part-used terms or unused periods, except at our discretion or where the law requires',
      'A School may use the Platform to invoice and collect its own fees (for example tuition, or admission fees) from students, parents or applicants. Those fees are set by the School, are owed to the School, and are the School\u2019s responsibility, including any refund or dispute. Echoblaze is not a party to them. Payments are processed by Paystack under its own terms',
    ],
  },
  {
    title: 'School responsibilities',
    intro: 'SchoolOS gives each type of User access only to the data relevant to their role. The School is responsible for:',
    items: [
      'Giving each staff member the correct role and permissions',
      'Making sure staff who can open sensitive records (health and counseling) are suitably qualified and bound by confidentiality',
      'Being the data controller of its School Data, and complying with the Nigeria Data Protection Act 2023, including having a lawful basis for the data it enters',
      'Obtaining the consent of a parent or guardian before entering a student\u2019s data into the Platform, including for health, counseling and live-class recording, and recording that consent where the Platform provides for it',
      'Telling students, parents and staff how their data is used, including that live classes may be recorded',
      'Promptly removing or reassigning access when a role changes or ends',
      'The accuracy and lawfulness of everything it and its Users upload or send',
    ],
  },
  {
    title: 'Acceptable use',
    intro: 'You agree not to:',
    items: [
      'Use the Platform for any unlawful purpose',
      'Try to access another School\u2019s data, or data outside your own role and permissions',
      'Reverse-engineer, copy, scrape or reproduce any part of the Platform',
      'Upload malicious files or code, or try to disrupt or overload the Platform, including by automated or bulk account creation or by getting around rate limits',
      'Misrepresent your identity, your role, your NIN or your School\u2019s details',
      'Share your credentials or access code with anyone other than as the School intends',
      'Use chat, announcements or live classes to harass, threaten or bully anyone, or to share unlawful content or content that exploits or endangers children',
      'Record a live class, or share a recording, outside the School community without the School\u2019s authorisation',
      'Treat AI output as a substitute for professional medical, psychological, legal or safeguarding judgment',
    ],
  },
  {
    title: 'Notifications and communications',
    paragraphs: [
      'By using the Platform you agree to receive service communications about your account and your School: in the app, by push notification, by email, and by SMS or WhatsApp where a phone number is on your profile. These communications are delivered through third-party providers described in the Privacy Policy. Message and data charges from your network may apply.',
      'You can manage optional channels in your notification settings. Security and account notices, and certain critical school alerts, cannot be switched off.',
    ],
  },
  {
    title: 'Content, data and licence',
    paragraphs: [
      'As between you and Echoblaze, School Data belongs to the School. The School grants Echoblaze a limited, non-exclusive licence to host, process, transmit and display School Data, and to use the providers described in the Privacy Policy, solely to provide, secure and support the Service.',
      'Echoblaze may use aggregated and de-identified information about how the Platform is used to operate and improve it. That information does not identify any School or person.',
    ],
  },
  {
    title: 'Data protection',
    paragraphs: [
      'For School Data, the School is the data controller and Echoblaze is the data processor. This section, together with the Privacy Policy, is the data processing agreement between them.',
    ],
    items: [
      'Echoblaze will process School Data only on the School\u2019s documented instructions, which are given by the School\u2019s use of the Platform, and as these Terms and the Privacy Policy describe',
      'Echoblaze will keep School Data confidential and will make sure that people who handle it are bound by confidentiality',
      'Echoblaze will apply appropriate technical and organisational security measures, as summarised in the Privacy Policy',
      'The School gives general authorisation for the sub-processors listed in the Privacy Policy. We will update that list when providers change and, where the change is material, tell the School in advance so it can object',
      'Echoblaze will help the School to respond to requests from data subjects and to meet its own obligations under the Nigeria Data Protection Act 2023, taking into account the nature of the processing',
      'Echoblaze will tell the School without undue delay after becoming aware of a personal data breach affecting its School Data',
      'On termination, Echoblaze will make School Data available for export and then delete it, as set out in Section 20, unless the law requires it to be kept',
      'Echoblaze will make available the information reasonably needed to show compliance with this section',
    ],
  },
  {
    title: 'AI-assisted features',
    paragraphs: [
      'SchoolOS includes AI features, currently provided through Anthropic (Claude), with Google (Gemini) as an automatic fallback. They are decision-support tools only. A qualified person must review AI output before anyone relies on it, and it must never replace professional medical, psychological, legal or safeguarding judgment. Echoblaze is not liable for decisions made solely on AI output without appropriate human review.',
    ],
  },
  {
    title: 'Live classes and recordings',
    paragraphs: [
      'Where a School uses live video classes, a teacher may choose to record a session. The School is responsible for making sure students and parents know that sessions may be recorded, in line with the School\u2019s own policies and applicable law. Recordings are available only within the relevant School\u2019s account.',
    ],
  },
  {
    title: 'Public features',
    items: [
      'Certificates: a School that issues a digital certificate understands that a link or QR code lets anyone who has it verify the holder\u2019s name, the School, the certificate type, the year and its status',
      'School profiles, promotions and rankings: information a School chooses to make public may be shown to the public. The School confirms that it has the right to publish it',
      'Promotions are subject to review. We may decline, remove or limit any public content that is inaccurate, unlawful, misleading or against these Terms',
      'Anyone can report public content through the Platform. We may act on reports at our discretion',
    ],
  },
  {
    title: 'Third-party services',
    paragraphs: [
      'The Service depends on third-party infrastructure and providers, including Supabase, Vercel, Paystack, Brevo, Resend, Termii, Dojah, Anthropic, Google and LiveKit, as described in the Privacy Policy. Echoblaze is not responsible for outages, errors or data handling by those providers beyond what it can reasonably control through its own agreements with them. Your use of a provider\u2019s own service, such as making a payment through Paystack, is also subject to that provider\u2019s terms.',
    ],
  },
  {
    title: 'Intellectual property',
    paragraphs: [
      'The Platform, including its software, design, branding and underlying technology, belongs to Echoblaze and its licensors. These Terms give you only a limited, non-exclusive, non-transferable right to use the Platform for its intended purpose while you are entitled to access it. Nothing in these Terms transfers any intellectual property to you. If you send us feedback or suggestions, we may use them without obligation to you.',
    ],
  },
  {
    title: 'Availability and changes to the Service',
    paragraphs: [
      'We aim for high availability but do not promise uninterrupted or error-free service. Maintenance, third-party outages or events outside our control can cause temporary unavailability. Where reasonably possible, we will give notice of planned downtime.',
      'We may improve, change or remove features over time. If we remove a feature that a School relies on in a way that materially reduces the Service, we will give reasonable notice where we can.',
    ],
  },
  {
    title: 'Confidentiality',
    paragraphs: [
      'Each party will keep the other\u2019s confidential information confidential and use it only for the purposes of this agreement, except where the law requires disclosure. For the School, confidential information includes School Data. For Echoblaze, it includes its proprietary technology.',
    ],
  },
  {
    title: 'Indemnification',
    paragraphs: [
      'The School will indemnify and hold Echoblaze harmless from claims, damages and expenses arising from: (a) false or inaccurate information given during registration or account setup; (b) the School\u2019s failure to obtain the consents required before entering a student\u2019s data, including health, counseling or recording-related data, into the Platform, or to have a lawful basis for the data it enters; or (c) the breach of these Terms by the School or its Users.',
    ],
  },
  {
    title: 'Suspension and termination',
    paragraphs: [
      'Echoblaze may suspend or terminate a School\u2019s account for breach of these Terms, for non-payment where a subscription applies, or for conduct that harms the Platform or other Users. Where it is reasonable to do so, we will tell the School first. A School may close its account at any time by written request.',
      'After termination, the School may ask for an export of its data within 30 days. After that, the data may be deleted in line with the retention terms in the Privacy Policy.',
    ],
  },
  {
    title: 'Disclaimers',
    paragraphs: [
      'To the fullest extent the law allows, the Service is provided "as is" and "as available". Echoblaze does not give any warranty, express or implied, including fitness for a particular purpose. Echoblaze does not warrant that AI output will be accurate, complete or suitable for any particular decision, or that identity verification by a third party will always be available or correct.',
    ],
  },
  {
    title: 'Limitation of liability',
    paragraphs: [
      'To the fullest extent the law allows, Echoblaze is not liable for indirect, incidental or consequential loss arising from the use of the Platform, including loss of data, revenue or disruption to school operations. This limit does not apply to liability for gross negligence, wilful misconduct, fraud, death or personal injury caused by negligence, or anything that cannot be limited or excluded under the Nigeria Data Protection Act 2023 or other applicable law.',
      'Subject to that, Echoblaze\u2019s total liability arising from or relating to the Service is limited to the fees the School paid in the three months before the event that gave rise to the claim. Where a School has paid no fees in that period, the limit is NGN 100,000.',
    ],
  },
  {
    title: 'Force majeure',
    paragraphs: [
      'Neither party is liable for delay or failure to perform caused by events beyond its reasonable control, including natural disasters, failures of internet or power infrastructure, government action and third-party outages.',
    ],
  },
  {
    title: 'Governing law and disputes',
    paragraphs: [
      'These Terms are governed by the laws of the Federal Republic of Nigeria. The parties will first try to resolve any dispute informally through good-faith negotiation. A dispute that is not resolved that way will be submitted to the courts of Lagos State, Nigeria.',
    ],
  },
  {
    title: 'General',
    items: [
      'Assignment: you may not transfer your rights under these Terms without our written consent. We may assign these Terms in connection with a merger, acquisition or sale of assets',
      'Severability: if a provision is found unenforceable, the rest of these Terms continues in force',
      'Waiver: a failure to enforce a right is not a waiver of that right',
      'Notices: we may give notice by email, by a notification in the Platform, or by posting on this page',
      'Entire agreement: these Terms and the Privacy Policy are the whole agreement between you and Echoblaze about the Service',
    ],
  },
  {
    title: 'Changes to these Terms',
    paragraphs: [
      'We may update these Terms from time to time. The effective date and version at the top of this page show when they last changed. We will notify Schools of material changes through a Platform notification or by email before they take effect. Continued use of the Platform after changes take effect means you accept the updated Terms.',
    ],
  },
  {
    title: 'Contact',
    paragraphs: [
      'For questions about these Terms, contact Echoblaze at piussimon717@gmail.com.',
    ],
  },
]

export default function TermsPage() {
  return (
    <LegalDocument
      title="Terms and Conditions"
      subtitle="The terms that govern the use of SchoolOS by schools, staff, students and families."
      effective="10 November 2026"
      version="3.0"
      summary={SUMMARY}
      sections={SECTIONS}
      relatedHref="/privacy"
      relatedLabel="Privacy Policy"
    />
  )
}
