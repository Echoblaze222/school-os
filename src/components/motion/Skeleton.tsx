'use client'

// Reusable skeleton loading primitives - replaces the generic dot-spinner
// or blank-screen loading states scattered across screens with a shimmer
// that resembles the shape of the real content, per the app's existing
// `.skeleton` shimmer keyframe in globals.css.

export function SkeletonBlock({
  width = '100%', height = 14, radius = 6, style,
}: { width?: number | string; height?: number | string; radius?: number; style?: React.CSSProperties }) {
  return <div className="skeleton" style={{ width, height, borderRadius: radius, ...style }} />
}

/** A generic card skeleton - header line + subtitle line + one content block.
 *  Good default for list-of-cards screens (claims, invoices, payments, etc). */
export function SkeletonCard() {
  return (
    <div style={{
      background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
      borderRadius: 14, padding: 'var(--space-4)', display: 'grid', gap: 10,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ display: 'grid', gap: 6 }}>
          <SkeletonBlock width={120} height={14} />
          <SkeletonBlock width={160} height={11} />
        </div>
        <SkeletonBlock width={70} height={18} />
      </div>
      <SkeletonBlock width="100%" height={40} radius={9} />
    </div>
  )
}

/** Row-style skeleton - avatar/name/subtitle, for list rows (students,
 *  staff, notifications). */
export function SkeletonRow() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 'var(--space-3) 0' }}>
      <SkeletonBlock width={40} height={40} radius={999} />
      <div style={{ display: 'grid', gap: 6, flex: 1 }}>
        <SkeletonBlock width="60%" height={13} />
        <SkeletonBlock width="40%" height={10} />
      </div>
    </div>
  )
}

/** Renders `count` of whichever skeleton shape fits the screen, spaced like
 *  a real list, so the loading state and loaded state don't visually jump. */
export function SkeletonList({ count = 3, variant = 'card' }: { count?: number; variant?: 'card' | 'row' }) {
  return (
    <div style={{ display: 'grid', gap: variant === 'card' ? 'var(--space-3)' : 0 }}>
      {Array.from({ length: count }).map((_, i) => variant === 'card' ? <SkeletonCard key={i} /> : <SkeletonRow key={i} />)}
    </div>
  )
}
