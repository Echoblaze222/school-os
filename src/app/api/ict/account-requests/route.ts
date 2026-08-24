// src/app/api/ict/account-requests/route.ts
// §12, account support for EXISTING users (password reset, access
// troubleshooting, device registration, email support, provisioning).
// GET: ICT's full queue. POST: any authenticated user filing a request
// about their own account (RLS also allows a direct client insert; this
// route exists to fire the "account support request" notification).

import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { requireIctAccess } from '@/lib/permissions'
import { notifyAppointmentHolders } from '@/lib/notify'

const REQUEST_TYPES = ['password_reset', 'access_troubleshooting', 'device_registration', 'email_support', 'provisioning', 'other']

async function getCaller() {
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
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabaseAuth.from('profiles').select('id, school_id, full_name').eq('id', user.id).single()
  if (!profile) return null
  return { user, profile }
}

export async function GET() {
  const caller = await getCaller()
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const allowed = await requireIctAccess(admin, caller.user.id, caller.profile.school_id)
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Deliberately excludes password_hash / any credential material, this
  // table never stores one (see schema comment), only workflow state.
  const { data, error } = await admin
    .from('ict_account_requests')
    .select('id, requested_by, request_type, description, status, handled_by, resolution_note, created_at, resolved_at, profiles!ict_account_requests_requested_by_fkey(full_name, role)')
    .eq('school_id', caller.profile.school_id)
    .order('created_at', { ascending: false })
    .limit(200) // §33 performance: account requests accumulate indefinitely

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ requests: data })
}

export async function POST(request: Request) {
  const caller = await getCaller()
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { requestType, description } = await request.json()
  if (!requestType || !REQUEST_TYPES.includes(requestType) || !description) {
    return NextResponse.json({ error: 'Valid requestType and description are required.' }, { status: 400 })
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const { data: reqRow, error } = await admin
    .from('ict_account_requests')
    .insert({
      school_id: caller.profile.school_id, requested_by: caller.user.id,
      request_type: requestType, description, status: 'open',
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await notifyAppointmentHolders(admin, caller.profile.school_id, ['ict_officer', 'ict_administrator'], {
    title: 'New account support request',
    body:  `${caller.profile.full_name}: ${requestType.replace('_', ' ')}`,
    type:  'ict_account_request',
    action_url: '/dashboard/ict/account-requests',
  }).catch(() => {})

  return NextResponse.json({ success: true, requestId: reqRow.id })
}
