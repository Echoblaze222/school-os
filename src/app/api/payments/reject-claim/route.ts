// src/app/api/payments/reject-claim/route.ts
// Bursar rejects a payment claim with a reason — notifies parent.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  const supabase = await createClient()
  const admin    = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: me } = await admin.from('profiles')
    .select('role').eq('id', user.id).single()

  if (!me || !['bursar','principal','super_admin'].includes(me.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { claim_id, bursar_id, school_id, bursar_note } = await req.json()

  if (!claim_id || !bursar_note) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  // 1. Update claim status
  const { data: claim, error: claimErr } = await admin
    .from('payment_claims')
    .update({
      status:      'rejected',
      bursar_note,
      reviewed_by: bursar_id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', claim_id)
    .select('parent_id, amount_claimed, term, academic_year')
    .single()

  if (claimErr) return NextResponse.json({ error: claimErr.message }, { status: 500 })

  // 2. Notify parent
  const fmtAmount = new Intl.NumberFormat('en-NG', {
    style:'currency', currency:'NGN', minimumFractionDigits:0,
  }).format(claim.amount_claimed)

  await admin.from('notifications').insert({
    user_id:    claim.parent_id,
    title:      'Payment Claim Not Confirmed',
    body:       `Your payment claim of ${fmtAmount} for ${claim.term} ${claim.academic_year} was not confirmed. Reason: ${bursar_note}`,
    type:       'payment',
    action_url: '/dashboard/parent/fees',
  })

  return NextResponse.json({ ok: true })
}
