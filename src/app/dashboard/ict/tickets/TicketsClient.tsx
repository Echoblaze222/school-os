'use client'
// src/app/dashboard/ict/tickets/TicketsClient.tsx
//
// Deliberately follows the UX-prompt's "button state intelligence" and
// "no silent failures" principles even though the full motion-system
// pass (WORLD_CLASS_UX_MOTION_ANIMATION_PROMPT.pdf) is separate, larger
// scope not yet done: every status-changing action here shows
// Idle -> Saving... -> Saved/failed, never a click that goes nowhere.

import { useState } from 'react'
import Link from 'next/link'
import styles from './tickets.module.css'
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh'

const STATUS_LABEL: Record<string, string> = {
  new: 'New', assigned: 'Assigned', in_progress: 'In Progress',
  waiting: 'Waiting', resolved: 'Resolved', closed: 'Closed',
}
const PRIORITY_COLOR: Record<string, string> = {
  urgent: '#D64545', high: '#E4572E', normal: '#E0A94E', low: '#3FA66B',
}
const STATUS_FLOW = ['new', 'assigned', 'in_progress', 'waiting', 'resolved', 'closed']

interface Ticket {
  id: string; reporter_id: string; location: string | null; category: string
  description: string; priority: string; status: string; assigned_to: string | null
  created_at: string; profiles?: { full_name?: string }
}

function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function TicketsClient({
  initialTickets, ictStaff, schoolColor,
}: { initialTickets: Ticket[]; ictStaff: { id: string; name?: string }[]; schoolColor: string }) {
  const [tickets, setTickets] = useState(initialTickets)
  const [filter, setFilter] = useState<'open' | 'all' | string>('open')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [errorId, setErrorId] = useState<string | null>(null)

  async function load() {
    try {
      const res = await fetch('/api/ict/tickets')
      if (!res.ok) return
      const json = await res.json()
      setTickets(json.tickets ?? [])
    } catch {
      // Silent: this is a background live-sync refresh, not the initial
      // load - the visible list just stays as it was until the next
      // successful event, no need to surface a transient network blip.
    }
  }

  // ICT tickets are exactly the "two staff working the same queue"
  // case - one picks up a ticket while another is looking at the same
  // list, both should see the current state without a manual reload.
  useRealtimeRefresh({ tables: ['ict_tickets'], onChange: load })

  const filtered = filter === 'all' ? tickets
    : filter === 'open' ? tickets.filter(t => !['resolved', 'closed'].includes(t.status))
    : tickets.filter(t => t.status === filter)

  async function updateTicket(id: string, patch: Record<string, any>) {
    setSavingId(id)
    setErrorId(null)
    try {
      const res = await fetch(`/api/ict/tickets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Update failed')

      setTickets(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t))
    } catch (e) {
      setErrorId(id)
    } finally {
      setSavingId(null)
    }
  }

  function nextStatus(current: string) {
    const i = STATUS_FLOW.indexOf(current)
    return i >= 0 && i < STATUS_FLOW.length - 1 ? STATUS_FLOW[i + 1] : null
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg-base)' }}>
      <div className={styles.pageHeader}>
        <Link href="/dashboard/ict" className={styles.backBtn}>←</Link>
        <p className={styles.pageTitle}>Support Tickets</p>
      </div>

      <div className={styles.pageBody}>
        <div className={styles.tabs}>
          {['open', 'all', ...STATUS_FLOW].map(f => (
            <button
              key={f}
              className={`${styles.tab} ${filter === f ? styles.tabActive : ''}`}
              style={filter === f ? { background: schoolColor } : undefined}
              onClick={() => setFilter(f)}
            >
              {f === 'open' ? 'Open' : f === 'all' ? 'All' : STATUS_LABEL[f]}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className={styles.emptyState}>No tickets in this view.</div>
        ) : filtered.map(t => {
          const next = nextStatus(t.status)
          const saving = savingId === t.id
          return (
            <div key={t.id} className={styles.card}>
              <div className={styles.cardTop}>
                <div>
                  <p className={styles.cardTitle}>{t.category.replace('_', ' ')}</p>
                  <p className={styles.cardMeta}>
                    {t.profiles?.full_name ?? 'Unknown'}{t.location ? ` · ${t.location}` : ''} · {timeAgo(t.created_at)}
                  </p>
                </div>
                <span className={styles.badge} style={{ background: PRIORITY_COLOR[t.priority] ?? PRIORITY_COLOR.normal }}>
                  {t.priority}
                </span>
              </div>

              <p className={styles.cardDesc}>{t.description}</p>

              <div className={styles.actions}>
                <select
                  className={styles.select}
                  value={t.assigned_to ?? ''}
                  disabled={saving}
                  onChange={e => updateTicket(t.id, { assigned_to: e.target.value || null })}
                >
                  <option value="">Unassigned</option>
                  {ictStaff.map(s => (
                    <option key={s.id} value={s.id}>{s.name ?? 'ICT staff'}</option>
                  ))}
                </select>

                {next && (
                  <button
                    className={styles.btn}
                    style={{ background: schoolColor }}
                    disabled={saving}
                    onClick={() => updateTicket(t.id, { status: next })}
                  >
                    {saving ? 'Saving…' : `Mark ${STATUS_LABEL[next]}`}
                  </button>
                )}
              </div>

              {errorId === t.id && (
                <p className={styles.errorText}>Couldn&apos;t save that change, check your connection and try again.</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
