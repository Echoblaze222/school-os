// src/app/api/ict/applications/route.ts
// ICT review queue for the self-service access-code application
// pathway (Phase 2, Lane D). List only, verify/generate-code are their
// own routes so each has its own explicit audit trail.

import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { requireIctAccess } from '@/lib/permissions'

export async function GET(request: Request) {
  try {
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

    const url = new URL(request.url)
    const status = url.searchParams.get('status') // optional filter

    let query = admin
      .from('access_code_applications')
      .select('id, full_name, email, phone, role_applied_for, verification_method, status, submitted_at, reviewed_at, rejection_reason')
      .eq('school_id', callerProfile.school_id)
      .order('submitted_at', { ascending: false })

    if (status) query = query.eq('status', status)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ applications: data })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
