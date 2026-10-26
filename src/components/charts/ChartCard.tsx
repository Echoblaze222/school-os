'use client'

import type { ReactNode } from 'react'

interface ChartCardProps {
  title: string
  subtitle?: string
  empty?: boolean
  emptyText?: string
  children: ReactNode
}

export function ChartCard({
  title,
  subtitle,
  empty = false,
  emptyText = 'No data yet',
  children,
}: ChartCardProps) {
  return (
    <section
      style={{
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(128,128,128,0.2)',
        borderRadius: 16,
        padding: 16,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        minWidth: 0,
      }}
    >
      <header style={{ marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{title}</h3>
        {subtitle ? (
          <p style={{ margin: '2px 0 0', fontSize: 12, opacity: 0.65 }}>{subtitle}</p>
        ) : null}
      </header>
      {empty ? (
        <div
          style={{
            height: 160,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
            opacity: 0.6,
          }}
        >
          {emptyText}
        </div>
      ) : (
        children
      )}
    </section>
  )
}
