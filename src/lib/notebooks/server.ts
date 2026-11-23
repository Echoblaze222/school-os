// src/lib/notebooks/server.ts
//
// Shared server-side helpers for the /api/notebooks routes. Everything here runs
// with the service role, so EVERY function re-checks who the caller is, which
// school they belong to, and (for students) which classes they may read.
//
// Needs sql/migrations/2026-11-22-note-books.sql.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type Admin = ReturnType<typeof createAdminClient>

export const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status })
export const bad = (error: string, status = 400) => json({ error }, status)

const MIGRATION_HINT =
  'Books are not set up yet. Ask the school admin to run sql/migrations/2026-11-22-note-books.sql, then try again.'

/** Turns a Supabase error into a safe response (never leaks SQL details). */
export function fail(err: { message?: string } | null | undefined) {
  const m = (err?.message ?? '').toLowerCase()
  if (m.includes('does not exist') || m.includes('could not find') || m.includes('schema cache')) {
    return json({ error: MIGRATION_HINT, code: 'migration_required' }, 503)
  }
  console.error('notebooks route error:', err?.message)
  return bad('Something went wrong. Please try again.', 500)
}

export interface Caller {
  userId: string
  role: 'teacher' | 'student'
  schoolId: string
  /** Students only: the CURRENT class (student_profiles.class_id; promotion updates it). */
  classId: string | null
  admin: Admin
}

export async function getCaller(): Promise<{ caller: Caller } | { error: NextResponse }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: bad('Unauthorized', 401) }

  const { data: profile } = await supabase.from('profiles').select('role, school_id, class_id').eq('id', user.id).single()
  const role = (profile as any)?.role as string | undefined
  const schoolId = (profile as any)?.school_id as string | undefined
  if (!schoolId || (role !== 'teacher' && role !== 'student')) return { error: bad('Forbidden', 403) }

  let classId: string | null = null
  if (role === 'student') {
    const { data: sp } = await supabase.from('student_profiles').select('class_id').eq('id', user.id).maybeSingle()
    classId = ((sp as any)?.class_id ?? (profile as any)?.class_id ?? null) as string | null
  }
  return { caller: { userId: user.id, role, schoolId, classId, admin: createAdminClient() } }
}

/** Class ids this teacher is assigned to in this school. */
export async function teacherClassIds(c: Caller): Promise<string[]> {
  const { data } = await c.admin.from('class_teachers').select('class_id').eq('teacher_id', c.userId).eq('school_id', c.schoolId)
  return Array.from(new Set((data ?? []).map((r: any) => r.class_id as string)))
}

/** Loads a book only if it belongs to the caller's school. */
export async function loadBook(c: Caller, bookId: string) {
  const { data, error } = await c.admin
    .from('note_books')
    .select('id, school_id, subject_id, subject_name, title, description, cover_color, academic_year, is_published, created_by, created_at, updated_at')
    .eq('id', bookId).eq('school_id', c.schoolId).maybeSingle()
  return { book: (data as any) ?? null, error }
}

/** Can this caller read the book? Teachers: their own. Students: published + shared with a current or earlier class. */
export async function canRead(c: Caller, book: { id: string; created_by: string; is_published: boolean }): Promise<boolean> {
  if (c.role === 'teacher') return book.created_by === c.userId
  if (!book.is_published) return false

  const classIds: string[] = []
  if (c.classId) classIds.push(c.classId)
  const { data: hist } = await c.admin.from('student_class_history').select('class_id').eq('student_id', c.userId)
  for (const h of hist ?? []) classIds.push((h as any).class_id)
  if (classIds.length === 0) return false

  const { data: link } = await c.admin
    .from('note_book_classes').select('class_id')
    .eq('book_id', book.id).in('class_id', classIds).limit(1)
  return (link ?? []).length > 0
}

/** Only https file URLs from this project's Supabase storage may be attached to a topic. */
export function isAllowedFileUrl(url: string): boolean {
  try {
    const u = new URL(url)
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (u.protocol !== 'https:') return false
    if (base && u.host === new URL(base).host) return true
    return u.hostname.endsWith('.supabase.co') || u.hostname.endsWith('.supabase.in')
  } catch {
    return false
  }
}

export const clean = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t.slice(0, max) : null
}
