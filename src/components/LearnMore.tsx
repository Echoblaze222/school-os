// src/components/LearnMore.tsx
// A native <details>/<summary> disclosure for the "important but not
// essential to complete the task" text that used to sit as a permanent
// paragraph under a field/section - format specs, where something gets
// used, fallback behavior if skipped, etc. Collapsed by default so the
// screen reads clean; the information isn't lost, just not forced on
// everyone every time. No JS state needed - <details> handles open/closed
// itself, which also means it's keyboard/screen-reader accessible for
// free.
//
// Reserve this for content that's genuinely worth keeping (specs,
// consequences, fallback behavior). If it's just restating a visible
// label or field, it should be deleted outright instead of tucked in
// here - a Learn More link nobody needs to click is still clutter.

import styles from './LearnMore.module.css'

export default function LearnMore({
  children,
  label = 'Learn more',
}: {
  children: React.ReactNode
  label?: string
}) {
  return (
    <details className={styles.details}>
      <summary className={styles.summary}>{label}</summary>
      <div className={styles.content}>{children}</div>
    </details>
  )
}
