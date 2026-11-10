// src/app/api/bursar/send-fee-reminders/route.ts
// Emails parents about outstanding fees (and adds an in-app notification).
// One email per parent + student, listing every unpaid fee for that child,
// so a parent with several fee lines is not spammed.
//
// Body (all optional): { invoice_ids?: string[] }
//   - omit to remind for every unpaid invoice in the caller's school
//   - pass invoice_ids to remind only for those invoices
//
// Retry-safe: dedupeKey is per student per day (Lagos time), so a double
// click or a retried request cannot email the same parent twice that day.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/rateLimit'
import { queueEmail } from '@/lib/email/queueEmail'
import { feeReminderEmail } from '@/lib/email/templates'

export const maxDuration = 60

const ALLOWED_ROLES = ['bursar', 'principal', 'super_admin']
const MAX_INVOICES = 500
const CONCURRENCY = 5

interface Group {
  parentId: string
  studentId: string
  studentName: string
  fees: string[]
  total: number
  earliestDue: string | null
  overdue: boolean
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

  const body = await req.json().catch(() => ({}))
  const invoiceIds: string[] | undefined =
    Array.isArray(body?.invoice_ids) && body.invoice_ids.length > 0
      ? body.invoice_ids.filter((x: unknown) => typeof x === 'string').slice(0, MAX_INVOICES)
      : undefined

  const admin = createAdminClient()

  const rl = await checkRateLimit(admin, 'bursar_send_fee_reminders', user.id, 5, 300)
  if (!rl.allowed) {
    return NextResponse.json({ error: rl.errorResponse!.error }, { status: rl.errorResponse!.status })
  }

  // 1. Unpaid invoices for this school
  let invQuery = admin
    .from('payment_invoices')
    .select('id, student_id, balance_ngn, status, due_date, fee_structures(description)')
    .eq('school_id', profile.school_id)
    .gt('balance_ngn', 0)
    .in('status', ['pending', 'partial', 'overdue'])
    .limit(MAX_INVOICES)
  if (invoiceIds) invQuery = invQuery.in('id', invoiceIds)

  const { data: invoices, error: invErr } = await invQuery
  if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 })
  if (!invoices || invoices.length === 0) {
    return NextResponse.json({ ok: true, message: 'No unpaid invoices found.', emailed: 0 })
  }

  // 2. Students -> parents
  const studentIds = Array.from(new Set(invoices.map((i: any) => i.student_id)))
  const { data: students } = await admin
    .from('profiles')
    .select('id, full_name, parent_id')
    .in('id', studentIds)

  const studentMap = new Map((students ?? []).map((s: any) => [s.id, s]))
  const parentIds = Array.from(
    new Set((students ?? []).map((s: any) => s.parent_id).filter(Boolean)),
  ) as string[]

  const { data: parents } = parentIds.length
    ? await admin.from('profiles').select('id, full_name, email').in('id', parentIds)
    : { data: [] as any[] }
  const parentMap = new Map((parents ?? []).map((p: any) => [p.id, p]))

  const { data: school } = await admin
    .from('schools')
    .select('name, primary_color')
    .eq('id', profile.school_id)
    .single()

  // 3. Group by parent + student
  const todayLagos = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' })
  const groups = new Map<string, Group>()
  let noParent = 0

  for (const inv of invoices as any[]) {
    const student = studentMap.get(inv.student_id)
    if (!student?.parent_id) { noParent++; continue }

    const fs = Array.isArray(inv.fee_structures) ? inv.fee_structures[0] : inv.fee_structures
    const key = `${student.parent_id}::${student.id}`
    const g = groups.get(key) ?? {
      parentId: student.parent_id,
      studentId: student.id,
      studentName: student.full_name ?? 'your child',
      fees: [],
      total: 0,
      earliestDue: null,
      overdue: false,
    }

    g.fees.push(fs?.description || 'School fees')
    g.total += Number(inv.balance_ngn) || 0
    if (inv.due_date && (!g.earliestDue || inv.due_date < g.earliestDue)) g.earliestDue = inv.due_date
    if (inv.status === 'overdue' || (inv.due_date && inv.due_date < todayLagos)) g.overdue = true
    groups.set(key, g)
  }

  const payUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/parent/fees`
  const list = Array.from(groups.values())

  const result = { emailed: 0, deduped: 0, queued: 0, failed: 0, noEmail: 0 }
  const notifyRows: any[] = []

  async function sendOne(g: Group) {
    const parent = parentMap.get(g.parentId)
    if (!parent?.email) { result.noEmail++; return }

    const { subject, html } = feeReminderEmail({
      schoolName: school?.name ?? 'SchoolOS',
      brandColor: school?.primary_color ?? undefined,
      parentName: parent.full_name ?? 'Parent',
      studentName: g.studentName,
      feeName: Array.from(new Set(g.fees)).join(', '),
      amountDue: g.total,
      dueDate: g.earliestDue
        ? new Date(g.earliestDue).toLocaleDateString('en-NG', { dateStyle: 'long' })
        : undefined,
      payUrl,
      overdue: g.overdue,
    })

    const r = await queueEmail({
      schoolId: profile!.school_id,
      recipientId: g.parentId,
      to: parent.email,
      subject,
      html,
      referenceTable: 'payment_invoices',
      dedupeKey: `fee-reminder-${g.studentId}-${todayLagos}`,
    })

    if (r.status === 'sent') result.emailed++
    else if (r.status === 'deduped') result.deduped++
    else if (r.status === 'queued') result.queued++
    else result.failed++

    if (r.status !== 'deduped') {
      notifyRows.push({
        user_id: g.parentId,
        school_id: profile!.school_id,
        type: 'payment',
        title: g.overdue ? 'Overdue fee notice' : 'Fee reminder',
        body: `${g.studentName} has an outstanding balance of ₦${g.total.toLocaleString('en-NG')}.`,
        action_url: '/dashboard/parent/fees',
        is_read: false,
      })
    }
  }

  const queue = [...list]
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length) {
        const g = queue.shift()!
        try { await sendOne(g) } catch { result.failed++ }
      }
    }),
  )

  if (notifyRows.length) {
    await admin.from('notifications').insert(notifyRows)
  }

  return NextResponse.json({
    ok: true,
    parents: list.length,
    ...result,
    skippedNoParent: noParent,
    capped: invoices.length >= MAX_INVOICES,
  })
}
