// src/app/api/notebooks/[id]/route.ts
//
//   GET    one book with its topics (teacher: own book | student: published + shared with their class)
//   PATCH  teacher edits book details, publishes/unpublishes, changes which classes it is shared with
//   DELETE teacher deletes the book and all its topics

import { getCaller, teacherClassIds, loadBook, canRead, bad, json, fail, clean } from '@/lib/notebooks/server'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const got = await getCaller()
  if ('error' in got) return got.error
  const c = got.caller

  const { book, error } = await loadBook(c, id)
  if (error) return fail(error)
  // Same answer for "missing" and "not yours" so ids cannot be probed.
  if (!book || !(await canRead(c, book))) return bad('Book not found', 404)

  const [{ data: entries, error: eErr }, { data: links }, { data: author }] = await Promise.all([
    c.admin.from('note_book_entries')
      .select('id, title, content, file_url, file_name, position, updated_at')
      .eq('book_id', id).order('position', { ascending: true }).order('created_at', { ascending: true }),
    c.admin.from('note_book_classes').select('class_id').eq('book_id', id),
    c.admin.from('profiles').select('full_name').eq('id', book.created_by).maybeSingle(),
  ])
  if (eErr) return fail(eErr)

  return json({
    book: { ...book, author: (author as any)?.full_name ?? null, class_ids: (links ?? []).map((l: any) => l.class_id) },
    entries: entries ?? [],
    can_edit: c.role === 'teacher' && book.created_by === c.userId,
  })
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const got = await getCaller()
  if ('error' in got) return got.error
  const c = got.caller
  if (c.role !== 'teacher') return bad('Forbidden', 403)

  const { book, error } = await loadBook(c, id)
  if (error) return fail(error)
  if (!book || book.created_by !== c.userId) return bad('Book not found', 404)

  let body: any
  try { body = await req.json() } catch { return bad('Invalid JSON') }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ('title' in body) {
    const t = clean(body.title, 120)
    if (!t) return bad('Give the book a title.')
    patch.title = t
  }
  if ('description' in body) patch.description = clean(body.description, 600)
  if ('subject_name' in body) patch.subject_name = clean(body.subject_name, 80)
  if ('academic_year' in body) patch.academic_year = clean(body.academic_year, 20)
  if ('is_published' in body) patch.is_published = body.is_published === true
  if ('cover_color' in body) {
    patch.cover_color = typeof body.cover_color === 'string' && /^#[0-9a-fA-F]{6}$/.test(body.cover_color) ? body.cover_color : null
  }

  if (Array.isArray(body.class_ids)) {
    const requested: string[] = Array.from(new Set(body.class_ids.filter((x: unknown) => typeof x === 'string'))) as string[]
    if (requested.length === 0) return bad('A book must be shared with at least one class.')
    const mine = new Set(await teacherClassIds(c))
    if (!requested.every(cid => mine.has(cid))) return bad('You can only share a book with classes you teach.', 403)

    const { data: existing } = await c.admin.from('note_book_classes').select('class_id').eq('book_id', id)
    const have = new Set((existing ?? []).map((r: any) => r.class_id as string))
    const toAdd = requested.filter(cid => !have.has(cid))
    // Classes this teacher does not teach (shared by someone else) are never removed here.
    const toRemove = Array.from(have).filter(cid => mine.has(cid) && !requested.includes(cid))
    if (toAdd.length) {
      const { error: aErr } = await c.admin.from('note_book_classes').insert(toAdd.map(class_id => ({ book_id: id, class_id, school_id: c.schoolId })))
      if (aErr) return fail(aErr)
    }
    if (toRemove.length) {
      const { error: rErr } = await c.admin.from('note_book_classes').delete().eq('book_id', id).in('class_id', toRemove)
      if (rErr) return fail(rErr)
    }
  }

  const { error: uErr } = await c.admin.from('note_books').update(patch).eq('id', id).eq('school_id', c.schoolId)
  if (uErr) return fail(uErr)
  return json({ ok: true })
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const got = await getCaller()
  if ('error' in got) return got.error
  const c = got.caller
  if (c.role !== 'teacher') return bad('Forbidden', 403)

  const { book, error } = await loadBook(c, id)
  if (error) return fail(error)
  if (!book || book.created_by !== c.userId) return bad('Book not found', 404)

  const { error: dErr } = await c.admin.from('note_books').delete().eq('id', id).eq('school_id', c.schoolId)
  if (dErr) return fail(dErr)
  return json({ ok: true })
}
