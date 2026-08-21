// src/app/api/ict/account-requests/[id]/route.ts
// PATCH: ICT resolves/updates a request. For request_type='password_reset'
// specifically, the *only* action this route allows ICT to take is
// triggering Supabase Auth's own recovery-link flow, it never accepts
// or sets a new password value itself, and there is no field anywhere
// in this route that could carry one. That's the literal implementation
// of §12's "Do NOT allow ICT to directly view or retrieve users'
// passwords. Use secure account recovery/reset mechanisms."

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
    const { action, status, resolutionNote } = await request.json()

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

    const { data: reqRow } = await admin
      .from('ict_account_requests')
      .select('id, school_id, request_type, requested_by, status')
      .eq('id', id).eq('school_id', callerProfile.school_id).maybeSingle()
    if (!reqRow) return NextResponse.json({ error: 'Request not found.' }, { status: 404 })

    // Secure reset trigger, sends the user's own registered email a
    // Supabase-signed recovery link. ICT never sees or handles the
    // resulting password; only the user, via their own inbox, does.
    if (action === 'send_password_reset') {
      if (reqRow.request_type !== 'password_reset') {
        return NextResponse.json({ error: 'send_password_reset only applies to password_reset requests.' }, { status: 400 })
      }
      const { data: targetProfile } = await admin
        .from('profiles').select('email').eq('id', reqRow.requested_by).single()
      if (!targetProfile?.email) {
        return NextResponse.json({ error: 'Could not resolve the requester\'s email.' }, { status: 500 })
      }

      const { error: linkErr } = await admin.auth.admin.generateLink({
        type: 'recovery',
        email: targetProfile.email,
      })
      if (linkErr) return NextResponse.json({ error: `Could not send reset link: ${linkErr.message}` }, { status: 500 })

      await admin.from('ict_account_requests').update({
        status: 'in_progress', handled_by: user.id,
      }).eq('id', id)

      try {
        await admin.from('portal_audit_log').insert({
          action: 'ict_password_reset_triggered', actor_id: user.id,
          target_table: 'profiles', target_id: reqRow.requested_by,
          metadata: { account_request_id: id }, logged_at: new Date().toISOString(),
        })
      } catch { /* non-critical */ }

      return NextResponse.json({ success: true, message: 'Recovery link sent to the user\'s registered email.' })
    }

    // Ordinary status/resolution update for the other request types.
    const update: Record<string, any> = { handled_by: user.id }
    if (status) update.status = status
    if (resolutionNote !== undefined) update.resolution_note = resolutionNote
    if (status === 'resolved' || status === 'closed') update.resolved_at = new Date().toISOString()

    const { error } = await admin.from('ict_account_requests').update(update).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
