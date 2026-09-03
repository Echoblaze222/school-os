// src/app/api/cron/expire-pending-schools/route.ts
// Vercel Cron Job - configure in vercel.json:
// { "path": "/api/cron/expire-pending-schools", "schedule": "0 3 * * *" }
// (daily at 3am is plenty - these thresholds are measured in days, not
// minutes, see lib/expirePendingSchools.ts for why)
//
// Sweeps school registrations that were created but never paid for:
//   - flags them (non-destructive) after PENDING_SCHOOL_FLAG_AFTER_HOURS
//   - deletes them (school + principal auth user/profile + placeholder
//     subscription + seeded subjects + uploaded logo) after
//     PENDING_SCHOOL_DELETE_AFTER_HOURS
// Both env vars are optional; see lib/expirePendingSchools.ts for defaults.
//
// Protected by CRON_SECRET env var (same pattern as every other
// /api/cron/* route in this codebase).
//
// Supports a manual dry run for safely checking what a real run WOULD do
// before trusting it, without deploying anything or waiting for the
// schedule:
//   curl -H "Authorization: Bearer $CRON_SECRET" \
//     "https://<your-domain>/api/cron/expire-pending-schools?dryRun=true"

import { NextResponse } from 'next/server'
import { expirePendingSchools } from '@/lib/expirePendingSchools'
import { logger, newTraceId } from '@/lib/logger'

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const traceId = newTraceId()
  const { searchParams } = new URL(req.url)
  const dryRun = searchParams.get('dryRun') === 'true'

  try {
    const result = await expirePendingSchools({ dryRun })

    logger.info('cron/expire-pending-schools run complete', {
      traceId,
      dryRun,
      flaggedCount: result.flagged.length,
      deletedCount: result.deleted.length,
      skippedCount: result.skipped.length,
      errorCount:   result.errors.length,
    })

    return NextResponse.json({ ok: true, traceId, ...result })
  } catch (err: any) {
    logger.error('cron/expire-pending-schools failed', { traceId, error: err.message })
    return NextResponse.json({ ok: false, traceId, error: err.message }, { status: 500 })
  }
}
