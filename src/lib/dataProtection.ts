// src/lib/dataProtection.ts
//
// Pure helpers for the NDPA (Nigeria Data Protection Act 2023) compliance
// tools: constants, deadline maths, the readiness checklist and the privacy
// notice template. No I/O, so it is trivially unit-testable.
//
// Not legal advice. The 72-hour breach window (NDPA s.40) is the one hard
// number baked in; everything else (request due dates, consent coverage
// threshold) is an internal target the school's DPO should confirm.

export const CONSENT_TYPES = [
  { id: 'data_processing', label: 'Processing of learner records' },
  { id: 'photo_media',     label: 'Photos and videos (website, social media, events)' },
  { id: 'biometric',       label: 'Biometric data (fingerprint or face attendance)' },
  { id: 'ai_features',     label: 'AI learning assistant' },
] as const

export type ConsentType = (typeof CONSENT_TYPES)[number]['id']
export const CONSENT_TYPE_IDS: string[] = CONSENT_TYPES.map(c => c.id)

export const CONSENT_METHODS = ['paper', 'in_person', 'portal'] as const
export const REQUEST_TYPES = ['access', 'correction', 'deletion', 'objection', 'portability'] as const
export const REQUEST_STATUSES = ['open', 'in_progress', 'completed', 'rejected'] as const
export const RISK_LEVELS = ['low', 'medium', 'high'] as const
export const BREACH_STATUSES = ['open', 'contained', 'closed'] as const

export const DEFAULT_REQUEST_DAYS = 30
export const BREACH_NOTIFY_HOURS = 72
export const CONSENT_COVERAGE_TARGET = 0.9

const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000

// ── Dates ──────────────────────────────────────────────────────────────────────

/** YYYY-MM-DD (UTC) for `received` plus `days`. */
export function defaultDueDate(received: Date, days: number = DEFAULT_REQUEST_DAYS): string {
  return new Date(received.getTime() + days * DAY_MS).toISOString().slice(0, 10)
}

export function isIsoDate(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))
}

function daysUntil(isoDate: string, now: Date): number {
  const [y, m, d] = isoDate.split('-').map(Number)
  const target = Date.UTC(y, m - 1, d)
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return Math.round((target - today) / DAY_MS)
}

// ── Breaches: the 72-hour clock ──────────────────────────────────────────────────────

export type BreachClockState = 'notified' | 'overdue' | 'due_soon' | 'open'

export function breachClock(
  b: { discovered_at: string; ndpc_notified_at: string | null },
  now: Date = new Date(),
): { state: BreachClockState; deadline: Date; hoursRemaining: number | null } {
  const deadline = new Date(new Date(b.discovered_at).getTime() + BREACH_NOTIFY_HOURS * HOUR_MS)
  if (b.ndpc_notified_at) return { state: 'notified', deadline, hoursRemaining: null }
  const hoursRemaining = Math.floor((deadline.getTime() - now.getTime()) / HOUR_MS)
  const state: BreachClockState = hoursRemaining < 0 ? 'overdue' : hoursRemaining < 24 ? 'due_soon' : 'open'
  return { state, deadline, hoursRemaining }
}

// ── Data subject requests ─────────────────────────────────────────────────────

export type RequestClockState = 'closed' | 'overdue' | 'due_soon' | 'open'

export function requestClock(
  r: { status: string; due_on: string },
  now: Date = new Date(),
): { state: RequestClockState; daysRemaining: number | null } {
  if (r.status === 'completed' || r.status === 'rejected') return { state: 'closed', daysRemaining: null }
  const daysRemaining = daysUntil(r.due_on, now)
  const state: RequestClockState = daysRemaining < 0 ? 'overdue' : daysRemaining <= 7 ? 'due_soon' : 'open'
  return { state, daysRemaining }
}

// ── Readiness checklist ────────────────────────────────────────────────────────

export interface DataProtectionSettings {
  dpo_name?: string | null
  dpo_email?: string | null
  dpo_phone?: string | null
  ndpc_registration_number?: string | null
  last_audit_return_year?: number | null
  last_audit_return_filed_on?: string | null
  privacy_notice_published_on?: string | null
}

export interface ChecklistInput {
  settings: DataProtectionSettings | null
  studentCount: number
  /** Students with a GRANTED data_processing consent on record. */
  consentedStudents: number
  overdueRequests: number
  overdueBreaches: number
  now?: Date
}

export interface ChecklistItem { id: string; label: string; ok: boolean; hint: string }

export function computeChecklist(input: ChecklistInput): { items: ChecklistItem[]; score: number } {
  const now = input.now ?? new Date()
  const s = input.settings ?? {}
  const has = (v: unknown) => typeof v === 'string' && v.trim().length > 0

  const coverage = input.studentCount > 0 ? input.consentedStudents / input.studentCount : 1

  const items: ChecklistItem[] = [
    {
      id: 'dpo',
      label: 'Data Protection Officer appointed',
      ok: has(s.dpo_name) && has(s.dpo_email),
      hint: 'Record the DPO\'s name and email under Settings.',
    },
    {
      id: 'registration',
      label: 'Registered with the NDPC',
      ok: has(s.ndpc_registration_number),
      hint: 'Enter your NDPC registration number under Settings.',
    },
    {
      id: 'audit_return',
      label: 'Latest Compliance Audit Return filed',
      ok: typeof s.last_audit_return_year === 'number' && s.last_audit_return_year >= now.getUTCFullYear() - 1,
      hint: `A return covering ${now.getUTCFullYear() - 1} should be on file. Record it under Settings once filed.`,
    },
    {
      id: 'privacy_notice',
      label: 'Privacy notice published to parents',
      ok: has(s.privacy_notice_published_on),
      hint: 'Use the Privacy notice tab, share it with parents, then record the date under Settings.',
    },
    {
      id: 'consents',
      label: `Consent recorded for ${Math.round(CONSENT_COVERAGE_TARGET * 100)}%+ of learners`,
      ok: coverage >= CONSENT_COVERAGE_TARGET,
      hint: `${input.consentedStudents} of ${input.studentCount} learners have a recorded data-processing consent.`,
    },
    {
      id: 'requests',
      label: 'No overdue data-subject requests',
      ok: input.overdueRequests === 0,
      hint: `${input.overdueRequests} request(s) past their due date.`,
    },
    {
      id: 'breaches',
      label: 'No breach past the 72-hour NDPC window',
      ok: input.overdueBreaches === 0,
      hint: `${input.overdueBreaches} breach(es) not yet reported to the NDPC within 72 hours.`,
    },
  ]

  const okCount = items.filter(i => i.ok).length
  return { items, score: Math.round((okCount / items.length) * 100) }
}

// ── Privacy notice template ──────────────────────────────────────────────────────

export interface PrivacyNoticeInput {
  schoolName: string
  dpoName?: string | null
  dpoEmail?: string | null
  dpoPhone?: string | null
  ndpcRegistrationNumber?: string | null
}

/**
 * A plain-language starting point for a school privacy notice (Markdown).
 * Items in [square brackets] must be completed or confirmed by the school;
 * the DPO or a lawyer should review it before it goes to parents.
 */
export function buildPrivacyNotice(i: PrivacyNoticeInput): string {
  const dpo = [i.dpoName, i.dpoEmail, i.dpoPhone].filter(Boolean).join(' | ') || '[Data Protection Officer name and contact]'
  const reg = i.ndpcRegistrationNumber?.trim() || '[NDPC registration number]'

  return `# Privacy Notice – ${i.schoolName}

*Draft template. Complete the items in [brackets] and have your Data Protection Officer or lawyer review it before sharing.*

## Who we are
${i.schoolName} ("the school") is the data controller for the personal data described below. NDPC registration: ${reg}.

## Our Data Protection Officer
${dpo}

## What we collect
- Learner identity and enrolment details (name, date of birth, gender, class, admission number, Learner Identification Number where issued).
- Parent or guardian names and contact details.
- Attendance, assessment results, report cards and teacher comments.
- Fee invoices and payment records.
- Health or welfare information a parent gives us, and nurse or counsellor records where those services are used.
- Photos and videos, only where consent has been given.
- [Add anything else you collect, for example biometric attendance or CCTV.]

## Why we use it
To enrol and teach learners, keep records, communicate with parents, collect fees, keep learners safe, and meet our legal duties to education authorities and examination bodies. Where we rely on consent (for example photos or biometrics), you can withdraw it at any time.

## Who we share it with
- Our school management platform provider and its hosting providers, who process data on our instructions.
- Our payment processor, for online fee payments.
- Education authorities and examination bodies where the law or an exam registration requires it.
- [Add any other recipients, for example transport or text-message providers.]

We do not sell personal data.

## How long we keep it
[State your retention periods, for example: while a learner is enrolled and for X years afterwards; financial records for Y years.]

## Children's data
Most of the data we hold is about children. We limit access to staff who need it for their role and take extra care with sensitive information.

## Your rights
You can ask us to: see the data we hold, correct it, erase it where the law allows, object to or restrict certain uses, receive it in a portable format, and withdraw consent. Contact the Data Protection Officer above. You also have the right to complain to the Nigeria Data Protection Commission (NDPC).

## If something goes wrong
If a personal data breach is likely to put you at risk, we will notify the NDPC within 72 hours of becoming aware of it and tell affected people without undue delay.

*Last updated: [date]*
`
}
