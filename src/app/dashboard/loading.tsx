// src/app/dashboard/loading.tsx
//
// Next.js shows this INSTANTLY on navigation (it is prefetched with the link)
// while the destination page.tsx - a server component - finishes fetching
// its data. One file covers every page under /dashboard/*.
//
// It used to be a full-screen opaque spinner that blanked the whole screen on
// every tap. Now it is a skeleton of the real page frame (header band,
// content cards, dock pill) so the screen reacts immediately and the real
// content fills in where the skeleton already is. See loading.module.css.
import styles from './loading.module.css'

export default function DashboardLoading() {
  return (
    <div className={styles.page} role="status" aria-busy="true">
      <span className={styles.srOnly}>Loading</span>

      <div className={styles.hero}>
        <div className={styles.frame}>
          <div className={styles.left}>
            <div className={`${styles.circle38} ${styles.pulse}`} />
            <div className={`${styles.circle36} ${styles.pulse}`} />
            <div className={`${styles.titleBar} ${styles.pulse}`} />
          </div>
          <div className={styles.right}>
            <div className={`${styles.circle38} ${styles.pulse}`} />
            <div className={`${styles.circle38} ${styles.pulse}`} />
          </div>
        </div>
      </div>

      <div className={styles.main} aria-hidden="true">
        <div className={styles.statRow}>
          <div className={`${styles.card} ${styles.stat} ${styles.pulse}`} />
          <div className={`${styles.card} ${styles.stat} ${styles.pulse}`} />
          <div className={`${styles.card} ${styles.stat} ${styles.pulse}`} />
          <div className={`${styles.card} ${styles.stat} ${styles.pulse}`} />
        </div>
        <div className={`${styles.card} ${styles.blockTall} ${styles.pulse}`} />
        <div className={`${styles.card} ${styles.block} ${styles.pulse}`} />
        <div className={`${styles.card} ${styles.block} ${styles.pulse}`} />
      </div>

      <div className={styles.dock} aria-hidden="true" />
    </div>
  )
}
