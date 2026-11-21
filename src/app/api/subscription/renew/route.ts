// src/app/api/subscription/renew/route.ts
//
// RETIRED. Principals no longer pay a school-level subscription: billing is
// per student, paid by the parent or student via
// POST /api/student-subscription/initialize. Kept as a 410 so any stale client
// gets a clear answer instead of starting a payment that would charge the
// wrong party.

import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    { error: 'School-level renewal has been replaced by per-student subscriptions paid by parents and students.' },
    { status: 410 },
  )
}
