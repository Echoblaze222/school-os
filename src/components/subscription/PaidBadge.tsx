// src/components/subscription/PaidBadge.tsx
//
// Small paid/unpaid pill used wherever a student's term subscription status
// is shown. Status only: it never carries an amount.

interface Props {
  paid: boolean
  size?: 'sm' | 'md'
}

export default function PaidBadge({ paid, size = 'md' }: Props) {
  const color = paid ? 'var(--success, #10B981)' : 'var(--danger, #ef4444)'
  return (
    <span
      role="status"
      aria-label={paid ? 'Subscription paid' : 'Subscription unpaid'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: size === 'sm' ? '2px 8px' : '4px 10px',
        borderRadius: 999,
        fontSize: size === 'sm' ? '0.7rem' : '0.75rem',
        fontWeight: 700,
        letterSpacing: '0.02em',
        color,
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 999, background: color }} />
      {paid ? 'Paid' : 'Unpaid'}
    </span>
  )
}
