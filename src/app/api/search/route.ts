// src/app/api/search/route.ts
//
// Section 10's "Global Intelligent Search" — one authorized search
// experience across students, teachers, staff, classes, subjects,
// payments, invoices, assignments, results, books, announcements, and
// events, with role permissions applied before anything is returned.
//
// Two layers:
//   1. A small heuristic intent layer for the handful of natural-language
//      patterns the spec calls out by name ("attendance below 80%",
//      "outstanding fees for JSS3", "assignments awaiting grading",
//      "admissions awaiting document verification"). This is regex-based,
//      not a live model call, on purpose: search needs to feel instant as
//      the user types, and running every keystroke through an LLM would
//      be slow and expensive for no real benefit over pattern matching on
//      a handful of known phrasings.
//   2. A keyword search across entities relevant to the caller's actual
//      role, using the caller's own school_id (never a client-supplied
//      one), the same pattern as fetchDataContext in /api/ai/chat.
//
// Every branch below is scoped by the caller's real role from
// getCallerContext (which reads profiles.role server-side), not
// anything sent by the client, and by their own school_id. Parent and
// student branches additionally scope to the caller's own children /
// own records, never another family's or another student's.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerContext } from '@/lib/permissions'
import { checkRateLimit } from '@/lib/rateLimit'

interface SearchResult {
  type: string
  id: string
  title: string
  subtitle: string
  href: string
}

const MAX_PER_ENTITY = 8

// Escapes ILIKE wildcards so a search for "50%" or "a_b" doesn't behave
// like a wildcard pattern, then wraps it for a contains-match.
function likeTerm(q: string): string {
  return `%${q.replace(/[%_\\]/g, (m) => '\\' + m)}%`
}

function extractClassLevel(q: string): string | null {
  const m = q.match(/\b(jss|ss)\s?([1-3])\b/i)
  if (!m) return null
  return `${m[1].toUpperCase()}${m[2]}`
}

function extractPercent(q: string): number | null {
  const m = q.match(/(\d{1,3})\s*%/)
  if (!m) return null
  const n = parseInt(m[1], 10)
  return n >= 0 && n <= 100 ? n : null
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const callerRaw = await getCallerContext(supabase)
  if (!callerRaw || !callerRaw.schoolId) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  }
  // TS can't carry the `caller.schoolId` null-check above through to
  // tryIntentSearch/keywordSearch below (they take a freshly-typed
  // parameter, not a narrowed reference to this exact variable) — pull
  // schoolId into its own const so its type is `string`, not
  // `string | null`, then rebuild caller with that narrowed field.
  const schoolId = callerRaw.schoolId
  const caller = { ...callerRaw, schoolId }

  // Authenticated, but still fans out to several tables per keystroke-
  // driven request — same reasoning as the schools/search rate limit
  // from Lane 1, just per-user instead of per-IP since this endpoint
  // requires a session.
  const rl = await checkRateLimit(createAdminClient(), 'global_search', caller.userId, 60, 60)
  if (!rl.allowed) {
    return NextResponse.json({ error: rl.errorResponse!.error }, { status: rl.errorResponse!.status })
  }

  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') ?? '').trim()
  if (q.length < 2) return NextResponse.json({ results: [], intent: null })
  if (q.length > 200) return NextResponse.json({ error: 'Search text is too long.' }, { status: 400 })

  try {
    const intentResult = await tryIntentSearch(supabase, caller, q)
    if (intentResult) return NextResponse.json(intentResult)

    const results = await keywordSearch(supabase, caller, q)
    return NextResponse.json({ results, intent: null })
  } catch (e: unknown) {
    console.error('[search]', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'Search failed. Please try again.' }, { status: 500 })
  }
}

// ─── Natural-language intent layer ─────────────────────────────────────

async function tryIntentSearch(
  supabase: any,
  caller: { userId: string; role: string; schoolId: string },
  q: string
): Promise<{ results: SearchResult[]; intent: string } | null> {
  const { schoolId, role, userId } = caller

  // "Students in SS2 with attendance below 80%"
  if (/attendance/i.test(q) && /(below|under|less than)/i.test(q)) {
    const canSee = role === 'principal' || role === 'secretary' || role === 'teacher'
    if (!canSee) return { results: [], intent: 'attendance_below' }

    const threshold = extractPercent(q) ?? 80
    const classLevel = extractClassLevel(q)

    let classQuery = supabase.from('classes').select('id, name, class_level').eq('school_id', schoolId)
    if (classLevel) classQuery = classQuery.eq('class_level', classLevel)
    if (role === 'teacher') {
      const { data: myClasses } = await supabase.from('class_teachers')
        .select('class_id').eq('teacher_id', userId).eq('school_id', schoolId)
      const myClassIds = (myClasses ?? []).map((c: any) => c.class_id)
      if (myClassIds.length === 0) return { results: [], intent: 'attendance_below' }
      classQuery = classQuery.in('id', myClassIds)
    }
    const { data: classes } = await classQuery
    const classIds = (classes ?? []).map((c: any) => c.id)
    if (classIds.length === 0) return { results: [], intent: 'attendance_below' }

    const { data: rows } = await supabase.from('attendance')
      .select('student_id, status, is_present, class_id')
      .eq('school_id', schoolId).in('class_id', classIds).limit(3000)

    const byStudent = new Map<string, { present: number; total: number }>()
    for (const r of rows ?? []) {
      const cur = byStudent.get(r.student_id) ?? { present: 0, total: 0 }
      cur.total += 1
      if (r.status === 'present' || r.is_present === true) cur.present += 1
      byStudent.set(r.student_id, cur)
    }
    const belowIds = Array.from(byStudent.entries())
      .filter(([, v]) => v.total > 0 && Math.round((v.present / v.total) * 100) < threshold)
      .map(([id, v]) => ({ id, rate: Math.round((v.present / v.total) * 100) }))

    if (belowIds.length === 0) return { results: [], intent: 'attendance_below' }

    const { data: students } = await supabase.from('profiles')
      .select('id, full_name, class_level').in('id', belowIds.map((b) => b.id)).limit(50)

    const rateById = new Map(belowIds.map((b) => [b.id, b.rate]))
    const results: SearchResult[] = (students ?? []).map((s: any) => ({
      type: 'student',
      id: s.id,
      title: s.full_name,
      subtitle: `${s.class_level ?? ''} · ${rateById.get(s.id)}% attendance`.trim(),
      href: role === 'teacher' ? '/dashboard/teacher/attendance' : '/dashboard/principal/students',
    }))
    return { results, intent: 'attendance_below' }
  }

  // "Outstanding fees for JSS3"
  if (/outstanding/i.test(q) && /fee/i.test(q)) {
    const canSee = role === 'principal' || role === 'secretary' || role === 'bursar'
    if (!canSee) return { results: [], intent: 'outstanding_fees' }

    const classLevel = extractClassLevel(q)
    let query = supabase.from('payment_invoices')
      .select('id, amount_due_ngn, amount_paid_ngn, balance_ngn, status, profiles!student_id(full_name, class_level)')
      .eq('school_id', schoolId).neq('status', 'paid').order('balance_ngn', { ascending: false }).limit(30)
    const { data: invoices } = await query

    let rows = invoices ?? []
    if (classLevel) {
      rows = rows.filter((r: any) => (Array.isArray(r.profiles) ? r.profiles[0] : r.profiles)?.class_level === classLevel)
    }

    const results: SearchResult[] = rows.slice(0, MAX_PER_ENTITY).map((r: any) => {
      const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
      return {
        type: 'invoice',
        id: r.id,
        title: p?.full_name ?? 'Unknown student',
        subtitle: `Outstanding ₦${Number(r.balance_ngn ?? 0).toLocaleString()} (${p?.class_level ?? 'no class'})`,
        href: role === 'bursar' ? '/dashboard/bursar/invoices' : '/dashboard/secretary/records',
      }
    })
    return { results, intent: 'outstanding_fees' }
  }

  // "Assignments awaiting grading in my classes"
  if (/assignment/i.test(q) && /(awaiting grading|ungraded|not graded)/i.test(q)) {
    if (role !== 'teacher') return { results: [], intent: 'assignments_awaiting_grading' }

    const { data: rows } = await supabase.from('assignment_submissions')
      .select('id, status, graded_at, submitted_at, student:profiles!student_id(full_name), assignment:assignments!assignment_id(title, teacher_id, created_by, school_id)')
      .is('graded_at', null).order('submitted_at', { ascending: true }).limit(60)

    const mine = (rows ?? []).filter((r: any) => {
      const a = Array.isArray(r.assignment) ? r.assignment[0] : r.assignment
      return a?.school_id === schoolId && (a?.teacher_id === userId || a?.created_by === userId)
    })

    const results: SearchResult[] = mine.slice(0, MAX_PER_ENTITY).map((r: any) => {
      const s = Array.isArray(r.student) ? r.student[0] : r.student
      const a = Array.isArray(r.assignment) ? r.assignment[0] : r.assignment
      return {
        type: 'assignment',
        id: r.id,
        title: a?.title ?? 'Assignment',
        subtitle: `${s?.full_name ?? 'A student'} · submitted, not yet graded`,
        href: '/dashboard/teacher/submissions',
      }
    })
    return { results, intent: 'assignments_awaiting_grading' }
  }

  // "Admissions awaiting document verification"
  if (/admission/i.test(q) && /(verif|pending|awaiting)/i.test(q)) {
    const canSee = role === 'principal' || role === 'secretary'
    if (!canSee) return { results: [], intent: 'admissions_pending' }

    const { data: rows } = await supabase.from('admissions')
      .select('id, applicant_name, class_applied, status')
      .eq('school_id', schoolId).eq('status', 'pending').limit(MAX_PER_ENTITY)

    const results: SearchResult[] = (rows ?? []).map((r: any) => ({
      type: 'admission',
      id: r.id,
      title: r.applicant_name,
      subtitle: `Applying for ${r.class_applied ?? 'unspecified class'} · pending review`,
      href: '/dashboard/secretary/admissions',
    }))
    return { results, intent: 'admissions_pending' }
  }

  return null
}

// ─── Keyword search, role-scoped ───────────────────────────────────────

async function keywordSearch(
  supabase: any,
  caller: { userId: string; role: string; schoolId: string },
  q: string
): Promise<SearchResult[]> {
  const { schoolId, role, userId } = caller
  const term = likeTerm(q)

  if (role === 'principal' || role === 'secretary') {
    const [students, teachers, classes, subjects, invoices, announcements, events, books] = await Promise.all([
      searchProfiles(supabase, schoolId, term, 'student', '/dashboard/principal/students'),
      searchProfiles(supabase, schoolId, term, 'teacher', '/dashboard/principal/teachers'),
      searchClasses(supabase, schoolId, term, '/dashboard/principal/classes'),
      searchSubjects(supabase, schoolId, term),
      searchInvoices(supabase, schoolId, term, role === 'secretary' ? '/dashboard/secretary/records' : '/dashboard/principal/students'),
      searchAnnouncements(supabase, schoolId, term, role === 'secretary' ? '/dashboard/secretary/notices' : '/dashboard/principal/announcements'),
      searchEvents(supabase, schoolId, term),
      searchBooks(supabase, schoolId, term, role === 'secretary' ? '/dashboard/secretary/library' : '/dashboard/student/library'),
    ])
    return [...students, ...teachers, ...classes, ...subjects, ...invoices, ...announcements, ...events, ...books]
  }

  if (role === 'teacher') {
    const { data: myClasses } = await supabase.from('class_teachers')
      .select('class_id').eq('teacher_id', userId).eq('school_id', schoolId)
    const myClassIds = (myClasses ?? []).map((c: any) => c.class_id)

    const [students, classes, assignments, teachers, announcements, events, books] = await Promise.all([
      myClassIds.length ? searchProfiles(supabase, schoolId, term, 'student', '/dashboard/teacher/classes', myClassIds) : [],
      searchClasses(supabase, schoolId, term, '/dashboard/teacher/classes', myClassIds),
      searchAssignments(supabase, schoolId, term, userId),
      searchProfiles(supabase, schoolId, term, 'teacher', '/dashboard/teacher/profile'),
      searchAnnouncements(supabase, schoolId, term, '/dashboard/teacher/announcements'),
      searchEvents(supabase, schoolId, term),
      searchBooks(supabase, schoolId, term, '/dashboard/teacher/notes'),
    ])
    return [...students, ...classes, ...assignments, ...teachers, ...announcements, ...events, ...books]
  }

  if (role === 'bursar') {
    const [students, invoices, structures, announcements] = await Promise.all([
      searchProfiles(supabase, schoolId, term, 'student', '/dashboard/bursar/invoices'),
      searchInvoices(supabase, schoolId, term, '/dashboard/bursar/invoices'),
      searchFeeStructures(supabase, schoolId, term),
      searchAnnouncements(supabase, schoolId, term, '/dashboard/bursar/reminders'),
    ])
    return [...students, ...invoices, ...structures, ...announcements]
  }

  if (role === 'parent') {
    const { data: links } = await supabase.from('parent_student_links')
      .select('student_id, profiles!student_id(id, full_name, class_level)').eq('parent_id', userId)
    const childIds = (links ?? []).map((l: any) => l.student_id)
    const childMatches = (links ?? [])
      .map((l: any) => (Array.isArray(l.profiles) ? l.profiles[0] : l.profiles))
      .filter((p: any) => p?.full_name?.toLowerCase().includes(q.toLowerCase()))
      .map((p: any) => ({ type: 'student', id: p.id, title: p.full_name, subtitle: p.class_level ?? '', href: '/dashboard/parent' }))

    if (childIds.length === 0) {
      const [announcements, events] = await Promise.all([
        searchAnnouncements(supabase, schoolId, term, '/dashboard/parent'),
        searchEvents(supabase, schoolId, term),
      ])
      return [...childMatches, ...announcements, ...events]
    }

    const [invoices, announcements, events] = await Promise.all([
      searchInvoicesForStudents(supabase, schoolId, term, childIds, '/dashboard/parent/fees'),
      searchAnnouncements(supabase, schoolId, term, '/dashboard/parent'),
      searchEvents(supabase, schoolId, term),
    ])
    return [...childMatches, ...invoices, ...announcements, ...events]
  }

  if (role === 'student') {
    const [assignments, announcements, events, books] = await Promise.all([
      searchAssignmentsForStudent(supabase, schoolId, term, userId),
      searchAnnouncements(supabase, schoolId, term, '/dashboard/student'),
      searchEvents(supabase, schoolId, term),
      searchBooks(supabase, schoolId, term, '/dashboard/student/library'),
    ])
    return [...assignments, ...announcements, ...events, ...books]
  }

  // Appointment-based roles (ICT, Hostel, Counselor, Examination, Vice
  // Principal): a bounded, safe default rather than the full entity set
  // above, since each of these has its own narrower domain covered by
  // its own dedicated tools already. Announcements, events, and a staff
  // directory are useful and safe for all of them.
  const [teachers, announcements, events] = await Promise.all([
    searchProfiles(supabase, schoolId, term, 'teacher', `/dashboard/${role}`),
    searchAnnouncements(supabase, schoolId, term, `/dashboard/${role}`),
    searchEvents(supabase, schoolId, term),
  ])
  return [...teachers, ...announcements, ...events]
}

// ─── Per-entity search helpers ─────────────────────────────────────────

async function searchProfiles(
  supabase: any, schoolId: string, term: string, role: 'student' | 'teacher', href: string, classIds?: string[]
): Promise<SearchResult[]> {
  let query = supabase.from('profiles')
    .select('id, full_name, class_level')
    .eq('school_id', schoolId).eq('role', role)
    .ilike('full_name', term).limit(MAX_PER_ENTITY)
  if (classIds && classIds.length) {
    // student_profiles.class_id is the current, write-path-maintained
    // value (see student dashboard page.tsx), profiles.class_id goes
    // stale after a promotion/transfer, so class-scoped student lookups
    // must go through student_profiles, not profiles, to avoid a
    // teacher's search silently missing students who were just moved
    // into their class or still showing ones who were moved out.
    const { data: inClass } = await supabase.from('student_profiles').select('id').in('class_id', classIds)
    const allowedIds = (inClass ?? []).map((r: any) => r.id)
    if (allowedIds.length === 0) return []
    query = query.in('id', allowedIds)
  }
  const { data } = await query
  return (data ?? []).map((p: any) => ({
    type: role, id: p.id, title: p.full_name, subtitle: p.class_level ?? '', href,
  }))
}

async function searchClasses(supabase: any, schoolId: string, term: string, href: string, classIds?: string[]): Promise<SearchResult[]> {
  let query = supabase.from('classes').select('id, name, class_level').eq('school_id', schoolId).ilike('name', term).limit(MAX_PER_ENTITY)
  if (classIds) query = query.in('id', classIds)
  const { data } = await query
  return (data ?? []).map((c: any) => ({ type: 'class', id: c.id, title: c.name, subtitle: c.class_level ?? '', href }))
}

async function searchSubjects(supabase: any, schoolId: string, term: string): Promise<SearchResult[]> {
  const { data } = await supabase.from('subjects').select('id, name').eq('school_id', schoolId).ilike('name', term).limit(MAX_PER_ENTITY)
  return (data ?? []).map((s: any) => ({ type: 'subject', id: s.id, title: s.name, subtitle: 'Subject', href: '/dashboard/principal/classes' }))
}

async function searchAssignments(supabase: any, schoolId: string, term: string, teacherId: string): Promise<SearchResult[]> {
  const { data } = await supabase.from('assignments')
    .select('id, title, subject').eq('school_id', schoolId).eq('posted_by', teacherId).ilike('title', term).limit(MAX_PER_ENTITY)
  return (data ?? []).map((a: any) => ({ type: 'assignment', id: a.id, title: a.title, subtitle: a.subject ?? 'Assignment', href: '/dashboard/teacher/assignments' }))
}

async function searchAssignmentsForStudent(supabase: any, schoolId: string, term: string, studentId: string): Promise<SearchResult[]> {
  // See searchProfiles' comment: student_profiles.class_id is current,
  // profiles.class_id can be stale after a promotion/transfer.
  const { data: sp } = await supabase.from('student_profiles').select('class_id').eq('id', studentId).maybeSingle()
  const { data: profile } = await supabase.from('profiles').select('class_id').eq('id', studentId).single()
  const classId = sp?.class_id ?? profile?.class_id ?? null
  if (!classId) return []
  const { data } = await supabase.from('assignments')
    .select('id, title, subject').eq('school_id', schoolId).eq('class_id', classId).ilike('title', term).limit(MAX_PER_ENTITY)
  return (data ?? []).map((a: any) => ({ type: 'assignment', id: a.id, title: a.title, subtitle: a.subject ?? 'Assignment', href: '/dashboard/student/assignments' }))
}

async function searchInvoices(supabase: any, schoolId: string, term: string, href: string): Promise<SearchResult[]> {
  const { data } = await supabase.from('payment_invoices')
    .select('id, balance_ngn, status, profiles!student_id(full_name)')
    .eq('school_id', schoolId).limit(50)
  const filtered = (data ?? []).filter((r: any) => {
    const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
    return p?.full_name?.toLowerCase().includes(term.replace(/%/g, '').toLowerCase())
  }).slice(0, MAX_PER_ENTITY)
  return filtered.map((r: any) => {
    const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
    return { type: 'invoice', id: r.id, title: p?.full_name ?? 'Unknown', subtitle: `${r.status} · ₦${Number(r.balance_ngn ?? 0).toLocaleString()} balance`, href }
  })
}

async function searchInvoicesForStudents(supabase: any, schoolId: string, term: string, studentIds: string[], href: string): Promise<SearchResult[]> {
  const { data } = await supabase.from('payment_invoices')
    .select('id, balance_ngn, status, profiles!student_id(full_name)')
    .eq('school_id', schoolId).in('student_id', studentIds).limit(MAX_PER_ENTITY)
  return (data ?? []).map((r: any) => {
    const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
    return { type: 'invoice', id: r.id, title: p?.full_name ?? 'Your child', subtitle: `${r.status} · ₦${Number(r.balance_ngn ?? 0).toLocaleString()} balance`, href }
  })
}

async function searchFeeStructures(supabase: any, schoolId: string, term: string): Promise<SearchResult[]> {
  const { data } = await supabase.from('fee_structures')
    .select('id, description, amount_ngn, term, classes(name)').eq('school_id', schoolId).ilike('description', term).limit(MAX_PER_ENTITY)
  return (data ?? []).map((f: any) => {
    const c = Array.isArray(f.classes) ? f.classes[0] : f.classes
    return { type: 'invoice', id: f.id, title: f.description ?? 'Fee item', subtitle: `₦${Number(f.amount_ngn ?? 0).toLocaleString()} · ${c?.name ?? ''}`, href: '/dashboard/bursar/fees' }
  })
}

async function searchAnnouncements(supabase: any, schoolId: string, term: string, href: string): Promise<SearchResult[]> {
  const { data } = await supabase.from('announcements')
    .select('id, title').eq('school_id', schoolId).ilike('title', term).limit(MAX_PER_ENTITY)
  return (data ?? []).map((a: any) => ({ type: 'announcement', id: a.id, title: a.title, subtitle: 'Announcement', href }))
}

async function searchEvents(supabase: any, schoolId: string, term: string): Promise<SearchResult[]> {
  const { data } = await supabase.from('events')
    .select('id, title, start_date').eq('school_id', schoolId).ilike('title', term).limit(MAX_PER_ENTITY)
  return (data ?? []).map((e: any) => ({ type: 'event', id: e.id, title: e.title, subtitle: e.start_date ?? 'Event', href: '/dashboard' }))
}

async function searchBooks(supabase: any, schoolId: string, term: string, href: string): Promise<SearchResult[]> {
  const { data } = await supabase.from('library_books')
    .select('id, title, author').eq('school_id', schoolId).ilike('title', term).limit(MAX_PER_ENTITY)
  return (data ?? []).map((b: any) => ({ type: 'book', id: b.id, title: b.title, subtitle: b.author ?? 'Library book', href }))
}
