// src/lib/notify/notifyUser.ts
// Server-only. Core notification fan-out: writes the in-app `notifications`
// row (existing behavior, unchanged) AND, when requested, sends WhatsApp
// and/or SMS via Termii — logging every attempt to `notification_deliveries`.
//
// Call this from API routes / server actions only (it uses the service-role
// client to look up any recipient's phone number). Never import it into a
// client component.

import { createAdminClient } from '@/lib/supabase/admin'
import { sendSms, sendWhatsApp, normalizeNigerianPhone } from './termii'

export type NotifyChannel = 'whatsapp' | 'sms'

export interface NotifyUserInput {
  recipientId: string
  schoolId: string
  title: string
  body: string
  /** Matches the existing `notifications.type` free-text convention (e.g. 'attendance', 'fee_reminder', 'announcement'). */
  type: string
  /** Which outbound channels to attempt, in priority order. Defaults to ['whatsapp', 'sms'] — WhatsApp first, SMS as fallback, per the brief. */
  channels?: NotifyChannel[]
  /** If a channel send fails (or the recipient has it disabled), try the next one in `channels`. Defaults to true. */
  fallback?: boolean
  linkUrl?: string
  actionUrl?: string
  referenceId?: string
  referenceTable?: string
}

export interface NotifyUserResult {
  notificationId: string | null
  deliveries: Array<{ channel: NotifyChannel; status: 'sent' | 'failed' | 'skipped'; error?: string }>
}

export async function notifyUser(input: NotifyUserInput): Promise<NotifyUserResult> {
  const {
    recipientId, schoolId, title, body, type,
    channels = ['whatsapp', 'sms'],
    fallback = true,
    linkUrl, actionUrl, referenceId, referenceTable,
  } = input

  const supabase = createAdminClient()
  const deliveries: NotifyUserResult['deliveries'] = []

  // 1. In-app notification — unchanged existing behavior, always written.
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
    })
    .select('id')
    .single()

  if (notifErr) {
    // Still attempt SMS/WhatsApp below even if the in-app row failed —
    // the parent shouldn't miss a fee/attendance alert over an unrelated bug.
    console.error('notifyUser: failed to insert in-app notification', notifErr)
  }
  const notificationId = notifRow?.id ?? null

  // 2. Look up recipient's phone + channel preferences.
  const { data: recipient } = await supabase
    .from('profiles')
    .select('phone, notify_whatsapp, notify_sms')
    .eq('id', recipientId)
    .single()

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
    const enabled = channel === 'whatsapp' ? recipient.notify_whatsapp !== false : recipient.notify_sms !== false
    if (!enabled) {
      deliveries.push({ channel, status: 'skipped', error: `${channel} disabled for this recipient` })
      continue
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
