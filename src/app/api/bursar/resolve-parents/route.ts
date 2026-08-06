// src/app/api/bursar/resolve-parents/route.ts
// Resolves parent_id + parent full_name for a set of student IDs.
//
// WHY THIS EXISTS: parent_student_links has RLS that (correctly) only lets a
// parent read their OWN link row (auth.uid() = parent_id). Every parent-side
// page in the app queries that table as the parent, which works fine. The
// Reminders page needs the bursar to read OTHER people's links — querying
// parent_student_links directly from the browser as the bursar silently
// returns 0 rows because of that same RLS, even when the link exists. That's
// why "Reminders" showed "No parent linked" for students who were, in fact,
// linked. This route uses the service role to read across that RLS boundary,
// after verifying the caller is legitimate staff at the student's school.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('school_id, role')
    .eq('id', user.id)
    .single()

  if (!profile || !['bursar', 'principal', 'secretary', 'teacher', 'super_admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { studentIds } = await req.json()
  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    return NextResponse.json({ links: [] })
  }

  const admin = createAdminClient()

  // Scope to this school only — don't let a staff member fish for links
  // belonging to students at other schools.
  const { data: schoolStudents } = await admin
    .from('profiles')
    .select('id')
    .eq('school_id', profile.school_id)
    .in('id', studentIds)

  const allowedIds = new Set((schoolStudents ?? []).map((s: any) => s.id))
  const scopedIds = studentIds.filter((id: string) => allowedIds.has(id))
  if (scopedIds.length === 0) return NextResponse.json({ links: [] })

  const { data: links, error } = await admin
    .from('parent_student_links')
    .select('student_id, parent_id')
    .in('student_id', scopedIds)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const parentIds = [...new Set((links ?? []).map((l: any) => l.parent_id))]
  const { data: parents } = parentIds.length
    ? await admin.from('profiles').select('id, full_name').in('id', parentIds)
    : { data: [] }

  const parentMap = new Map<string, string>(
    (parents ?? []).map((p: any) => [p.id, p.full_name] as [string, string])
  )
  const result = (links ?? []).map((l: any) => ({
    student_id: l.student_id,
    parent_id: l.parent_id,
    parent_name: parentMap.get(l.parent_id) ?? null,
  }))

  return NextResponse.json({ links: result })
}
