// src/lib/offline/syncTables.ts
// CLIENT ONLY. Which tables are copied to the phone for offline READS, which columns
// of them, and for whom.
//
// This is a second, separate allowlist from OFFLINE_WRITABLE_TABLES in outbox.ts.
// Being readable offline does NOT make a table writable offline: results/grades,
// for example, are readable here but can only be written offline after the
// compare-and-flag step (Phase 5).
//
// RLS is still the authority for what the SERVER returns. This file decides what is
// worth keeping on a phone that can be lost or shared. Two rules matter:
//   1. Columns. Never copy credential-like or identity-document columns, whatever the
//      server would return. Tables listing `columns` request only those; every row is
//      also scrubbed on the way in (scrubRow), so a column added to a table later
//      cannot sneak a secret onto devices.
//   2. Scope. profiles_select_merged lets ANY signed-in user read EVERY profile of
//      their school, so a student's phone must not copy the whole school. profiles are
//      pulled per role (see profileScope).

export type Scope =
  | { kind: 'all' }
  | { kind: 'eq'; column: string; value: string }
  | { kind: 'in'; column: string; values: string[] }
  | { kind: 'none' }

export interface ScopeContext {
  userId: string
  role?: string | null
  /** Classes this user teaches, from the locally synced class_teachers rows. */
  classIds: string[]
}

export interface SyncTableConfig {
  table: string
  /** Explicit column list. Omit to request every column (rows are still scrubbed). */
  columns?: string[]
  /** Only pull rows whose `column` (a date or timestamp) is within the last `days`. */
  window?: { column: string; days: number }
  /** Narrow what this user copies. Default: everything RLS returns. */
  scope?: (ctx: ScopeContext) => Scope
}

/** Roles that legitimately work with the whole school's people list. */
const SCHOOL_WIDE_PROFILE_ROLES = new Set(['principal', 'vice-principal', 'vice_principal', 'secretary'])

/**
 * Who may be copied to this phone. Deliberately conservative:
 *  - students, parents and anything unknown: only themselves
 *  - teachers: the students of the classes they teach (plus themselves via identity)
 *  - principal / vice-principal / secretary: the whole school
 *  - super_admin and other roles: themselves
 */
export function profileScope(ctx: ScopeContext): Scope {
  const role = (ctx.role ?? '').toLowerCase()
  if (SCHOOL_WIDE_PROFILE_ROLES.has(role)) return { kind: 'all' }
  if (role === 'teacher' && ctx.classIds.length > 0) {
    return { kind: 'in', column: 'class_id', values: [...ctx.classIds].sort() }
  }
  return { kind: 'eq', column: 'id', value: ctx.userId }
}

/**
 * Columns of profiles that are safe to keep on a phone. NOT included on purpose:
 * email, phone, address, date_of_birth, nin*, temp_password, pin_hash,
 * secret_identifier, signature_url and default_code (an activation code).
 */
export const PROFILE_COLUMNS = [
  'id',
  'school_id',
  'full_name',
  'role',
  'avatar_url',
  'class_id',
  'class_level',
  'is_active',
  'gender',
  'admission_number',
  'created_at',
  'updated_at',
]

export const SYNC_TABLES: SyncTableConfig[] = [
  // Reference data: small, changes rarely, needed on almost every screen.
  { table: 'classes' },
  { table: 'subjects' },
  { table: 'class_teachers' }, // before profiles: teachers' class ids come from here
  { table: 'school_terms' },
  { table: 'timetable' },
  { table: 'profiles', columns: PROFILE_COLUMNS, scope: profileScope },
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

/**
 * Column names that must never be stored on a phone. Matches whole underscore-separated
 * words, so `is_pinned` is fine but `pin_hash`, `temp_password` and `nin_number` are not.
 */
export const FORBIDDEN_COLUMN =
  /(^|_)(password|passcode|pin|secret|token|hash|otp|nin|temp|signature|email|phone|address|dob|default_code)(_|$)|^date_of_birth$|^default_code$/i

/** Drop every forbidden key from a row before it is stored. */
export function scrubRow<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    if (FORBIDDEN_COLUMN.test(key)) continue
    out[key] = value
  }
  return out as T
}

/**
 * Synced tables the server publishes realtime events for (see the realtime_publication_*
 * migrations). profiles is left out on purpose: last_activity updates make it fire on
 * almost every click school-wide, which would turn into constant pulls. It is refreshed
 * by the periodic pull instead.
 */
export const REALTIME_SYNC_TABLES: ReadonlySet<string> = new Set([
  'announcements',
  'classes',
  'class_teachers',
  'results',
])
