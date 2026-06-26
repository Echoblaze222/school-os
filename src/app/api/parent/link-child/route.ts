// app/api/parent/link-child/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: parent } = await supabase
    .from('profiles')
    .select('id, role, school_id')
    .eq('id', user.id)
    .single()

  if (!parent || parent.role !== 'parent')
    return NextResponse.json({ error: 'Only parents can link children' }, { status: 403 })

  const { child_code } = await req.json()
  if (!child_code)
    return NextResponse.json({ error: 'child_code required' }, { status: 400 })

  // Find child by code — FIX: no class_level on profiles, removed it
  const { data: child } = await supabase
    .from('profiles')
    .select('id, full_name, role, school_id')
    .eq('default_code', child_code.trim().toUpperCase())
    .eq('school_id', parent.school_id)
    .eq('role', 'student')
    .maybeSingle()  // FIX: .single() throws on no rows

  if (!child)
    return NextResponse.json({ error: 'No student found with that code in your school' }, { status: 404 })

  // Check if already linked
  const { data: existing } = await supabase
    .from('parent_student_links')
    .select('id')
    .eq('parent_id', user.id)
    .eq('student_id', child.id)
    .maybeSingle()

  if (existing)
    return NextResponse.json({ ok: true, already_linked: true })

  // FIX: insert into parent_student_links — NOT profiles.parent_id (column doesn't exist)
  const { error } = await supabase
    .from('parent_student_links')
    .insert({ parent_id: user.id, student_id: child.id })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notify child
  await supabase.from('notifications').insert({
    user_id:   child.id,
    school_id: parent.school_id,
    title:     '👨‍👩‍👧 Parent Linked',
    body:      'A parent account has been linked to your profile.',
    type:      'system',
  }).throwOnError().catch(() => {}) // non-critical, don't fail the request

  return NextResponse.json({ ok: true, child: { id: child.id, full_name: child.full_name } })
    }
