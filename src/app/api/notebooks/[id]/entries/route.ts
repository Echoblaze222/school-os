// src/app/api/notebooks/[id]/entries/route.ts
//
// Topics inside a book. Teacher (owner) only.
//   POST   { title, content? | file_url?+file_name? }  add a topic at the end
//   PATCH  { entry_id, title?, content?, file_url?, file_name? }   edit one topic
//          { order: [entry_id, ...] }                              reorder topics
//   DELETE ?entry_id=...                                           remove a topic

import { getCaller, loadBook, isAllowedFileUrl, bad, json, fail, clean } from '@/lib/notebooks/server'

type Ctx = { params: Promise<{ id: string }> }

async function ownBook(id: string) {
  const got = await getCaller()
  if ('error' in got) return { error: got.error }
  const c = got.caller
  if (c.role !== 'teacher') return { error: bad('Forbidden', 403) }
  const { book, error } = await loadBook(c, id)
  if (error) return { error: fail(error) }
  if (!book || book.created_by !== c.userId) return { error: bad('Book not found', 404) }
  return { c, book }
}

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const own = await ownBook(id)
  if ('error' in own) return own.error
  const { c } = own

  let body: any
  try { body = await req.json() } catch { return bad('Invalid JSON') }

  const title = clean(body?.title, 160)
  if (!title) return bad('Give the topic a title.')
  const content = typeof body?.content === 'string' && body.content.trim() ? body.content.slice(0, 60000) : null
  const fileUrl = typeof body?.file_url === 'string' && body.file_url ? body.file_url : null
  if (!content && !fileUrl) return bad('Add some note text or attach a file.')
  if (fileUrl && !isAllowedFileUrl(fileUrl)) return bad('That file link is not allowed.')

  const { data: last } = await c.admin.from('note_book_entries').select('position')
    .eq('book_id', id).order('position', { ascending: false }).limit(1)
  const position = ((last ?? [])[0] as any)?.position != null ? (last as any)[0].position + 1 : 0

  const { data, error } = await c.admin.from('note_book_entries').insert({
    book_id: id, school_id: c.schoolId, title, content,
    file_url: fileUrl, file_name: clean(body?.file_name, 200),
    position, created_by: c.userId,
  }).select('id').single()
  if (error || !data) return fail(error)
  await c.admin.from('note_books').update({ updated_at: new Date().toISOString() }).eq('id', id)
  return json({ id: (data as any).id }, 201)
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const own = await ownBook(id)
  if ('error' in own) return own.error
  const { c } = own

  let body: any
  try { body = await req.json() } catch { return bad('Invalid JSON') }

  if (Array.isArray(body?.order)) {
    const order: string[] = body.order.filter((x: unknown) => typeof x === 'string')
    const { data: rows } = await c.admin.from('note_book_entries').select('id').eq('book_id', id)
    const valid = new Set((rows ?? []).map((r: any) => r.id as string))
    if (order.length !== valid.size || !order.every(x => valid.has(x))) return bad('Invalid order.')
    for (let i = 0; i < order.length; i++) {
      const { error } = await c.admin.from('note_book_entries').update({ position: i }).eq('id', order[i]).eq('book_id', id)
      if (error) return fail(error)
    }
    return json({ ok: true })
  }

  const entryId = typeof body?.entry_id === 'string' ? body.entry_id : null
  if (!entryId) return bad('entry_id required')

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ('title' in body) {
    const t = clean(body.title, 160)
    if (!t) return bad('Give the topic a title.')
    patch.title = t
  }
  if ('content' in body) patch.content = typeof body.content === 'string' && body.content.trim() ? body.content.slice(0, 60000) : null
  if ('file_url' in body) {
    if (body.file_url && (typeof body.file_url !== 'string' || !isAllowedFileUrl(body.file_url))) return bad('That file link is not allowed.')
    patch.file_url = body.file_url || null
  }
  if ('file_name' in body) patch.file_name = clean(body.file_name, 200)

  const { error } = await c.admin.from('note_book_entries').update(patch).eq('id', entryId).eq('book_id', id)
  if (error) return fail(error)
  return json({ ok: true })
}

export async function DELETE(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const own = await ownBook(id)
  if ('error' in own) return own.error
  const { c } = own

  const entryId = new URL(req.url).searchParams.get('entry_id')
  if (!entryId) return bad('entry_id required')
  const { error } = await c.admin.from('note_book_entries').delete().eq('id', entryId).eq('book_id', id)
  if (error) return fail(error)
  return json({ ok: true })
}
