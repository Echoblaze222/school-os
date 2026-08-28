// src/app/api/librarian/books/route.ts
//
// library_books already existed in the live database before this
// feature was built (see nurse/visits/route.ts's comment for the full
// story - same root cause here). Rewritten to match the real table:
// category is CHECK-constrained to a fixed list (not free text),
// cover_url not cover_image_url, added_by not created_by, and there's
// no publication_year column.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasActiveAppointment } from '@/lib/permissions'

const CATEGORIES = ['General', 'Fiction', 'Non-Fiction', 'Textbook', 'Reference', 'Periodical']

async function requireLibrarian() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('id, school_id').eq('id', user.id).single()
  if (!profile?.school_id) return null
  const isLibrarian = await hasActiveAppointment(supabase, user.id, profile.school_id, 'librarian')
  if (!isLibrarian) return null
  return { userId: user.id, schoolId: profile.school_id }
}

export async function GET(request: Request) {
  const caller = await requireLibrarian()
  if (!caller) return NextResponse.json({ ok: false, error: 'Not authorized.' }, { status: 403 })

  const url = new URL(request.url)
  const search = url.searchParams.get('search')?.trim()

  const admin = createAdminClient()
  let query = admin.from('library_books').select('*').eq('school_id', caller.schoolId).order('title').limit(300)
  if (search) query = query.or(`title.ilike.%${search}%,author.ilike.%${search}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, books: data ?? [], categories: CATEGORIES })
}

export async function POST(request: Request) {
  const caller = await requireLibrarian()
  if (!caller) return NextResponse.json({ ok: false, error: 'Not authorized.' }, { status: 403 })

  const body = await request.json().catch(() => null)
  if (!body?.title) return NextResponse.json({ ok: false, error: 'Title is required.' }, { status: 400 })

  const category = body.category && CATEGORIES.includes(body.category) ? body.category : 'General'
  const totalCopies = Math.max(1, Number(body.totalCopies ?? 1))

  const admin = createAdminClient()
  const { data: book, error } = await admin
    .from('library_books')
    .insert({
      school_id: caller.schoolId,
      title: String(body.title).trim(),
      author: body.author ? String(body.author).trim() : null,
      isbn: body.isbn ? String(body.isbn).trim() : null,
      category,
      publisher: body.publisher ? String(body.publisher).trim() : null,
      total_copies: totalCopies,
      available_copies: totalCopies,
      shelf_location: body.shelfLocation ? String(body.shelfLocation).trim() : null,
      added_by: caller.userId,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, book })
}

export async function PATCH(request: Request) {
  const caller = await requireLibrarian()
  if (!caller) return NextResponse.json({ ok: false, error: 'Not authorized.' }, { status: 403 })

  const body = await request.json().catch(() => null)
  if (!body?.id) return NextResponse.json({ ok: false, error: 'id is required.' }, { status: 400 })

  const admin = createAdminClient()

  if (body.totalCopies !== undefined) {
    const { data: existing } = await admin.from('library_books').select('total_copies, available_copies').eq('id', body.id).eq('school_id', caller.schoolId).single()
    if (!existing) return NextResponse.json({ ok: false, error: 'Book not found.' }, { status: 404 })
    const checkedOut = existing.total_copies - existing.available_copies
    const newTotal = Math.max(1, Number(body.totalCopies))
    if (newTotal < checkedOut) {
      return NextResponse.json({ ok: false, error: `Can't reduce copies below ${checkedOut}, the number currently checked out.` }, { status: 400 })
    }
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const [bodyKey, col] of [
    ['title', 'title'], ['author', 'author'], ['isbn', 'isbn'],
    ['publisher', 'publisher'], ['shelfLocation', 'shelf_location'],
  ] as const) {
    if (body[bodyKey] !== undefined) update[col] = body[bodyKey] ? String(body[bodyKey]).trim() : null
  }
  if (body.category !== undefined && CATEGORIES.includes(body.category)) update.category = body.category
  if (body.totalCopies !== undefined) {
    const { data: existing } = await admin.from('library_books').select('total_copies, available_copies').eq('id', body.id).single()
    const delta = Number(body.totalCopies) - (existing?.total_copies ?? 0)
    update.total_copies = Number(body.totalCopies)
    update.available_copies = Math.max(0, (existing?.available_copies ?? 0) + delta)
  }

  const { data: book, error } = await admin.from('library_books').update(update).eq('id', body.id).eq('school_id', caller.schoolId).select('*').single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, book })
}
