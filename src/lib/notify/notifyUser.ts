// src/lib/notify/notifyUser.ts
// Server-only. Core notification fan-out: writes the in-app `notifications`
// row (existing behavior, unchanged) AND, when requested, sends WhatsApp
// and/or SMS via Termii — logging every attempt to `notification_deliveries`.
//
// Call this from API routes / server actions only (it uses the service-role
// client to look up any recipient's phone number). Never import it into a
// client component.
//
// Lane 3 additions on top of the existing behavior (both backward
// compatible — omit either and nothing changes for existing callers):
//   - dedupeKey: skips the send entirely if this exact
//     (recipientId, dedupeKey) pair was already processed. Pass a stable
//     key from retryable callers — a webhook handler, a cron re-run, a
//     queue job retry — e.g. `paystack:${reference}`. See
//     docs/lane3-notifications/01-preferences-and-dedup-schema.sql.
//   - Category-level preference check via `notification_preferences`,
//     falling back to the existing profiles.notify_whatsapp/notify_sms
//     booleans when no per-category row exists, so nothing changes for
//     users who've never touched their preferences.

import { createAdminClient } from '@/lib/supabase/admin'
import { sendSms, sendWhatsApp, normalizeNigerianPhone } from './termii'

export type NotifyChannel = 'whatsapp' | 'sms'

// Categories that ignore user preference entirely — security/critical
// school-safety notifications (§64: "Critical school/security
// notifications may remain mandatory where justified"). Keep this list
// short and deliberate; it's a bypass, not a default.
const MANDATORY_CATEGORIES = new Set(['security_alert', 'account_security', 'subscription_suspended'])

export interface NotifyUserInput {
  recipientId: string
  schoolId: string
  title: string
  body: string
  /** Matches the existing `notifications.type` free-text convention (e.g. 'attendance', 'fee_reminder', 'announcement'). Also the key checked against `notification_preferences.category`. */
  type: string
  /** Which outbound channels to attempt, in priority order. Defaults to ['whatsapp', 'sms'] — WhatsApp first, SMS as fallback, per the brief. */
  channels?: NotifyChannel[]
  /** If a channel send fails (or the recipient has it disabled), try the next one in `channels`. Defaults to true. */
  fallback?: boolean
  linkUrl?: string
  actionUrl?: string
  referenceId?: string
  referenceTable?: string
  /** Stable key for retry-safe callers (webhooks, cron, queue jobs) — see file header. Omit for normal UI-triggered, non-retried sends. */
  dedupeKey?: string
}

export interface NotifyUserResult {
  notificationId: string | null
  deliveries: Array<{ channel: NotifyChannel; status: 'sent' | 'failed' | 'skipped'; error?: string }>
  /** True if this call was a no-op because dedupeKey matched a prior call. */
  deduped?: boolean
}

export async function notifyUser(input: NotifyUserInput): Promise<NotifyUserResult> {
  const {
    recipientId, schoolId, title, body, type,
    channels = ['whatsapp', 'sms'],
    fallback = true,
    linkUrl, actionUrl, referenceId, referenceTable, dedupeKey,
  } = input

  const supabase = createAdminClient()
  const deliveries: NotifyUserResult['deliveries'] = []

  // 0. Dedup check — if this exact recipient+dedupeKey already has a
  //    notification row, this is a retry of something already handled.
  //    Return the existing id rather than sending anything again.
  if (dedupeKey) {
    const { data: existing } = await supabase
      .from('notifications')
      .select('id')
      .eq('user_id', recipientId)
      .eq('dedupe_key', dedupeKey)
      .maybeSingle()

    if (existing) {
      return { notificationId: existing.id, deliveries: [], deduped: true }
    }
  }

  // 1. In-app notification — unchanged existing behavior, always written
  //    (in-app history isn't gated by channel preference; only the
  //    outbound push/SMS/WhatsApp sends are).
  const { data: notifRow, error: notifErr } = await supabase
    .from('notifications')
    .insert({
      user_id: recipientId,
      school_id: schoolId,
      title,
      body,
      type,
      link_url: linkUrl ?? null,
      action_url: actionUrl ?? null,
      reference_id: referenceId ?? null,
      reference_table: referenceTable ?? null,
      dedupe_key: dedupeKey ?? null,
    })
    .select('id')
    .single()

  if (notifErr) {
    // A unique-violation here means a concurrent call raced us on the
    // same dedupeKey between the check above and this insert — treat it
    // as a successful dedup rather than an error.
    if (dedupeKey && notifErr.code === '23505') {
      const { data: existing } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', recipientId)
        .eq('dedupe_key', dedupeKey)
        .maybeSingle()
      return { notificationId: existing?.id ?? null, deliveries: [], deduped: true }
    }
    // Still attempt SMS/WhatsApp below even if the in-app row failed —
    // the parent shouldn't miss a fee/attendance alert over an unrelated bug.
    console.error('notifyUser: failed to insert in-app notification', notifErr)
  }
  const notificationId = notifRow?.id ?? null

  // 1b. This row insert is what fires the push-notification DB trigger
  //     (see api/internal/push-on-notification/route.ts). The trigger
  //     itself doesn't currently know about per-category push
  //     preference — see docs/lane3-notifications/02-push-trigger-
  //     RECONSTRUCTED-please-review.sql for why, and what would close
  //     that gap. Until that's applied, a category with push_enabled:
  //     false in notification_preferences still gets an in-app row (as
  //     it should) but may still trigger a push (known gap, documented,
  //     not silently ignored).

  // 2. Look up recipient's phone, mandatory-category override, and
  //    category-level preferences (falling back to the profile-level
  //    booleans when no per-category row exists).
  const isMandatory = MANDATORY_CATEGORIES.has(type)

  const [{ data: recipient }, { data: categoryPref }] = await Promise.all([
    supabase.from('profiles').select('phone, notify_whatsapp, notify_sms').eq('id', recipientId).single(),
    isMandatory
      ? Promise.resolve({ data: null })
      : supabase.from('notification_preferences').select('whatsapp_enabled, sms_enabled')
          .eq('user_id', recipientId).eq('category', type).maybeSingle(),
  ])

  if (!recipient?.phone) {
    // No phone on file — nothing more to do, in-app notification still stands.
    return { notificationId, deliveries: [] }
  }

  const phoneValid = !!normalizeNigerianPhone(recipient.phone)
  if (!phoneValid) {
    deliveries.push({ channel: channels[0], status: 'skipped', error: `Unrecognized phone format: ${recipient.phone}` })
    return { notificationId, deliveries }
  }

  // 3. Try each requested channel in order, honoring per-user preferences,
  //    stopping at the first success unless the caller wants both sent.
  for (const channel of channels) {
    const channelEnabled = isMandatory
      ? true
      : channel === 'whatsapp'
        ? (categoryPref?.whatsapp_enabled ?? recipient.notify_whatsapp) !== false
        : (categoryPref?.sms_enabled ?? recipient.notify_sms) !== false

    if (!channelEnabled) {
      deliveries.push({ channel, status: 'skipped', error: `${channel} disabled for this recipient/category` })
      continue
    }

    // Same dedupe protection on the billed-channel side, independently
    // from the in-app row above — a duplicate in-app notification is
    // free, a duplicate SMS is a real charge.
    if (dedupeKey) {
      const { data: existingDelivery } = await supabase
        .from('notification_deliveries')
        .select('id, status')
        .eq('recipient_id', recipientId)
        .eq('channel', channel)
        .eq('dedupe_key', dedupeKey)
        .maybeSingle()
      if (existingDelivery) {
        deliveries.push({ channel, status: existingDelivery.status === 'sent' ? 'sent' : 'skipped', error: 'deduped' })
        if (existingDelivery.status === 'sent') break
        continue
      }
    }

    const result = channel === 'whatsapp'
      ? await sendWhatsApp(recipient.phone, body)
      : await sendSms(recipient.phone, body)

    await supabase.from('notification_deliveries').insert({
      school_id: schoolId,
      recipient_id: recipientId,
      notification_id: notificationId,
      channel,
      status: result.ok ? 'sent' : 'failed',
      to_phone: recipient.phone,
      message_body: body,
      provider: 'termii',
      provider_message_id: result.messageId ?? null,
      error: result.ok ? null : result.error,
      reference_table: referenceTable ?? null,
      reference_id: referenceId ?? null,
      sent_at: result.ok ? new Date().toISOString() : null,
      dedupe_key: dedupeKey ?? null,
    })

    deliveries.push({ channel, status: result.ok ? 'sent' : 'failed', error: result.ok ? undefined : result.error })

    if (result.ok || !fallback) break // success, or caller doesn't want fallback — stop here
  }

  return { notificationId, deliveries }
}

/** Convenience wrapper for sending the same notification to many recipients (e.g. a whole class). */
export async function notifyUsers(
  recipientIds: string[],
  rest: Omit<NotifyUserInput, 'recipientId'>
): Promise<Array<{ recipientId: string } & NotifyUserResult>> {
  const results = []
  for (const recipientId of recipientIds) {
    results.push({ recipientId, ...(await notifyUser({ ...rest, recipientId })) })
  }
  return results
}
