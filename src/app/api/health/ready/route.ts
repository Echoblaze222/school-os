// src/app/api/health/ready/route.ts
// Readiness check: "can this instance actually serve traffic right
// now". Pings the database with a trivial query and reports degraded
// external dependencies without leaking configuration details.
//
// Deliberately unauthenticated (an orchestrator/uptime monitor can't
// hold a session), so keep the response body free of anything
// sensitive — status booleans and latency numbers only, never table
// names, error internals, or connection strings.
import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function GET() {
  const checks: Record<string, { ok: boolean; latencyMs?: number }> = {}
  let overallOk = true

  try {
    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const start = Date.now()
    const { error } = await admin.from('profiles').select('id', { head: true, count: 'exact' }).limit(1)
    const latencyMs = Date.now() - start

    checks.database = { ok: !error, latencyMs }
    if (error) overallOk = false
  } catch {
    checks.database = { ok: false }
    overallOk = false
  }

  return NextResponse.json(
    { status: overallOk ? 'ok' : 'degraded', checks },
    { status: overallOk ? 200 : 503 }
  )
}
