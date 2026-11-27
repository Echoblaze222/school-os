// src/lib/email/queueEmail.ts
// Server-only. The single entry point for sending any email in this app -
// every caller (school activation, fee receipts, future access-code
// sends) should go through this instead of calling an email provider
// directly, the same way notifyUser.ts is the one entry point for
// WhatsApp/SMS.
//
// WHY THIS EXISTS: before this file, the only email code in the entire
// codebase (activateSchool.ts) called Resend directly, inline, with no
// logging and no retry. If RESEND_FROM_EMAIL was ever unset (defaulting
// to Resend's sandbox address, which throws a 403 for any recipient
// other than the account owner - confirmed against Resend's own docs),
// the send would throw, get caught by the Paystack webhook's outer
// try/catch, get logged as a generic webhook error, and the email would
// be gone forever with no record of what was supposed to be sent to
// whom. This file fixes that class of problem generally, not just for
// that one call site.
//
// PROVIDERS: Brevo or Resend, chosen by environment variables, no code
// change needed to switch.
//   - EMAIL_PROVIDER=brevo | resend  (explicit choice), otherwise
//   - Brevo is used when BREVO_API_KEY is set, otherwise Resend.
// Brevo works with a single verified sender address (no domain needed),
// which is why it is the default when configured. See
// docs/email/BREVO_SETUP.md.
//
// Mirrors notifyUser.ts's shape deliberately (dedupeKey, admin client,
// per-delivery logging table) so anyone already familiar with that file
// already knows how this one works.

import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'

type EmailProvider = 'brevo' | 'resend'

export function getEmailProvider(): EmailProvider {
  const explicit = (process.env.EMAIL_PROVIDER ?? '').trim().toLowerCase()
  if (explicit === 'brevo' || explicit === 'resend') return explicit
  return process.env.BREVO_API_KEY ? 'brevo' : 'resend'
}

// ── Resend ───────────────────────────────────────────────────
let _resend: Resend | null = null

export function getResend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY
    if (!key) throw new Error('RESEND_API_KEY is not set')
    _resend = new Resend(key)
  }
  return _resend
}

/**
 * Falls back to Resend's shared sandbox address, which Resend's own API
 * rejects with a 403 for any recipient other than the account owner's
 * own verified email - never a real end user like a principal or
 * parent. Once a domain is verified in the Resend dashboard (Settings ->
 * Domains), set RESEND_FROM_EMAIL to an address on that domain (e.g.
 * "SchoolOS <noreply@yourdomain.com>"). Only used when the provider is
 * Resend.
 */
export function getEmailFrom(): string {
  return process.env.RESEND_FROM_EMAIL || 'SchoolOS <onboarding@resend.dev>'
}

// ── Brevo ────────────────────────────────────────────────────
const BREVO_ENDPOINT   = 'https://api.brevo.com/v3/smtp/email'
const BREVO_TIMEOUT_MS = 10_000

class EmailSendError extends Error {
  statusCode?: number
  permanent: boolean
  constructor(message: string, opts: { statusCode?: number; permanent?: boolean } = {}) {
    super(message)
    this.name = 'EmailSendError'
    this.statusCode = opts.statusCode
    this.permanent = opts.permanent ?? false
  }
}

/**
 * Sends one email through Brevo's transactional API and returns Brevo's
 * message id. The sender must be a verified sender in the Brevo account
 * (Senders, Domains and Dedicated IPs -> Senders); BREVO_SENDER_EMAIL
 * has to match it exactly. Brevo has no idempotency key, so a retry after
 * a network timeout where Brevo had already accepted the message could in
 * rare cases deliver twice. That is the accepted trade-off for a
 * provider that needs no domain.
 */
async function sendViaBrevo(to: string, subject: string, html: string): Promise<string | null> {
  const apiKey      = process.env.BREVO_API_KEY
  const senderEmail = process.env.BREVO_SENDER_EMAIL
  const senderName  = process.env.BREVO_SENDER_NAME || 'SchoolOS'

  // Missing configuration can never fix itself by retrying.
  if (!apiKey)      throw new EmailSendError('BREVO_API_KEY is not set', { permanent: true })
  if (!senderEmail) throw new EmailSendError('BREVO_SENDER_EMAIL is not set', { permanent: true })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), BREVO_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(BREVO_ENDPOINT, {
      method: 'POST',
      headers: {
        'accept':       'application/json',
        'content-type': 'application/json',
        'api-key':      apiKey,
      },
      body: JSON.stringify({
        sender:      { name: senderName, email: senderEmail },
        to:          [{ email: to }],
        subject,
        htmlContent: html,
      }),
      signal: controller.signal,
    })
  } catch (err: any) {
    // Network failure or timeout: transient, worth retrying.
    throw new EmailSendError(
      err?.name === 'AbortError' ? 'Brevo request timed out' : `Brevo request failed: ${err?.message ?? err}`,
    )
  } finally {
    clearTimeout(timer)
  }

  let payload: any = null
  try { payload = await res.json() } catch { /* empty or non-JSON body */ }

  if (!res.ok) {
    const detail = payload?.message ?? payload?.code ?? res.statusText
    // 400 (bad request, including an unverified sender or invalid address),
    // 401 (bad key or blocked IP) and 403/404 are configuration or data
    // problems. 429 and 5xx are transient.
    const permanent = [400, 401, 402, 403, 404, 422].includes(res.status)
    throw new EmailSendError(`Brevo ${res.status}: ${detail}`, { statusCode: res.status, permanent })
  }

  return payload?.messageId ?? null
}

export interface QueueEmailInput {
  schoolId?: string | null
  recipientId?: string | null
  to: string
  subject: string
  html: string
  referenceTable?: string
  referenceId?: string
  /** Stable key for retry-safe callers (webhooks, cron) - see notifyUser.ts's own dedupeKey doc for the same reasoning. Requires recipientId to take effect (the unique index is scoped to recipient_id + dedupe_key). */
  dedupeKey?: string
}

export type QueueEmailStatus = 'sent' | 'queued' | 'failed' | 'deduped'

export interface QueueEmailResult {
  id: string | null
  status: QueueEmailStatus
}

// 1, 2, 4, 8, 16, 32 minutes - capped, not indefinite. A cron running
// every 5 minutes (see the pg_cron job) means the real-world gap between
// attempts is max(backoffMinutes, 5), so early retries are still fast.
function backoffMinutes(attempts: number): number {
  return Math.min(32, Math.pow(2, attempts))
}

/**
 * Classifies a send error as permanent (a config/auth problem that
 * retrying can't fix - e.g. Resend's sandbox-domain 403, a bad API key,
 * an unverified Brevo sender, or the provider rejecting the request
 * shape) vs. transient (a network blip, provider outage, or rate limit -
 * worth retrying). Retrying a permanent error forever just burns through
 * max_attempts without ever self-healing; it needs a human to fix the
 * configuration, and email_deliveries.error is where that human should be
 * able to see exactly why.
 */
function isPermanentFailure(err: any): boolean {
  if (err?.permanent === true) return true
  const status = err?.statusCode ?? err?.status
  return status === 401 || status === 403 || status === 422
}

async function attemptSend(
  admin: ReturnType<typeof createAdminClient>,
  deliveryId: string,
  to: string,
  subject: string,
  html: string,
): Promise<'sent' | 'queued' | 'failed'> {
  try {
    let providerMessageId: string | null = null

    if (getEmailProvider() === 'brevo') {
      providerMessageId = await sendViaBrevo(to, subject, html)
    } else {
      const { data, error } = await getResend().emails.send(
        { from: getEmailFrom(), to, subject, html },
        {
          // Stable per-row key so a retry of this exact call (ours, or a
          // network-level retry upstream) can't create a second real send -
          // Resend dedupes server-side on this key for 24h. Safe to reuse
          // across our own retry attempts for the same row since the
          // payload never changes between attempts.
          idempotencyKey: `email-delivery-${deliveryId}`,
        },
      )
      if (error) throw error
      providerMessageId = (data as { id?: string } | null)?.id ?? null
    }

    await admin.from('email_deliveries').update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      provider_message_id: providerMessageId,
    }).eq('id', deliveryId)

    return 'sent'
  } catch (err: any) {
    const message = err?.message ?? String(err)
    const permanent = isPermanentFailure(err)

    const { data: current } = await admin
      .from('email_deliveries')
      .select('attempts, max_attempts')
      .eq('id', deliveryId)
      .single()

    const attempts = (current?.attempts ?? 0) + 1
    const maxAttempts = current?.max_attempts ?? 6
    const exhausted = attempts >= maxAttempts
    const giveUp = permanent || exhausted

    const update: Record<string, unknown> = {
      attempts,
      error: message,
      permanent_failure: permanent,
      status: giveUp ? 'failed' : 'queued',
    }
    // Only touch next_attempt_at when still retrying - once status is
    // 'failed' the retry query (WHERE status='queued') never looks at
    // this row again regardless of what the column holds, and the
    // column is NOT NULL so there's nothing sensible to set it to here.
    if (!giveUp) {
      update.next_attempt_at = new Date(Date.now() + backoffMinutes(attempts) * 60_000).toISOString()
    }

    await admin.from('email_deliveries').update(update).eq('id', deliveryId)

    console.error(
      `queueEmail: send failed for ${deliveryId} (attempt ${attempts}/${maxAttempts}${permanent ? ', permanent - not retrying' : ''})`,
      message,
    )

    return giveUp ? 'failed' : 'queued'
  }
}

/**
 * Queues an email and makes one immediate send attempt inline, so the
 * common case (provider healthy, sender verified) has zero added latency
 * and never needs the cron at all. On a transient failure, the row is
 * left 'queued' for api/internal/email-retry (run on a schedule via
 * pg_cron - see docs/lane3-notifications/03-email-retry-cron.sql) to
 * pick up with exponential backoff. On a permanent failure
 * (misconfiguration), it's marked 'failed' immediately instead of
 * retried forever.
 */
export async function queueEmail(input: QueueEmailInput): Promise<QueueEmailResult> {
  const admin = createAdminClient()

  if (input.dedupeKey && input.recipientId) {
    const { data: existing } = await admin
      .from('email_deliveries')
      .select('id')
      .eq('recipient_id', input.recipientId)
      .eq('dedupe_key', input.dedupeKey)
      .maybeSingle()
    if (existing) {
      return { id: existing.id, status: 'deduped' }
    }
  }

  const { data: row, error: insertErr } = await admin
    .from('email_deliveries')
    .insert({
      school_id: input.schoolId ?? null,
      recipient_id: input.recipientId ?? null,
      to_email: input.to,
      subject: input.subject,
      html_body: input.html,
      reference_table: input.referenceTable ?? null,
      reference_id: input.referenceId ?? null,
      dedupe_key: input.dedupeKey ?? null,
    })
    .select('id')
    .single()

  if (insertErr || !row) {
    // Couldn't even log the attempt - nothing left to retry against.
    // Callers should treat this the same as any other unrecoverable
    // failure in their own flow (log and move on, don't block on it).
    console.error('queueEmail: failed to insert email_deliveries row', insertErr)
    return { id: null, status: 'failed' }
  }

  const status = await attemptSend(admin, row.id, input.to, input.subject, input.html)
  return { id: row.id, status }
}

/**
 * Re-attempts a single already-queued row. Used by
 * api/internal/email-retry/route.ts - exported separately from
 * queueEmail so the retry route doesn't need to duplicate attemptSend's
 * logic.
 */
export async function retryQueuedEmail(deliveryId: string): Promise<'sent' | 'queued' | 'failed'> {
  const admin = createAdminClient()
  const { data: row } = await admin
    .from('email_deliveries')
    .select('to_email, subject, html_body')
    .eq('id', deliveryId)
    .single()

  if (!row) return 'failed'

  return attemptSend(admin, deliveryId, row.to_email, row.subject, row.html_body)
}
