// src/app/api/hostel/unassigned-students/route.ts
// Closes the gap flagged in Lane E1: the assign action existed with no
// picker UI to call it from. This route lists students at the caller's
// school who don't currently hold an active bed assignment, optionally
// filtered by name, so the rooms page can offer a real picker instead of
// a button with nothing behind it.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { requireHostelStaff } from '@/lib/permissions'

export async function GET(request: Request) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })

    const adminClient = createAdminClient()
    const auth = await requireHostelStaff(adminClient, user.id)
    if (!auth) return NextResponse.json({ error: 'You do not have hostel staff access.' }, { status: 403 })

    const { searchParams } = new URL(request.url)
    const q = (searchParams.get('q') ?? '').trim()

    const { data: assignedRows } = await adminClient
      .from('hostel_bed_assignments')
      .select('student_id')
      .eq('status', 'active')
    const assignedIds = new Set((assignedRows ?? []).map(r => r.student_id))

    let query = adminClient
      .from('profiles')
      .select('id, full_name')
      .eq('school_id', auth.profile.school_id)
      .eq('role', 'student')
      .order('full_name')
      .limit(50)

    if (q.length > 0) query = query.ilike('full_name', `%${q}%`)

    const { data: students, error } = await query
    if (error) return NextResponse.json({ error: 'Could not search students.' }, { status: 500 })

    const unassigned = (students ?? []).filter(s => !assignedIds.has(s.id))

    return NextResponse.json({ students: unassigned })

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
