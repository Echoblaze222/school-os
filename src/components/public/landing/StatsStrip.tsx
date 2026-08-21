// src/components/public/landing/StatsStrip.tsx
// Real counts only. If the platform doesn't have meaningful numbers yet,
// this renders nothing rather than a stat strip full of zeros or invented
// figures, per the "no decorative statistics" rule.

import { createAdminClient } from '@/lib/supabase/admin'
import { getPublicPlatformStats } from '@/lib/publicSchools'
import styles from './StatsStrip.module.css'

export default async function StatsStrip() {
  let stats = { schoolsOnPlatform: 0, schoolsPubliclyListed: 0 }
  try {
    stats = await getPublicPlatformStats(createAdminClient())
  } catch (err) {
    console.error('[StatsStrip] failed to load:', err)
    return null
  }

  if (stats.schoolsOnPlatform < 1) return null

  return (
    <section className={styles.strip}>
      <div className={`${styles.inner} page-content`}>
        <div className={styles.stat}>
          <span className={styles.value}>{stats.schoolsOnPlatform}</span>
          <span className={styles.label}>{stats.schoolsOnPlatform === 1 ? 'School' : 'Schools'} on SchoolOS</span>
        </div>
      </div>
    </section>
  )
}
