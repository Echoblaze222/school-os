// app/api/parent/link-child/route.ts
// Links a parent account to their child using child's access code
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify caller is a parent
  const { data: parent } = await supabase
    .from('profiles').select('id, role, school_id')
    .eq('id', session.user.id).single()

  if (!parent || parent.role !== 'parent') {
    return NextResponse.json({ error: 'Only parents can link children' }, { status: 403 })
  }

  const { child_code } = await req.json()
  if (!child_code) return NextResponse.json({ error: 'child_code required' }, { status: 400 })

  // Find child by code in same school
  const { data: child } = await supabase
    .from('profiles')
    .select('id, full_name, class_level, role, school_id')
    .eq('default_code', child_code.trim().toUpperCase())
    .eq('school_id', parent.school_id)
    .eq('role', 'student')
    .single()

  if (!child) {
    return NextResponse.json({ error: 'No student found with that code in your school' }, { status: 404 })
  }

  // Link parent to child
  const { error } = await supabase
    .from('profiles')
    .update({ parent_id: session.user.id })
    .eq('id', child.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notify child
  await supabase.from('notifications').insert({
    user_id:  child.id,
    school_id: parent.school_id,
    title:    '👨‍👩‍👧 Parent Linked',
    body:     'A parent account has been linked to your profile.',
    type:     'system',
  })

  return NextResponse.json({
    ok: true,
    child: { id: child.id, full_name: child.full_name, class_level: child.class_level }
  })
}
