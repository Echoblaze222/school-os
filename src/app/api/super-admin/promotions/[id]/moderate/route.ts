// src/app/api/super-admin/promotions/[id]/moderate/route.ts
// Lane E, §47 - approve or reject a promotion pending review.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data: platformAdmin } = await admin
    .from('platform_admins')
    .select('id')
    .eq('id', user.id)
    .single()

  if (!platformAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { decision?: 'approve' | 'reject'; reason?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (body.decision !== 'approve' && body.decision !== 'reject') {
    return NextResponse.json({ error: 'decision must be "approve" or "reject"' }, { status: 400 })
  }
  if (body.decision === 'reject' && !body.reason?.trim()) {
    return NextResponse.json({ error: 'A reason is required when rejecting.' }, { status: 400 })
  }

  const { data: promotion } = await admin
    .from('school_promotions')
    .select('id, status')
    .eq('id', id)
    .single()

  if (!promotion) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (promotion.status !== 'pending_review') {
    return NextResponse.json({ error: 'This promotion isn\'t awaiting review.' }, { status: 409 })
  }

  const { data, error } = await admin
    .from('school_promotions')
    .update({
      status: body.decision === 'approve' ? 'live' : 'rejected',
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      rejection_reason: body.decision === 'reject' ? body.reason!.trim() : null,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('[super-admin/promotions/moderate] update failed:', error.message)
    return NextResponse.json({ error: 'Couldn\'t save this decision.' }, { status: 500 })
  }

  return NextResponse.json({ promotion: data })
}
