// src/app/api/health/live/route.ts
// Liveness check: "is this process running at all". Deliberately does
// NOT touch the database — a DB outage should make /health/ready fail,
// not /health/live, so an orchestrator doesn't restart healthy
// instances during a database incident.
import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({ status: 'ok' })
}
