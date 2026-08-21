'use client'

// Reusable empty state - enforces the WHAT/WHY/NEXT pattern from the UX
// spec (what's empty, why it may be empty, what to do next) instead of a
// bare "No data" line.

import { ReactNode } from 'react'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  subtitle?: string
  action?: { label: string; onClick: () => void }
}

export default function EmptyState({ icon, title, subtitle, action }: EmptyStateProps) {
  return (
    <div className="animate-fade-up" style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 10, padding: 'var(--space-6) var(--space-4)',
      textAlign: 'center',
    }}>
      {icon}
      <p style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)', margin: 0 }}>{title}</p>
      {subtitle && (
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0, maxWidth: 280 }}>{subtitle}</p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="pressable"
          style={{
            marginTop: 6, height: 36, padding: '0 16px', background: 'var(--brand)',
            color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700,
            fontSize: '0.78rem', cursor: 'pointer',
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
