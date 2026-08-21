// src/app/api/ict/applications/[id]/verify/route.ts
// Marks a pending/under-review application as verified (remotely or
// after in-person check) or rejected. Verified is a prerequisite for
// Generate Code, that route re-checks status itself rather than
// trusting the client to only call it after this one.

import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { requireIctAccess } from '@/lib/permissions'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { decision, rejectionReason } = await request.json()

    if (!['verified', 'rejected'].includes(decision)) {
      return NextResponse.json({ error: 'decision must be "verified" or "rejected".' }, { status: 400 })
    }
    if (decision === 'rejected' && !rejectionReason) {
      return NextResponse.json({ error: 'rejectionReason is required when rejecting.' }, { status: 400 })
    }

    const cookieStore = await cookies()
    const supabaseAuth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          },
        },
      },
    )
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: callerProfile } = await supabaseAuth
      .from('profiles').select('school_id').eq('id', user.id).single()
    if (!callerProfile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    const allowed = await requireIctAccess(admin, user.id, callerProfile.school_id)
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: application } = await admin
      .from('access_code_applications')
      .select('id, school_id, status')
      .eq('id', id)
      .eq('school_id', callerProfile.school_id) // never trust the URL alone, scope to caller's own school
      .maybeSingle()

    if (!application) return NextResponse.json({ error: 'Application not found.' }, { status: 404 })
    if (!['pending', 'under_review'].includes(application.status)) {
      return NextResponse.json({ error: `Application is already ${application.status}.` }, { status: 409 })
    }

    const { error: updateError } = await admin
      .from('access_code_applications')
      .update({
        status:            decision,
        reviewed_by:       user.id,
        reviewed_at:       new Date().toISOString(),
        rejection_reason:  decision === 'rejected' ? rejectionReason : null,
        updated_at:        new Date().toISOString(),
      })
      .eq('id', id)

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

    try {
      await admin.from('portal_audit_log').insert({
        action:       decision === 'verified' ? 'ict_application_verified' : 'ict_application_rejected',
        actor_id:     user.id,
        target_table: 'access_code_applications',
        target_id:    id,
        metadata:     decision === 'rejected' ? { rejection_reason: rejectionReason } : {},
        logged_at:    new Date().toISOString(),
      })
    } catch { /* non-critical */ }

    return NextResponse.json({ success: true, status: decision })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
