// src/lib/queue.ts
// Thin wrapper over the job_queue Postgres functions (see
// docs/lane1-production-foundation/02-job-queue-schema.sql).
//
// Use this from any route that currently loops-and-sends synchronously
// for a school-wide operation (bulk notifications, bulk report
// generation, CSV imports, reconciliation sweeps) — enqueue the job
// here and let /api/cron/process-queue drain it, instead of doing the
// work inline in the request/response cycle where a timeout or a
// crash mid-loop leaves no record of what did or didn't go out.

import type { SupabaseClient } from '@supabase/supabase-js'

export type JobType = 'bulk_notification' | 'report_generate' | 'reconciliation' | 'bulk_import'

export async function enqueueJob(
  adminClient: SupabaseClient,
  jobType: JobType,
  payload: Record<string, unknown>,
  options?: { schoolId?: string; runAfter?: Date; maxAttempts?: number }
): Promise<{ ok: true; jobId: number } | { ok: false; error: string }> {
  const { data, error } = await adminClient.rpc('enqueue_job', {
    p_job_type: jobType,
    p_payload: payload as never,
    p_school_id: options?.schoolId ?? null,
    p_run_after: (options?.runAfter ?? new Date()).toISOString(),
    p_max_attempts: options?.maxAttempts ?? 3,
  })

  if (error) {
    console.error(`[queue] enqueue failed for job_type=${jobType}:`, error.message)
    return { ok: false, error: error.message }
  }
  return { ok: true, jobId: data as number }
}
