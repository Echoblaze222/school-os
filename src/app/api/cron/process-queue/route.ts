// src/app/api/cron/process-queue/route.ts
// Drains pending rows from job_queue (see
// docs/lane1-production-foundation/02-job-queue-schema.sql).
//
// Two ways in, same drain logic:
//   GET  with `Authorization: Bearer $CRON_SECRET`   (Vercel Cron; needs a plan
//        that allows per-minute crons, so it is NOT usable on Hobby)
//   POST with `x-internal-secret: $INTERNAL_SECRET`  (pg_cron via net.http_post,
//        the same pattern as api/internal/email-retry). See
//        docs/ops/sql/2026-11-process-queue-cron.sql for the schedule.
//
// Add a case to `processJob` for each JobType as routes migrate from
// synchronous fan-out to enqueueJob(). Keep each handler idempotent —
// claim_pending_jobs() increments `attempts` before the handler runs,
// so a handler that partially completes and then throws WILL be
// retried; design each job body so re-running it is safe (e.g. upsert
// rather than insert, or check-then-act on what's already been sent).

import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { notifyUser } from '@/lib/notify/notifyUser'
import { logger, newTraceId } from '@/lib/logger'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

interface QueuedJob {
  id: number
  job_type: string
  payload: Record<string, unknown>
  school_id: string | null
}

async function processJob(admin: ReturnType<typeof adminClient>, job: QueuedJob, traceId: string) {
  switch (job.job_type) {
    case 'bulk_notification': {
      const { recipientIds, title, body, type, linkUrl, referenceId, referenceTable } = job.payload as {
        recipientIds: string[]; title: string; body: string; type: string
        linkUrl?: string; referenceId?: string; referenceTable?: string
      }
      if (!Array.isArray(recipientIds) || !job.school_id) {
        throw new Error('bulk_notification job missing recipientIds or school_id')
      }
      // Sequential-ish batches, not Promise.all across the whole list —
      // a school with thousands of parents shouldn't open thousands of
      // concurrent outbound sends from one worker invocation.
      const BATCH = 25
      for (let i = 0; i < recipientIds.length; i += BATCH) {
        const batch = recipientIds.slice(i, i + BATCH)
        await Promise.all(
          batch.map((recipientId) =>
            notifyUser({
              recipientId, schoolId: job.school_id!, title, body, type,
              linkUrl, referenceId, referenceTable,
            }).catch((err) => {
              logger.warn('bulk_notification recipient send failed', { traceId, recipientId, error: String(err) })
            })
          )
        )
      }
      return { sent: recipientIds.length }
    }

    // report_generate, reconciliation, bulk_import: not yet migrated to
    // the queue — their routes still run synchronously today. Add
    // cases here as each is moved over; see the Lane 1 report for
    // which routes are worth migrating first.
    default:
      throw new Error(`Unknown job_type: ${job.job_type}`)
  }
}

async function drainQueue() {
  const traceId = newTraceId()
  const admin = adminClient()
  const results = { completed: 0, failed: 0 }

  // One job_type per invocation keeps this simple; the scheduler calls this
  // route every minute or two so each type gets drained shortly after
  // being enqueued. If job_type variety grows, switch to fetching all
  // due types in one query instead of hardcoding this list.
  const jobTypes = ['bulk_notification', 'report_generate', 'reconciliation', 'bulk_import']

  for (const jobType of jobTypes) {
    const { data: jobs, error } = await admin.rpc('claim_pending_jobs', {
      p_job_type: jobType,
      p_limit: 20,
    })
    if (error) {
      logger.error('claim_pending_jobs failed', { traceId, jobType, error: error.message })
      continue
    }

    for (const job of (jobs ?? []) as QueuedJob[]) {
      try {
        await processJob(admin, job, traceId)
        await admin.rpc('complete_job', { p_id: job.id })
        results.completed++
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        logger.error('job processing failed', { traceId, jobId: job.id, jobType, error: message })
        await admin.rpc('fail_job', { p_id: job.id, p_error: message })
        results.failed++
      }
    }
  }

  logger.info('process-queue run complete', { traceId, ...results })
  return NextResponse.json({ ok: true, traceId, ...results })
}

export async function GET(req: Request) {
  // Refuse when CRON_SECRET is unset; otherwise the header "Bearer undefined"
  // would match the template string below.
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return drainQueue()
}

export async function POST(req: Request) {
  const secret = req.headers.get('x-internal-secret')
  if (!secret || secret !== process.env.INTERNAL_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return drainQueue()
}
