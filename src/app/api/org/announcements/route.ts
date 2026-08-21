// src/app/api/org/announcements/route.ts
//
// Deliberately NOT reusing the direct-browser-insert pattern every other
// role's announcements page uses (supabase.from('announcements').insert()
// straight from the client). That pattern relies entirely on whatever
// INSERT policy already exists on `announcements` - which has no idea
// about the new target_department_id column or department scope. Routing
// through a server route here means a department-targeted announcement
// can actually be checked against canManageDepartmentWork before it's
// written, the same "never trust the client, verify server-side" rule
// every other Lane A write follows.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveUserContext, canManageDepartmentWork } from '@/lib/permissions'
import { auditLog } from '@/lib/auditLog'

const VALID_AUDIENCES = ['all', 'students', 'parents', 'teachers', 'staff']

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

  const ctx = await resolveUserContext(supabase, user.id)
  if (!ctx) return NextResponse.json({ ok: false, error: 'Profile not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('announcements')
    .select('id, title, body, audience, target_department_id, status, is_pinned, priority, created_at, author_id, departments(name)')
    .eq('school_id', ctx.schoolId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('[api/org/announcements] list error:', error.message)
    return NextResponse.json({ ok: false, error: 'Could not load announcements.' }, { status: 500 })
  }

  const announcements = (data ?? []).map((a: any) => ({
    ...a,
    department_name: Array.isArray(a.departments) ? a.departments[0]?.name : a.departments?.name,
  }))
  return NextResponse.json({ ok: true, announcements })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

  const ctx = await resolveUserContext(supabase, user.id)
  if (!ctx) return NextResponse.json({ ok: false, error: 'Profile not found' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  const content = typeof body?.body === 'string' ? body.body.trim() : ''
  const audience = VALID_AUDIENCES.includes(body?.audience) ? body.audience : 'staff'
  const targetDepartmentId = typeof body?.target_department_id === 'string' ? body.target_department_id : null
  const isPinned = body?.is_pinned === true

  if (!title || !content) {
    return NextResponse.json({ ok: false, error: 'Title and body are required.' }, { status: 400 })
  }

  // This route uses the service-role client below, which bypasses RLS
  // entirely - so unlike every other role's announcements page (which
  // inserts via the browser client and relies on that table's own RLS
  // policy to keep students/parents from posting), this route has to be
  // its own gate.
  if (targetDepartmentId) {
    // Department-targeted: Principal, a Vice Principal whose scope
    // includes it, or its own Head of Department - same three paths as
    // every other department-work write.
    const grant = canManageDepartmentWork(ctx, targetDepartmentId)
    if (!grant) {
      return NextResponse.json(
        { ok: false, error: "You don't have permission to post to this department. This is limited to the Principal, a Vice Principal whose scope includes it, or its own Head of Department." },
        { status: 403 },
      )
    }
  } else {
    // General staff-wide: broader reach than a single department, so
    // narrower authorization - Principal or Vice Principal only. An HOD's
    // authority per the §25 matrix doesn't extend past their own
    // department.
    const isPrincipal = ctx.baseRole === 'principal'
    const isVicePrincipal = ctx.appointments.some(a => a.appointment_type === 'vice_principal')
    if (!isPrincipal && !isVicePrincipal) {
      return NextResponse.json({ ok: false, error: "You don't have permission to post a school-wide announcement." }, { status: 403 })
    }
  }

  const admin = createAdminClient()

  if (targetDepartmentId) {
    const { data: dept } = await admin.from('departments').select('id, school_id').eq('id', targetDepartmentId).single()
    if (!dept || dept.school_id !== ctx.schoolId) {
      return NextResponse.json({ ok: false, error: 'Department not found.' }, { status: 404 })
    }
  }

  const { data, error } = await admin.from('announcements').insert({
    school_id: ctx.schoolId,
    title, body: content, audience,
    target_department_id: targetDepartmentId,
    status: 'published',
    is_pinned: isPinned,
    author_id: ctx.userId,
    posted_by: ctx.userId,
    created_by: ctx.userId,
  }).select('*').single()

  if (error) {
    console.error('[api/org/announcements] create error:', error.message)
    return NextResponse.json({ ok: false, error: 'Could not post announcement.' }, { status: 500 })
  }

  await auditLog(admin, {
    actorId: ctx.userId, action: 'announcement.create', targetTable: 'announcements', targetId: data.id,
    metadata: { title, audience, target_department_id: targetDepartmentId },
  })

  return NextResponse.json({ ok: true, announcement: data })
}
