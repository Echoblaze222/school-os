// src/app/api/notices/email/route.ts
// Emails important school notices (and adds an in-app notification).
//
//   Meeting notice:
//     { kind: 'meeting', title, date, time, venue, note?,
//       audience: 'parents' | 'teachers' | 'staff' | 'all' | 'class_parents',
//       class_id? }                      (class_id required for 'class_parents')
//   Results published:
//     { kind: 'results', term, session, class_id? }   (emails parents of active students)
//
// Retry-safe: dedupeKey is derived from the notice itself, so sending the
// same notice twice (double click, retry) will not email anyone twice.
// Capped at MAX_RECIPIENTS per call to stay inside the function time limit.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/rateLimit'
import { queueEmail } from '@/lib/email/queueEmail'
import { meetingNoticeEmail, resultsEmail } from '@/lib/email/templates'

export const maxDuration = 60

const ALLOWED_ROLES = [
  'principal', 'vice_principal', 'vice-principal', 'secretary', 'examination', 'super_admin',
]
const STAFF_ROLES = [
  'teacher', 'vice_principal', 'vice-principal', 'bursar', 'secretary', 'counselor',
  'nurse', 'librarian', 'ict', 'examination', 'hostel', 'coach',
]
const MAX_RECIPIENTS = 500
const CONCURRENCY = 5

const clean = (v: unknown, max: number) =>
  typeof v === 'string' ? v.trim().slice(0, max) : ''

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)

interface Recipient {
  id: string
  email: string
  name: string
  role: string
  children?: string[]
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('school_id, role')
    .eq('id', user.id)
    .single()

  if (!profile?.school_id || !ALLOWED_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  if (!body || (body.kind !== 'meeting' && body.kind !== 'results')) {
    return NextResponse.json({ error: "kind must be 'meeting' or 'results'" }, { status: 400 })
  }

  const admin = createAdminClient()

  const rl = await checkRateLimit(admin, 'send_notice_email', user.id, 10, 300)
  if (!rl.allowed) {
    return NextResponse.json({ error: rl.errorResponse!.error }, { status: rl.errorResponse!.status })
  }

  const { data: school } = await admin
    .from('schools')
    .select('name, primary_color')
    .eq('id', profile.school_id)
    .single()
  const schoolName = school?.name ?? 'SchoolOS'
  const brandColor = school?.primary_color ?? undefined
  const appUrl = process.env.NEXT_PUBLIC_APP_URL

  // ---------- Build recipient list + per-recipient email ----------
  let recipients: Recipient[] = []
  let build: (r: Recipient) => { subject: string; html: string }
  let dedupeBase: string
  let notifyTitle: string
  let notifyBody: (r: Recipient) => string
  let actionUrl: (r: Recipient) => string | null

  if (body.kind === 'meeting') {
    const title = clean(body.title, 120)
    const date = clean(body.date, 60)
    const time = clean(body.time, 40)
    const venue = clean(body.venue, 300)
    const note = clean(body.note, 500) || undefined
    const audience = body.audience

    if (!title || !date || !time || !venue) {
      return NextResponse.json({ error: 'title, date, time and venue are required' }, { status: 400 })
    }
    if (!['parents', 'teachers', 'staff', 'all', 'class_parents'].includes(audience)) {
      return NextResponse.json({ error: 'Invalid audience' }, { status: 400 })
    }

    let people: any[] = []

    if (audience === 'class_parents') {
      const classId = clean(body.class_id, 64)
      if (!classId) {
        return NextResponse.json({ error: "class_id is required for audience 'class_parents'" }, { status: 400 })
      }
      const { data: studs, error: studErr } = await admin
        .from('profiles')
        .select('parent_id')
        .eq('school_id', profile.school_id)
        .eq('role', 'student')
        .eq('is_active', true)
        .eq('class_id', classId)
        .not('parent_id', 'is', null)
        .limit(MAX_RECIPIENTS * 3)
      if (studErr) return NextResponse.json({ error: studErr.message }, { status: 500 })

      const pids = Array.from(new Set((studs ?? []).map((s: any) => s.parent_id))).slice(0, MAX_RECIPIENTS)
      if (pids.length) {
        const { data, error } = await admin
          .from('profiles')
          .select('id, email, full_name, role')
          .in('id', pids)
          .not('email', 'is', null)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        people = data ?? []
      }
    } else {
      const roles =
        audience === 'parents' ? ['parent']
        : audience === 'teachers' ? ['teacher']
        : audience === 'staff' ? STAFF_ROLES
        : ['parent', 'teacher']
      const { data, error } = await admin
        .from('profiles')
        .select('id, email, full_name, role')
        .eq('school_id', profile.school_id)
        .in('role', roles)
        .not('email', 'is', null)
        .limit(MAX_RECIPIENTS)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      people = data ?? []
    }

    recipients = people.map((p: any) => ({
      id: p.id, email: p.email, name: p.full_name ?? 'there', role: p.role,
    }))

    build = (r) => meetingNoticeEmail({
      schoolName, brandColor, recipientName: r.name, meetingTitle: title, date, time, venue, note,
    })
    dedupeBase = `notice-meeting-${slug(title)}-${slug(date)}`
    notifyTitle = `Meeting: ${title}`
    notifyBody = () => `${date}, ${time} at ${venue}.`
    actionUrl = (r) => (r.role === 'parent' ? '/dashboard/parent/meetings' : null)
  } else {
    const term = clean(body.term, 40)
    const session = clean(body.session, 20)
    const classId = clean(body.class_id, 64) || null
    if (!term || !session) {
      return NextResponse.json({ error: 'term and session are required' }, { status: 400 })
    }

    let studentQuery = admin
      .from('profiles')
      .select('id, full_name, parent_id')
      .eq('school_id', profile.school_id)
      .eq('role', 'student')
      .eq('is_active', true)
      .not('parent_id', 'is', null)
      .limit(MAX_RECIPIENTS * 3)
    if (classId) studentQuery = studentQuery.eq('class_id', classId)

    const { data: students, error } = await studentQuery
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const childrenByParent = new Map<string, string[]>()
    for (const s of students ?? []) {
      const list = childrenByParent.get((s as any).parent_id) ?? []
      list.push((s as any).full_name ?? 'your child')
      childrenByParent.set((s as any).parent_id, list)
    }

    const parentIds = Array.from(childrenByParent.keys()).slice(0, MAX_RECIPIENTS)
    const { data: parents } = parentIds.length
      ? await admin.from('profiles').select('id, email, full_name').in('id', parentIds).not('email', 'is', null)
      : { data: [] as any[] }

    recipients = (parents ?? []).map((p: any) => ({
      id: p.id, email: p.email, name: p.full_name ?? 'Parent', role: 'parent',
      children: childrenByParent.get(p.id) ?? [],
    }))

    build = (r) => resultsEmail({
      schoolName, brandColor, parentName: r.name,
      studentName: (r.children ?? []).join(' and ') || 'your child',
      term, session, resultsUrl: `${appUrl}/dashboard/parent/results`,
    })
    dedupeBase = `notice-results-${slug(term)}-${slug(session)}-${classId ?? 'all'}`
    notifyTitle = 'Results published'
    notifyBody = (r) => `${term} (${session}) results for ${(r.children ?? []).join(' and ') || 'your child'} are ready.`
    actionUrl = () => '/dashboard/parent/results'
  }

  if (recipients.length === 0) {
    return NextResponse.json({ ok: true, message: 'No recipients with an email on file.', emailed: 0 })
  }

  // ---------- Send ----------
  const result = { emailed: 0, deduped: 0, queued: 0, failed: 0 }
  const notifyRows: any[] = []
  const queue = [...recipients]

  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length) {
        const r = queue.shift()!
        try {
          const { subject, html } = build(r)
          const out = await queueEmail({
            schoolId: profile.school_id,
            recipientId: r.id,
            to: r.email,
            subject,
            html,
            referenceTable: 'schools',
            referenceId: profile.school_id,
            dedupeKey: dedupeBase,
          })
          if (out.status === 'sent') result.emailed++
          else if (out.status === 'deduped') result.deduped++
          else if (out.status === 'queued') result.queued++
          else result.failed++

          if (out.status !== 'deduped') {
            notifyRows.push({
              user_id: r.id,
              school_id: profile.school_id,
              type: 'system',
              title: notifyTitle,
              body: notifyBody(r),
              action_url: actionUrl(r),
              is_read: false,
            })
          }
        } catch {
          result.failed++
        }
      }
    }),
  )

  if (notifyRows.length) {
    await admin.from('notifications').insert(notifyRows)
  }

  return NextResponse.json({
    ok: true,
    recipients: recipients.length,
    ...result,
    capped: recipients.length >= MAX_RECIPIENTS,
  })
}
