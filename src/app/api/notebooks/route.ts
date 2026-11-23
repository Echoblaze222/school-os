// src/app/api/notebooks/route.ts
//
//   GET  /api/notebooks   teacher: my books | student: books for my current class
//                         ("current") and for classes I was in before ("earlier")
//   POST /api/notebooks   teacher creates a book and shares it with their classes
//
// Needs sql/migrations/2026-11-22-note-books.sql.

import { getCaller, teacherClassIds, bad, json, fail, clean } from '@/lib/notebooks/server'

const BOOK_FIELDS =
  'id, subject_id, subject_name, title, description, cover_color, academic_year, is_published, created_by, created_at, updated_at'

export async function GET() {
  const got = await getCaller()
  if ('error' in got) return got.error
  const c = got.caller

  let bookIds: string[] = []
  const groupOf = new Map<string, 'current' | 'earlier'>()

  if (c.role === 'teacher') {
    const { data, error } = await c.admin.from('note_books').select('id')
      .eq('school_id', c.schoolId).eq('created_by', c.userId)
    if (error) return fail(error)
    bookIds = (data ?? []).map((r: any) => r.id)
  } else {
    const { data: hist, error: hErr } = await c.admin.from('student_class_history').select('class_id').eq('student_id', c.userId)
    if (hErr) return fail(hErr)
    const earlierClasses = Array.from(new Set((hist ?? []).map((h: any) => h.class_id as string)))
      .filter(id => id !== c.classId)

    const link = async (classIds: string[], group: 'current' | 'earlier') => {
      if (classIds.length === 0) return null
      const { data, error } = await c.admin.from('note_book_classes').select('book_id')
        .eq('school_id', c.schoolId).in('class_id', classIds)
      if (error) return error
      for (const r of data ?? []) {
        const id = (r as any).book_id as string
        if (group === 'current' || !groupOf.has(id)) groupOf.set(id, group)
      }
      return null
    }
    const e1 = await link(c.classId ? [c.classId] : [], 'current'); if (e1) return fail(e1)
    const e2 = await link(earlierClasses, 'earlier');               if (e2) return fail(e2)
    bookIds = Array.from(groupOf.keys())
  }

  if (bookIds.length === 0) return json({ books: [] })

  let q = c.admin.from('note_books').select(BOOK_FIELDS).eq('school_id', c.schoolId).in('id', bookIds)
  if (c.role === 'student') q = q.eq('is_published', true)
  const { data: books, error } = await q.order('created_at', { ascending: false })
  if (error) return fail(error)
  const list = (books ?? []) as any[]
  const ids = list.map(b => b.id)
  if (ids.length === 0) return json({ books: [] })

  const [{ data: entries }, { data: links }, { data: authors }] = await Promise.all([
    c.admin.from('note_book_entries').select('book_id').in('book_id', ids),
    c.admin.from('note_book_classes').select('book_id, class_id').in('book_id', ids),
    c.admin.from('profiles').select('id, full_name').in('id', Array.from(new Set(list.map(b => b.created_by)))),
  ])

  const classIds = Array.from(new Set((links ?? []).map((l: any) => l.class_id as string)))
  const { data: classes } = classIds.length
    ? await c.admin.from('classes').select('id, name, section, class_level').in('id', classIds)
    : { data: [] as any[] }
  const className = new Map((classes ?? []).map((k: any) => [k.id, k.name ?? `${k.class_level ?? ''}${k.section ?? ''}`]))
  const authorName = new Map((authors ?? []).map((a: any) => [a.id, a.full_name]))

  return json({
    books: list.map(b => ({
      ...b,
      group: c.role === 'student' ? groupOf.get(b.id) ?? 'earlier' : undefined,
      author: authorName.get(b.created_by) ?? null,
      entry_count: (entries ?? []).filter((e: any) => e.book_id === b.id).length,
      class_ids: (links ?? []).filter((l: any) => l.book_id === b.id).map((l: any) => l.class_id),
      class_names: (links ?? []).filter((l: any) => l.book_id === b.id).map((l: any) => className.get(l.class_id)).filter(Boolean),
    })),
  })
}

export async function POST(req: Request) {
  const got = await getCaller()
  if ('error' in got) return got.error
  const c = got.caller
  if (c.role !== 'teacher') return bad('Only teachers can create books.', 403)

  let body: any
  try { body = await req.json() } catch { return bad('Invalid JSON') }

  const title = clean(body?.title, 120)
  if (!title) return bad('Give the book a title.')

  const requested: string[] = Array.isArray(body?.class_ids) ? body.class_ids.filter((x: unknown) => typeof x === 'string') : []
  if (requested.length === 0) return bad('Choose at least one class for this book.')
  const mine = new Set(await teacherClassIds(c))
  if (!requested.every(id => mine.has(id))) return bad('You can only share a book with classes you teach.', 403)

  let subjectId: string | null = null
  if (typeof body?.subject_id === 'string' && body.subject_id) {
    const { data: sub } = await c.admin.from('subjects').select('id').eq('id', body.subject_id).eq('school_id', c.schoolId).maybeSingle()
    if (!sub) return bad('Unknown subject.')
    subjectId = body.subject_id
  }
  const color = typeof body?.cover_color === 'string' && /^#[0-9a-fA-F]{6}$/.test(body.cover_color) ? body.cover_color : null

  const { data: created, error } = await c.admin.from('note_books').insert({
    school_id: c.schoolId,
    subject_id: subjectId,
    subject_name: clean(body?.subject_name, 80),
    title,
    description: clean(body?.description, 600),
    cover_color: color,
    academic_year: clean(body?.academic_year, 20),
    is_published: body?.is_published === true,
    created_by: c.userId,
  }).select('id').single()
  if (error || !created) return fail(error)

  const { error: linkErr } = await c.admin.from('note_book_classes').insert(
    Array.from(new Set(requested)).map(class_id => ({ book_id: (created as any).id, class_id, school_id: c.schoolId })),
  )
  if (linkErr) {
    await c.admin.from('note_books').delete().eq('id', (created as any).id)
    return fail(linkErr)
  }
  return json({ id: (created as any).id }, 201)
}
