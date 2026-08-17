'use client'

// Reusable action button implementing the IDLE -> PROCESSING -> SUCCESS/
// FAILURE state machine the master UX spec calls for, so screens stop
// hand-rolling `disabled={loading} style={{opacity: loading?0.5:1}}` and a
// different loading-label string every time. Press feedback (scale) and
// disabled-during-processing (duplicate-submit protection) come for free.

import { CSSProperties, ReactNode } from 'react'

interface ActionButtonProps {
  onClick: () => void
  loading?: boolean
  loadingLabel?: string
  disabled?: boolean
  variant?: 'primary' | 'danger' | 'ghost'
  color?: string          // overrides variant's default color (school brand color etc.)
  icon?: ReactNode
  children: ReactNode
  style?: CSSProperties
  fullWidth?: boolean
}

const VARIANT_STYLES: Record<string, CSSProperties> = {
  primary: { background: '#10B981', color: '#fff', border: 'none' },
  danger:  { background: '#EF444415', color: '#EF4444', border: '1px solid #EF444430' },
  ghost:   { background: 'var(--input-bg)', color: 'var(--text-muted)', border: '1px solid var(--input-border)' },
}

export default function ActionButton({
  onClick, loading = false, loadingLabel, disabled = false,
  variant = 'primary', color, icon, children, style, fullWidth = false,
}: ActionButtonProps) {
  const base = VARIANT_STYLES[variant]
  const isDisabled = disabled || loading

  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      className="pressable"
      style={{
        height: 40, borderRadius: 9, fontWeight: 700, fontSize: '0.82rem',
        cursor: isDisabled ? 'default' : 'pointer', display: 'flex',
        alignItems: 'center', justifyContent: 'center', gap: 6,
        opacity: isDisabled ? 0.55 : 1, flex: fullWidth ? 1 : undefined,
        ...base,
        ...(color ? { background: variant === 'primary' ? color : base.background } : {}),
        ...style,
      }}
    >
      {icon}
      {loading ? (loadingLabel ?? 'Working…') : children}
    </button>
  )
}
