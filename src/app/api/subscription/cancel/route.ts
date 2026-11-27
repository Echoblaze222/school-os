// src/app/api/subscription/cancel/route.ts
//
// RETIRED with the move to per-student billing: there is no school-level
// auto-renewal for a principal to stop or resume any more.

import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    { error: 'School-level auto-renewal no longer exists. Subscriptions are paid per student each term.' },
    { status: 410 },
  )
}
