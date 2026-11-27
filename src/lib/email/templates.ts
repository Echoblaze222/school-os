// src/lib/email/templates.ts
// Reusable, emoji-free HTML templates for school emails. Each function
// returns { subject, html } ready to pass straight into queueEmail():
//
//   const { subject, html } = feeReminderEmail({ ... })
//   await queueEmail({ schoolId, recipientId, to, subject, html, dedupeKey })
//
// Table-based layout with inline styles only (email clients strip <style>
// and block inline SVG, so no icon graphics here). brandColor should be
// the school's primary_color; it falls back to the SchoolOS burgundy
// (the --brand token in globals.css).

const DEFAULT_BRAND = '#800020'

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

export const naira = (n: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(n)

interface LayoutOpts {
  schoolName: string
  title: string
  intro?: string
  bodyHtml?: string
  code?: string
  button?: { label: string; url: string }
  footer?: string
  brandColor?: string
}

function layout(o: LayoutOpts): string {
  const brand = /^#[0-9a-fA-F]{3,8}$/.test(o.brandColor ?? '') ? (o.brandColor as string) : DEFAULT_BRAND

  const code = o.code
    ? `<div style="margin:20px 0;padding:16px;background:#f6f6f8;border:1px dashed ${brand};border-radius:8px;text-align:center;font-size:28px;letter-spacing:6px;font-weight:700;color:${brand};font-family:Consolas,monospace;">${esc(o.code)}</div>`
    : ''

  const button = o.button
    ? `<p style="margin:24px 0;"><a href="${esc(o.button.url)}" style="background:${brand};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;display:inline-block;">${esc(o.button.label)}</a></p>`
    : ''

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f3f3f5;font-family:Arial,Helvetica,sans-serif;color:#222;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f3f5;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;">
<tr><td style="background:${brand};padding:18px 24px;color:#ffffff;font-size:18px;font-weight:700;">${esc(o.schoolName)}</td></tr>
<tr><td style="padding:28px 24px;">
<h1 style="margin:0 0 12px;font-size:20px;color:#111;">${esc(o.title)}</h1>
${o.intro ? `<p style="margin:0 0 12px;line-height:1.55;font-size:15px;">${esc(o.intro)}</p>` : ''}
${o.bodyHtml ?? ''}
${code}
${button}
</td></tr>
<tr><td style="padding:16px 24px;background:#fafafa;color:#888;font-size:12px;line-height:1.5;">${esc(o.footer ?? 'This is an automated message from SchoolOS. Please do not reply.')}</td></tr>
</table>
</td></tr></table>
</body></html>`
}

const row = (label: string, value: string) =>
  `<tr><td style="padding:8px 0;color:#666;font-size:14px;width:40%;">${esc(label)}</td><td style="padding:8px 0;font-size:14px;font-weight:600;">${esc(value)}</td></tr>`

const table = (rows: string[]) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #eee;margin:12px 0;">${rows.join('')}</table>`

export interface EmailContent {
  subject: string
  html: string
}

// ---------- Templates ----------

export function accessCodeEmail(p: {
  schoolName: string
  recipientName: string
  role: string
  code: string
  signupUrl: string
  brandColor?: string
}): EmailContent {
  return {
    subject: `Your ${p.schoolName} access code`,
    html: layout({
      schoolName: p.schoolName,
      brandColor: p.brandColor,
      title: 'Your access code',
      intro: `Hello ${p.recipientName}, your ${p.role} account has been created. Use this code to sign up:`,
      code: p.code,
      button: { label: 'Create your account', url: p.signupUrl },
      footer: 'Do not share this code with anyone.',
    }),
  }
}

export function resultsEmail(p: {
  schoolName: string
  parentName: string
  studentName: string
  term: string
  session: string
  resultsUrl: string
  brandColor?: string
}): EmailContent {
  return {
    subject: `${p.studentName}'s ${p.term} results are ready`,
    html: layout({
      schoolName: p.schoolName,
      brandColor: p.brandColor,
      title: 'Results published',
      intro: `Hello ${p.parentName}, the ${p.term} (${p.session}) results for ${p.studentName} have been published.`,
      button: { label: 'View results', url: p.resultsUrl },
    }),
  }
}

export function feeReminderEmail(p: {
  schoolName: string
  parentName: string
  studentName: string
  feeName: string
  amountDue: number
  dueDate?: string
  payUrl: string
  overdue?: boolean
  brandColor?: string
}): EmailContent {
  return {
    subject: p.overdue ? `Overdue fee: ${p.feeName}` : `Fee reminder: ${p.feeName}`,
    html: layout({
      schoolName: p.schoolName,
      brandColor: p.brandColor,
      title: p.overdue ? 'Overdue fee notice' : 'Fee reminder',
      intro: `Hello ${p.parentName}, this is a reminder about an outstanding fee for ${p.studentName}.`,
      bodyHtml: table([
        row('Fee', p.feeName),
        row('Amount due', naira(p.amountDue)),
        ...(p.dueDate ? [row('Due date', p.dueDate)] : []),
      ]),
      button: { label: 'Pay now', url: p.payUrl },
    }),
  }
}

export function meetingNoticeEmail(p: {
  schoolName: string
  recipientName: string
  meetingTitle: string
  date: string
  time: string
  venue: string
  note?: string
  brandColor?: string
}): EmailContent {
  return {
    subject: `Meeting notice: ${p.meetingTitle}`,
    html: layout({
      schoolName: p.schoolName,
      brandColor: p.brandColor,
      title: p.meetingTitle,
      intro: `Hello ${p.recipientName}, you are invited to the following meeting.`,
      bodyHtml:
        table([row('Date', p.date), row('Time', p.time), row('Venue', p.venue)]) +
        (p.note ? `<p style="font-size:14px;line-height:1.55;">${esc(p.note)}</p>` : ''),
    }),
  }
}
