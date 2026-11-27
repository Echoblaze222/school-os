'use client'
// Panel on the bursar invoices page: emails parents about unpaid invoices
// via POST /api/bursar/send-fee-reminders. Scoped to whatever invoices the
// bursar currently has filtered on screen.

import { useState } from 'react'
import { BellIcon, CheckIcon, AlertIcon } from '@/components/Icons'

const MAX_PER_SEND = 500

export default function SendRemindersPanel({ invoiceIds }: { invoiceIds: string[] }) {
  const [sending, setSending] = useState(false)
  const [result, setResult]   = useState<{ ok: boolean; msg: string } | null>(null)
  const count = invoiceIds.length

  async function send() {
    if (count === 0) return
    setSending(true)
    setResult(null)
    try {
      const res = await fetch('/api/bursar/send-fee-reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_ids: invoiceIds.slice(0, MAX_PER_SEND) }),
      })
      const data = await res.json()

      if (!res.ok) {
        setResult({ ok: false, msg: data.error || 'Failed to send reminders.' })
      } else if (data.message && !data.parents) {
        setResult({ ok: true, msg: data.message })
      } else {
        const parts = [`${data.emailed ?? 0} sent`]
        if (data.queued)          parts.push(`${data.queued} will retry automatically`)
        if (data.deduped)         parts.push(`${data.deduped} already reminded today`)
        if (data.noEmail)         parts.push(`${data.noEmail} parent(s) have no email`)
        if (data.skippedNoParent) parts.push(`${data.skippedNoParent} invoice(s) have no linked parent`)
        if (data.failed)          parts.push(`${data.failed} failed`)
        setResult({ ok: !data.failed, msg: parts.join(', ') + '.' })
      }
    } catch {
      setResult({ ok: false, msg: 'Network error. Please try again.' })
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{
      background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
      borderRadius: 12, padding: '16px', marginBottom: 16,
    }}>
      <p style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
        <BellIcon size={14} color="var(--brand)" /> Send Fee Reminders
      </p>
      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0 0 12px', lineHeight: 1.5 }}>
        Emails each parent once per child with every unpaid fee, and adds an in-app notification.
        Only the unpaid invoices in your current filter are included. A parent is never
        reminded twice for the same child on the same day.
      </p>

      {result && (
        <div style={{
          padding: '10px 14px', marginBottom: 12,
          background: result.ok ? 'var(--success-subtle)' : 'var(--danger-subtle)',
          border: `1px solid ${result.ok ? 'var(--success)' : 'var(--danger)'}`,
          borderRadius: 8, fontSize: '0.8rem', fontWeight: 600,
          color: result.ok ? 'var(--success)' : 'var(--danger)',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          {result.ok
            ? <CheckIcon size={14} color="var(--success)" />
            : <AlertIcon size={14} color="var(--danger)" />}
          {result.msg}
        </div>
      )}

      <button
        onClick={send}
        disabled={sending || count === 0}
        style={{
          width: '100%', height: 40, background: 'var(--brand)',
          color: '#fff', border: 'none', borderRadius: 8,
          fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
          opacity: sending || count === 0 ? 0.6 : 1,
        }}>
        {sending
          ? 'Sending…'
          : count === 0
            ? 'No unpaid invoices in this view'
            : `Send reminders for ${Math.min(count, MAX_PER_SEND)} unpaid invoice${count !== 1 ? 's' : ''}`}
      </button>
      {count > MAX_PER_SEND && (
        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '8px 0 0' }}>
          Only the first {MAX_PER_SEND} are sent at a time. Narrow the filter or send again.
        </p>
      )}
    </div>
  )
}
