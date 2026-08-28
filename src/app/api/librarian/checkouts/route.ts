// src/app/api/librarian/checkouts/route.ts
//
// library_loans already existed in the live database (same story as
// nurse/visits/route.ts) - rewritten to match it: the table is called
// library_loans not library_checkouts, columns are student_id (not
// borrower_profile_id - kept supporting teacher borrowers too since the
// FK itself just references profiles broadly, the column name is just
// student-oriented), issued_by (not issued_by_profile_id), borrowed_at
// (not issued_at), and a status enum ('borrowed'/'returned'/'overdue'/
// 'lost') that this route now keeps in sync instead of inferring
// everything from returned_at alone. No fine_kobo/fine_paid columns
// exist on the real table, so fine tracking isn't available here -
// flagged in the client instead of silently dropped.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasActiveAppointment } from '@/lib/permissions'

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
  const scope = url.searchParams.get('scope') // 'open' | 'overdue' | 'all'

  const admin = createAdminClient()
  let query = admin
    .from('library_loans')
    .select('id, borrowed_at, due_at, returned_at, status, notes, book:library_books(id, title), borrower:profiles!library_loans_student_id_fkey(id, full_name, avatar_url)')
    .eq('school_id', caller.schoolId)
    .order('borrowed_at', { ascending: false })
    .limit(200)

  if (scope === 'open') query = query.is('returned_at', null)
  if (scope === 'overdue') query = query.is('returned_at', null).lt('due_at', new Date().toISOString())

  const { data, error } = await query
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, checkouts: data ?? [] })
}

export async function POST(request: Request) {
  const caller = await requireLibrarian()
  if (!caller) return NextResponse.json({ ok: false, error: 'Not authorized.' }, { status: 403 })

  const body = await request.json().catch(() => null)
  if (!body?.bookId || !body?.borrowerId || !body?.dueAt) {
    return NextResponse.json({ ok: false, error: 'bookId, borrowerId and dueAt are required.' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: book } = await admin.from('library_books').select('id, available_copies').eq('id', body.bookId).eq('school_id', caller.schoolId).single()
  if (!book) return NextResponse.json({ ok: false, error: 'Book not found.' }, { status: 404 })
  if (book.available_copies <= 0) return NextResponse.json({ ok: false, error: 'No copies available to check out.' }, { status: 400 })

  const { data: borrower } = await admin.from('profiles').select('id').eq('id', body.borrowerId).eq('school_id', caller.schoolId).single()
  if (!borrower) return NextResponse.json({ ok: false, error: 'Borrower not found at your school.' }, { status: 400 })

  const { data: checkout, error } = await admin
    .from('library_loans')
    .insert({
      school_id: caller.schoolId,
      book_id: body.bookId,
      student_id: body.borrowerId,
      issued_by: caller.userId,
      due_at: body.dueAt,
      status: 'borrowed',
      notes: body.notes ? String(body.notes).trim() : null,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  await admin.from('library_books').update({ available_copies: book.available_copies - 1 }).eq('id', body.bookId)

  return NextResponse.json({ ok: true, checkout })
}

export async function PATCH(request: Request) {
  const caller = await requireLibrarian()
  if (!caller) return NextResponse.json({ ok: false, error: 'Not authorized.' }, { status: 403 })

  const body = await request.json().catch(() => null)
  if (!body?.id || body?.action !== 'return') {
    return NextResponse.json({ ok: false, error: "id and action: 'return' are required." }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: checkout } = await admin.from('library_loans').select('id, book_id, returned_at, due_at').eq('id', body.id).eq('school_id', caller.schoolId).single()
  if (!checkout) return NextResponse.json({ ok: false, error: 'Checkout not found.' }, { status: 404 })
  if (checkout.returned_at) return NextResponse.json({ ok: false, error: 'Already returned.' }, { status: 400 })

  const { data: updated, error } = await admin
    .from('library_loans')
    .update({ returned_at: new Date().toISOString(), status: 'returned' })
    .eq('id', body.id)
    .select('*')
    .single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const { data: book } = await admin.from('library_books').select('available_copies, total_copies').eq('id', checkout.book_id).single()
  if (book) {
    await admin.from('library_books').update({ available_copies: Math.min(book.total_copies, book.available_copies + 1) }).eq('id', checkout.book_id)
  }

  return NextResponse.json({ ok: true, checkout: updated })
}
