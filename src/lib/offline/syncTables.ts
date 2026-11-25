// src/lib/offline/syncTables.ts
// CLIENT ONLY. Which tables are copied to the phone for offline READS.
//
// This is a second, separate allowlist from OFFLINE_WRITABLE_TABLES in outbox.ts.
// Being readable offline does NOT make a table writable offline: results/grades,
// for example, are readable here but can only be written offline after the
// compare-and-flag step (Phase 5).
//
// RLS is still the authority: a user only ever receives the rows the server lets
// them select, so a teacher gets their classes, a parent their children, and so on.

export interface SyncTableConfig {
  table: string
  /** Only pull rows whose `column` (a date or timestamp) is within the last `days`. */
  window?: { column: string; days: number }
}

export const SYNC_TABLES: SyncTableConfig[] = [
  // Reference data: small, changes rarely, needed on almost every screen.
  { table: 'classes' },
  { table: 'subjects' },
  { table: 'class_teachers' },
  { table: 'school_terms' },
  { table: 'timetable' },
  // Content
  { table: 'announcements' },
  { table: 'school_notes' },
  { table: 'syllabus' },
  { table: 'syllabus_topics' },
  { table: 'assignments' },
  { table: 'quizzes' },
  { table: 'events' },
  { table: 'school_events' },
  { table: 'meetings' },
  // Records: large, so only the recent window is kept on the phone.
  { table: 'attendance', window: { column: 'date', days: 120 } },
  { table: 'results' }, // read-only offline
  { table: 'behaviour_records' },
]

/** Tables that must never be copied to a device, whatever a future edit says. */
export const NEVER_SYNC: ReadonlySet<string> = new Set([
  'payments', 'payment_invoices', 'payment_claims', 'fee_structures', 'fee_payments', 'fee_reminders',
  'school_payments', 'subscriptions', 'subscription_payments', 'student_subscriptions', 'digital_receipts',
  'counseling_cases', 'counseling_notes', 'counseling_sessions', 'counseling_referrals', 'counseling_follow_ups',
  'student_medical_records', 'student_health_profiles', 'medication_administrations', 'clinic_visits',
  'profile_secrets', 'access_codes', 'access_code_applications', 'platform_admins',
  'ai_conversations', 'ai_messages', 'ai_action_drafts', 'idempotency_keys', 'rate_limit_attempts',
])

export function isSyncable(table: string): boolean {
  if (NEVER_SYNC.has(table)) return false
  return SYNC_TABLES.some((c) => c.table === table)
}
