// src/app/api/health/route.ts
// Lightweight uptime probe used by the app's status banner and the
// /service-unavailable page to tell "the backend is down" apart from "this one
// request failed", so users are told once instead of retrying over and over.
//
// It only asks whether the database (PostgREST) and the auth service answer at
// all: any HTTP response below 500 counts as reachable. It reads nothing
// private, the response bodies are discarded, and it uses the public anon key,
// never the service-role key. The result is cached for a few seconds per
// server instance so a crowd of retrying clients cannot hammer the database.
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const CHECK_TIMEOUT_MS = 4000
const CACHE_MS = 5000

type Part = 'ok' | 'down'

interface HealthResult {
  status: 'ok' | 'degraded' | 'down'
  database: Part
  auth: Part
  checkedAt: string
}

let cached: { at: number; result: HealthResult } | null = null

async function reach(url: string, init: RequestInit): Promise<Part> {
  try {
    const res = await fetch(url, {
      ...init,
      cache: 'no-store',
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    })
    return res.status < 500 ? 'ok' : 'down'
  } catch {
    return 'down'
  }
}

async function runCheck(): Promise<HealthResult> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const checkedAt = new Date().toISOString()

  if (!base || !key) {
    return { status: 'down', database: 'down', auth: 'down', checkedAt }
  }

  const [database, auth] = await Promise.all([
    reach(`${base}/rest/v1/schools?select=id&limit=1`, {
      method: 'HEAD',
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    }),
    reach(`${base}/auth/v1/health`, { headers: { apikey: key } }),
  ])

  const status = database === 'ok' && auth === 'ok' ? 'ok' : database === 'down' && auth === 'down' ? 'down' : 'degraded'
  return { status, database, auth, checkedAt }
}

export async function GET() {
  const now = Date.now()
  if (!cached || now - cached.at > CACHE_MS) {
    cached = { at: now, result: await runCheck() }
  }
  const { result } = cached
  return NextResponse.json(result, {
    status: result.status === 'ok' ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  })
}
