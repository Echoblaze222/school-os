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
import { enqueueJob } from '@/lib/queue'
import { checkRateLimit } from '@/lib/rateLimit'

const ALLOWED_ROLES = ['principal', 'bursar', 'secretary', 'teacher']

// Above this many recipients, process synchronously in the request is
// the §68 violation this route used to be: up to 200 recipients each
// doing a DB insert + phone lookup + up to two external Termii calls,
// sequentially, inside one HTTP request. Below the threshold it's fast
// enough that queueing would just add latency for no benefit (a
// teacher notifying their 25-student class shouldn't wait on a cron
// tick). Threshold is deliberately well under the 200 hard cap.
const SYNC_THRESHOLD = 15

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

  // Cap how often one account can trigger a send at all — independent
  // of the sync/queue split below, this stops a compromised or
  // careless account from repeatedly re-triggering large sends.
  const rl = await checkRateLimit(admin, 'notifications_send', user.id, 20, 300)
  if (!rl.allowed) {
    return NextResponse.json({ ok: false, error: rl.errorResponse!.error }, { status: rl.errorResponse!.status })
  }

  if (scopedRecipientIds.length > SYNC_THRESHOLD) {
    // Bulk path — enqueue and return immediately instead of blocking
    // the request on up to 200 sequential sends. Same job_type and
    // payload shape the Lane 1 worker (api/cron/process-queue) already
    // handles for bulk_notification, so this reuses that consumer
    // rather than building a second queue path.
    const enqueueResult = await enqueueJob(admin, 'bulk_notification', {
      recipientIds: scopedRecipientIds,
      title,
      body: notificationBody,
      type,
      linkUrl,
      referenceId,
      referenceTable,
    }, { schoolId })

    if (!enqueueResult.ok) {
      return NextResponse.json({ ok: false, error: 'Could not queue the send. Please try again.' }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      queued: true,
      jobId: enqueueResult.jobId,
      totalRecipients: scopedRecipientIds.length,
      message: `Queued for ${scopedRecipientIds.length} recipients — delivery runs in the background and completes within a minute.`,
    })
  }

  // Small send — fast enough to just do inline.
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
    queued: false,
    sentCount,
    totalRecipients: scopedRecipientIds.length,
    results,
  })
}
