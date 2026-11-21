// src/app/api/student-subscription/callback/route.ts
//
// Browser redirect from Paystack after a per-student payment. The webhook is
// the authoritative path; this just verifies and gives the payer fast feedback.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { activateStudentSubscription } from '@/lib/activateStudentSubscription'

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://school-os-sphg.vercel.app'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const reference = searchParams.get('reference') ?? searchParams.get('trxref')

  let back = `${APP_URL}/dashboard/parent/subscription`
  const fail = () => NextResponse.redirect(`${back}?status=failed`)

  if (!reference) return fail()

  try {
    const verify = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } },
    )
    const v = await verify.json()
    if (v.data?.metadata?.payer_role === 'student') back = `${APP_URL}/dashboard/student`
    if (!v.status || v.data?.status !== 'success') return fail()

    const admin = createAdminClient()
    const result = await activateStudentSubscription(admin, reference, Number(v.data.amount) / 100)
    if (!result.activated) {
      console.warn(`[student-subscription/callback] activation refused: ${result.reason}`)
      return fail()
    }
    return NextResponse.redirect(`${back}?status=success`)
  } catch (err) {
    console.error('[student-subscription/callback] error:', err)
    return fail()
  }
}
