// src/lib/expirePendingSchools.ts
//
// Cleans up school registrations that were created (school row + principal
// auth user + profile + placeholder subscription + seeded subjects) but
// never completed the setup-fee payment - i.e. is_platform_active stayed
// false because the person closed the Paystack tab, the charge failed,
// or they just changed their mind. See api/schools/register/route.ts for
// how these rows get created, and lib/activateSchool.ts for how a
// *successful* payment flips is_platform_active to true (which is the
// only thing that ever takes a school out of this cron's reach).
//
// This does NOT touch schools that failed principal-profile creation
// mid-request - register/route.ts already deletes the school + auth user
// itself, synchronously, in that error branch. This cron only ever sees
// registrations that fully succeeded up to the "redirect to Paystack"
// step and then stalled.
//
// Two stages, both gated purely on `created_at` age (never on `status`,
// since register/route.ts is the only writer of `status: 'pending'` and
// nothing else in this codebase keeps it authoritative - is_platform_active
// is the one flag everything else already trusts, see select-school/page.tsx
// and middleware.ts):
//
//   1. FLAG  (default 72h / 3 days): non-destructive. Sets status:
//      'abandoned' purely so it's visible and filterable in /admin - the
//      row, the auth user, and the free-to-retry-with-this-email problem
//      are all still there, untouched.
//
//   2. DELETE (default 336h / 14 days): destructive. Removes the auth
//      user, principal profile, placeholder subscription, seeded
//      subjects, any uploaded logo, and the school row itself - in that
//      order, children before the schools row, since profiles_school_id_fkey
//      references schools.id and the FK's ON DELETE behavior isn't
//      something this code can assume. The main real-world payoff: it
//      frees the principal's email address so they can register again
//      with the same address instead of hitting "email already in use"
//      forever because their first attempt never got past checkout.
//
// Both thresholds are env-overridable so you can tune them without a
// deploy. A school is only ever in ONE bucket per run - already-flagged
// rows aren't re-flagged, and DELETE_AFTER always wins over FLAG_AFTER
// if a row is old enough for both (handles a row that was flagged in an
// earlier run and has now also crossed the delete threshold).

import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'

const DEFAULT_FLAG_AFTER_HOURS   = 72   // 3 days
const DEFAULT_DELETE_AFTER_HOURS = 336  // 14 days

function envHours(name: string, fallback: number): number {
  const raw = process.env[name]
  const parsed = raw ? Number(raw) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function hoursAgoIso(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
}

export interface ExpirePendingSchoolsResult {
  dryRun:  boolean
  flagged: { id: string; name: string; createdAt: string }[]
  deleted: { id: string; name: string; createdAt: string }[]
  errors:  { id: string; stage: 'flag' | 'delete'; message: string }[]
}

export async function expirePendingSchools(opts?: { dryRun?: boolean }): Promise<ExpirePendingSchoolsResult> {
  const dryRun = opts?.dryRun ?? false
  const admin  = createAdminClient()

  const flagAfterHours   = envHours('PENDING_SCHOOL_FLAG_AFTER_HOURS', DEFAULT_FLAG_AFTER_HOURS)
  const deleteAfterHours = envHours('PENDING_SCHOOL_DELETE_AFTER_HOURS', DEFAULT_DELETE_AFTER_HOURS)
  const flagCutoff   = hoursAgoIso(flagAfterHours)
  const deleteCutoff = hoursAgoIso(deleteAfterHours)

  const result: ExpirePendingSchoolsResult = { dryRun, flagged: [], deleted: [], errors: [] }

  // ── Stage 2 first: anything old enough to delete, delete - regardless
  // of whether it was ever flagged, so a missed flag pass never blocks
  // the delete pass. ──────────────────────────────────────────────────
  const { data: toDelete, error: deleteQueryError } = await admin
    .from('schools')
    .select('id, name, created_at')
    .eq('is_platform_active', false)
    .lte('created_at', deleteCutoff)

  if (deleteQueryError) {
    logger.error('expirePendingSchools: delete-candidate query failed', { error: deleteQueryError.message })
    result.errors.push({ id: 'query', stage: 'delete', message: deleteQueryError.message })
  }

  for (const school of toDelete ?? []) {
    if (dryRun) {
      result.deleted.push({ id: school.id, name: school.name, createdAt: school.created_at })
      continue
    }
    try {
      await deleteAbandonedSchool(admin, school.id)
      result.deleted.push({ id: school.id, name: school.name, createdAt: school.created_at })
      logger.info('expirePendingSchools: deleted abandoned school', { schoolId: school.id })
    } catch (err: any) {
      logger.error('expirePendingSchools: delete failed', { schoolId: school.id, error: err.message })
      result.errors.push({ id: school.id, stage: 'delete', message: err.message })
    }
  }

  const deletedIds = new Set(result.deleted.map(s => s.id))

  // ── Stage 1: flag anything past the shorter grace period that wasn't
  // just deleted above and isn't already flagged. ────────────────────
  const { data: toFlag, error: flagQueryError } = await admin
    .from('schools')
    .select('id, name, created_at, status')
    .eq('is_platform_active', false)
    .lte('created_at', flagCutoff)
    .neq('status', 'abandoned')

  if (flagQueryError) {
    logger.error('expirePendingSchools: flag-candidate query failed', { error: flagQueryError.message })
    result.errors.push({ id: 'query', stage: 'flag', message: flagQueryError.message })
  }

  for (const school of toFlag ?? []) {
    if (deletedIds.has(school.id)) continue // already handled above this run
    if (dryRun) {
      result.flagged.push({ id: school.id, name: school.name, createdAt: school.created_at })
      continue
    }
    try {
      const { error } = await admin
        .from('schools')
        .update({ status: 'abandoned', updated_at: new Date().toISOString() })
        .eq('id', school.id)
      if (error) throw error
      result.flagged.push({ id: school.id, name: school.name, createdAt: school.created_at })
      logger.info('expirePendingSchools: flagged abandoned school', { schoolId: school.id })
    } catch (err: any) {
      logger.error('expirePendingSchools: flag failed', { schoolId: school.id, error: err.message })
      result.errors.push({ id: school.id, stage: 'flag', message: err.message })
    }
  }

  return result
}

// Deletes every row created for a school at registration time, plus its
// auth user, plus its uploaded logo - children before the schools row.
// Each step is independently try/caught by the caller's outer try/catch,
// but we also don't let one missing/already-gone row here abort the
// rest: Supabase delete calls on a non-matching filter are a no-op, not
// an error, so this is naturally safe to re-run.
async function deleteAbandonedSchool(admin: ReturnType<typeof createAdminClient>, schoolId: string) {
  // 1. Find the principal so we can delete their auth user too.
  const { data: principal } = await admin
    .from('profiles')
    .select('id')
    .eq('school_id', schoolId)
    .eq('role', 'principal')
    .maybeSingle()

  // 2. Placeholder subscription row created at registration.
  await admin.from('subscriptions').delete().eq('school_id', schoolId)

  // 3. Feature flags - normally none exist yet for a school that never
  // got past payment, but harmless/no-op if there aren't any.
  await admin.from('feature_flags').delete().eq('school_id', schoolId)

  // 4. Seeded default subjects (seed_default_subjects RPC, called at
  // registration before payment).
  await admin.from('subjects').delete().eq('school_id', schoolId)

  // 5. Principal profile row - not FK-linked to auth.users in this
  // schema (no ON DELETE CASCADE to rely on), so delete it explicitly
  // rather than assuming deleting the auth user below will take it too.
  if (principal?.id) {
    await admin.from('profiles').delete().eq('id', principal.id)
    // 6. The actual auth user - this is what frees the email address up
    // for a real retry.
    const { error: authDeleteError } = await admin.auth.admin.deleteUser(principal.id)
    if (authDeleteError) {
      // Not fatal to the sweep - the school row below still gets cleaned
      // up regardless - but worth surfacing since it means the email is
      // still stuck. (A "user not found" error here is expected and
      // harmless if a previous run already got this far and failed
      // later; anything else deserves a look.)
      logger.warn('expirePendingSchools: auth user delete failed', {
        schoolId, principalId: principal.id, error: authDeleteError.message,
      })
    }
  }

  // 7. Any uploaded branding logo - register-school/page.tsx uploads to
  // school-assets/${schoolId}/logo.<ext> client-side after the API call
  // succeeds.
  const { data: files } = await admin.storage.from('school-assets').list(schoolId)
  if (files && files.length > 0) {
    await admin.storage.from('school-assets').remove(files.map(f => `${schoolId}/${f.name}`))
  }

  // 8. The school row itself, last, since profiles_school_id_fkey and
  // others reference it.
  const { error: schoolDeleteError } = await admin.from('schools').delete().eq('id', schoolId)
  if (schoolDeleteError) throw schoolDeleteError
}
