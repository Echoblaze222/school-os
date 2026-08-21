// src/app/api/org/announcements/[id]/route.ts

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveUserContext, canManageDepartmentWork } from '@/lib/permissions'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

  const ctx = await resolveUserContext(supabase, user.id)
  if (!ctx) return NextResponse.json({ ok: false, error: 'Profile not found' }, { status: 404 })

  const admin = createAdminClient()
  const { data: ann } = await admin
    .from('announcements').select('id, school_id, author_id, target_department_id').eq('id', id).single()
  if (!ann || ann.school_id !== ctx.schoolId) {
    return NextResponse.json({ ok: false, error: 'Announcement not found.' }, { status: 404 })
  }

  const isOwnPost = ann.author_id === ctx.userId
  const hasDeptAuthority = ann.target_department_id ? !!canManageDepartmentWork(ctx, ann.target_department_id) : false
  const isPrincipal = ctx.baseRole === 'principal'

  if (!isOwnPost && !hasDeptAuthority && !isPrincipal) {
    return NextResponse.json({ ok: false, error: "You don't have permission to delete this announcement." }, { status: 403 })
  }

  const { error } = await admin.from('announcements').delete().eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: 'Could not delete announcement.' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
