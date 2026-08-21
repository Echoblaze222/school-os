// src/app/api/org/departments/[id]/performance/route.ts

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveUserContext } from '@/lib/permissions'
import { getDepartmentPerformance } from '@/lib/supabase/departmentWork'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

  const ctx = await resolveUserContext(supabase, user.id)
  if (!ctx) return NextResponse.json({ ok: false, error: 'Profile not found' }, { status: 404 })

  const performance = await getDepartmentPerformance(supabase, ctx.schoolId, id)
  return NextResponse.json({ ok: true, performance })
}
