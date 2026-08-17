// src/app/api/notifications/send/route.ts
// Client-facing entry point for the SMS/WhatsApp notification system.
// Auth + role check happen here; the actual sending happens in notifyUser().
//
// Called from: bursar Reminders ("Send to N parents"), and — once wired up —
// teacher attendance/results submission, principal/secretary announcements.
// Only principal/bursar/secretary/teacher roles may trigger sends, and only
// for their own school.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notifyUsers, type NotifyChannel } from '@/lib/notify/notifyUser'

const ALLOWED_ROLES = ['principal', 'bursar', 'secretary', 'teacher']

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, school_id')
    .eq('id', user.id)
    .single()

  if (!profile || !ALLOWED_ROLES.includes(profile.role)) {
    return NextResponse.json({ ok: false, error: 'Not permitted to send notifications' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 })
  }

  const {
    recipientIds, title, notificationBody, type,
    channels, referenceId, referenceTable, linkUrl, actionUrl,
  }: {
    recipientIds: string[]
    title: string
    notificationBody: string
    type: string
    channels?: NotifyChannel[]
    referenceId?: string
    referenceTable?: string
    linkUrl?: string
    actionUrl?: string
  } = body

  if (!Array.isArray(recipientIds) || recipientIds.length === 0 || !title || !notificationBody || !type) {
    return NextResponse.json(
      { ok: false, error: 'recipientIds (array), title, notificationBody, and type are required' },
      { status: 400 }
    )
  }
  if (recipientIds.length > 200) {
    return NextResponse.json(
      { ok: false, error: 'Max 200 recipients per request. Split into batches for larger sends' },
      { status: 400 }
    )
  }

  // school_id is always taken from the caller's own profile, never from the
  // request body — prevents a school from sending notifications "as" another school.
  const schoolId = profile.school_id

  // notifyUser() looks up any recipientId's phone number and sends real,
  // billed SMS/WhatsApp with no school check of its own — so this route
  // MUST filter recipientIds down to people actually in the caller's
  // school before calling it. Without this, any staff account (even at an
  // unverified trial school) could pass arbitrary UUIDs and spam real
  // phone numbers platform-wide at the platform's expense.
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const admin = createAdminClient()
  const { data: schoolMembers } = await admin
    .from('profiles')
    .select('id')
    .eq('school_id', schoolId)
    .in('id', recipientIds)

  const scopedRecipientIds = (schoolMembers ?? []).map((m: any) => m.id)
  if (scopedRecipientIds.length === 0) {
    return NextResponse.json({ ok: false, error: 'No valid recipients in your school' }, { status: 400 })
  }

  const results = await notifyUsers(scopedRecipientIds, {
    schoolId,
    title,
    body: notificationBody,
    type,
    channels: channels ?? ['whatsapp', 'sms'],
    referenceId,
    referenceTable,
    linkUrl,
    actionUrl,
  })

  const sentCount = results.filter(r => r.deliveries.some(d => d.status === 'sent')).length

  return NextResponse.json({
    ok: true,
    sentCount,
    totalRecipients: scopedRecipientIds.length,
    results,
  })
}
