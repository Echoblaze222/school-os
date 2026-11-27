'use client'

// src/components/subscription/StaffSubscriptionStatus.tsx
//
// Paid/unpaid list for class teachers and the bursar. Names + a status badge
// only; the RPC behind it never returns amounts.

import { useMemo, useState } from 'react'
import PaidBadge from './PaidBadge'

export interface StaffStatusStudent {
  student_id: string
  name: string
  class_id: string | null
  class: string | null
  paid: boolean
}

interface Props {
  termName: string | null
  graceEndsOn: string | null
  students: StaffStatusStudent[]
}

type Filter = 'all' | 'unpaid' | 'paid'

export default function StaffSubscriptionStatus({ termName, graceEndsOn, students }: Props) {
  const [filter, setFilter] = useState<Filter>('all')

  const paidCount = students.filter(s => s.paid).length
  const unpaidCount = students.length - paidCount

  const grouped = useMemo(() => {
    const visible = students.filter(s => filter === 'all' || (filter === 'paid' ? s.paid : !s.paid))
    const map = new Map<string, StaffStatusStudent[]>()
    for (const s of visible) {
      const key = s.class ?? 'No class'
      map.set(key, [...(map.get(key) ?? []), s])
    }
    return Array.from(map.entries())
  }, [students, filter])

  if (!termName) {
    return <p style={{ opacity: 0.7 }}>No term running right now.</p>
  }

  const chip = (f: Filter, label: string) => (
    <button
      key={f}
      onClick={() => setFilter(f)}
      aria-pressed={filter === f}
      className="pressable"
      style={{
        padding: '6px 12px',
        borderRadius: 999,
        fontSize: '0.8rem',
        fontWeight: 600,
        cursor: 'pointer',
        border: filter === f ? '1px solid var(--brand-border)' : '1px solid var(--glass-border)',
        background: filter === f ? 'var(--brand-subtle)' : 'var(--glass-bg)',
        color: filter === f ? 'var(--brand-light)' : 'var(--text-secondary)',
      }}
    >
      {label}
    </button>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p style={{ margin: 0, fontSize: '0.85rem', opacity: 0.8 }}>
        {termName} · {paidCount} paid · {unpaidCount} unpaid
        {graceEndsOn && ` · unpaid students lock after ${new Date(graceEndsOn).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })}`}
      </p>

      <div style={{ display: 'flex', gap: 8 }}>
        {chip('all', `All (${students.length})`)}
        {chip('unpaid', `Unpaid (${unpaidCount})`)}
        {chip('paid', `Paid (${paidCount})`)}
      </div>

      {grouped.length === 0 && <p style={{ opacity: 0.7 }}>No students match this filter.</p>}

      {grouped.map(([cls, list]) => (
        <section key={cls}>
          <h2 style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.6, margin: '8px 0' }}>{cls}</h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {list.map(s => (
              <li
                key={s.student_id}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 12px', borderRadius: 10, border: '1px solid var(--glass-border)', background: 'var(--glass-bg)',
                }}
              >
                <span style={{ fontWeight: 600 }}>{s.name}</span>
                <PaidBadge paid={s.paid} size="sm" />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
