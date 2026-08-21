// src/components/VerificationBadge.tsx
// Phase 4. Reads schools.verified_status (Lane B, S45) - the canonical
// public-facing verification badge, protected at the database level by
// the prevent_school_protected_field_update trigger
// (sql/migrations/2026-08-18-public-platform-lane-a-b.sql). Lane G
// originally shipped a parallel 5-state verification_status column and
// component; retired in favor of this one during reconciliation - see
// the note in sql/lane-g-h-i-verification-content-security.sql.
//
// Copy is deliberately literal about what SchoolOS did and didn't check -
// section 51: "Do not imply government accreditation or official
// educational endorsement unless that has actually been established."
// None of these labels claim accreditation.
//
// Intentionally has no data-fetching of its own - pass the status string
// straight from wherever the school record was already loaded, so this
// stays a pure display component reusable on /find-schools cards, the
// school profile page, and the super-admin school detail page alike.

export type VerifiedStatus = 'unverified' | 'pending' | 'verified'

const CONFIG: Record<VerifiedStatus, { label: string; color: string; bg: string; border: string; title: string }> = {
  unverified: {
    label: 'Unverified',
    color: 'var(--text-muted)', bg: 'var(--glass-bg)', border: 'var(--glass-border)',
    title: 'This school has not yet gone through SchoolOS verification.',
  },
  pending: {
    label: 'Verification Pending',
    color: '#F59E0B', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.25)',
    title: 'SchoolOS is currently reviewing this school.',
  },
  verified: {
    label: 'Verified by SchoolOS',
    color: '#10B981', bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.25)',
    title: 'SchoolOS has completed its verification process for this school. This is not a government accreditation or official educational endorsement.',
  },
}

export default function VerificationBadge({
  status,
  size = 'md',
}: {
  status: string | null | undefined
  size?: 'sm' | 'md'
}) {
  const cfg = CONFIG[(status as VerifiedStatus) || 'unverified'] ?? CONFIG.unverified
  const isSm = size === 'sm'

  return (
    <span
      title={cfg.title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: isSm ? '2px 8px' : '4px 10px',
        borderRadius: 999,
        fontSize: isSm ? '0.68rem' : '0.75rem',
        fontWeight: 700,
        color: cfg.color,
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        aria-hidden="true"
        style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.color, flexShrink: 0 }}
      />
      {cfg.label}
    </span>
  )
}
