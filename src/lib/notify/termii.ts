// src/lib/notify/termii.ts
// Server-only adapter for Termii's Messaging API (https://developers.termii.com).
// NEVER import this from a client component - TERMII_API_KEY must stay server-side.
//
// Verified against Termii's current docs (Aug 2026):
//   POST https://api.ng.termii.com/api/sms/send
//   Body: { api_key, to, from, sms, type: "plain", channel }
//   channel:
//     "dnd" - transactional SMS route. USE THIS for attendance/results/fee
//                 alerts - bypasses Nigeria's Do-Not-Disturb registry, which
//                 the "generic" (promotional) route does not. Using "generic"
//                 for transactional messages risks delivery failure or the
//                 sender ID getting blocked.
//     "generic" - promotional/marketing SMS only. Not used by this app.
//     "whatsapp" - single-recipient WhatsApp message.
//
// ── WhatsApp caveat (read before relying on this in production) ───────────
// WhatsApp Business messaging that YOU initiate (not a reply to the parent)
// is restricted by Meta's policy to pre-approved message templates outside
// of a 24h customer-initiated session window. Termii's plain "whatsapp"
// channel below sends free-form text, which works for accounts within an
// open session, but for reliable first-touch delivery (e.g. the very first
// attendance alert to a parent who's never messaged the school's WhatsApp
// number) you'll likely need to register message templates with Termii and
// switch to their Template API (POST /api/send/template). That requires
// WhatsApp Business template approval, which happens in the Termii
// dashboard, not in this code. This file is built so swapping to templates
// later only means changing sendWhatsApp's internals - callers don't change.

const TERMII_BASE_URL = 'https://api.ng.termii.com/api'

export interface TermiiResult {
  ok: boolean
  messageId?: string
  raw?: unknown
  error?: string
}

function requireEnv(name: string): string {
  const val = process.env[name]
  if (!val) throw new Error(`Missing required env var: ${name}. Set it in your deployment environment before sending notifications.`)
  return val
}

/**
 * Normalizes a Nigerian phone number to Termii's expected format (234XXXXXXXXXX,
 * no leading +, no leading 0). Accepts 080..., +234..., 234..., or already-clean input.
 */
export function normalizeNigerianPhone(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, '')
  if (!digits) return null
  if (digits.startsWith('234') && digits.length === 13) return digits
  if (digits.startsWith('0') && digits.length === 11) return `234${digits.slice(1)}`
  if (digits.length === 10) return `234${digits}` // e.g. 8012345678 with no leading 0
  return null // unrecognized shape - caller should treat as invalid and skip/fallback
}

async function termiiSend(payload: Record<string, unknown>): Promise<TermiiResult> {
  try {
    const res = await fetch(`${TERMII_BASE_URL}/sms/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => null)

    // Termii returns { code: "ok", message_id, message, balance } on success.
    // Non-2xx or a missing/non-"ok" code is treated as failure.
    if (!res.ok || !data || data.code !== 'ok') {
      const errMsg = data?.message || `Termii request failed with status ${res.status}`
      return { ok: false, error: errMsg, raw: data }
    }

    return { ok: true, messageId: data.message_id, raw: data }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Network error calling Termii' }
  }
}

/** Sends a transactional SMS via Termii's DND route. */
export async function sendSms(toRaw: string, message: string): Promise<TermiiResult> {
  const to = normalizeNigerianPhone(toRaw)
  if (!to) return { ok: false, error: `Invalid phone number: ${toRaw}` }

  return termiiSend({
    api_key: requireEnv('TERMII_API_KEY'),
    to,
    from: requireEnv('TERMII_SENDER_ID'),
    sms: message,
    type: 'plain',
    channel: 'dnd',
  })
}

/**
 * Sends a WhatsApp message via Termii's WhatsApp channel.
 * See the file-level caveat above re: template approval for first-touch messages.
 */
export async function sendWhatsApp(toRaw: string, message: string): Promise<TermiiResult> {
  const to = normalizeNigerianPhone(toRaw)
  if (!to) return { ok: false, error: `Invalid phone number: ${toRaw}` }

  return termiiSend({
    api_key: requireEnv('TERMII_API_KEY'),
    to,
    from: requireEnv('TERMII_SENDER_ID'),
    sms: message,
    type: 'plain',
    channel: 'whatsapp',
  })
}
