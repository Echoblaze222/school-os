// src/components/public/landing/PromotionsSection.tsx
//
// Surfaces live school_promotions (currently only ever seen on /discover)
// on the actual marketing homepage. Queries the same table with the same
// filters as /api/public/promotions directly (server component, admin
// client), rather than round-tripping through that route via fetch.
// Renders nothing if there's nothing live to show - a landing page has
// no good "empty state" for a section that simply has no content yet.

import { createAdminClient } from '@/lib/supabase/admin'
import PromotionCard from '@/app/discover/PromotionCard'
import motion from '@/components/dashboard-motion.module.css'
import styles from './PromotionsSection.module.css'

export default async function PromotionsSection() {
  const supabase = createAdminClient()
  const today = new Date().toISOString().slice(0, 10)

  const { data } = await supabase
    .from('school_promotions')
    .select(`
      id, school_id, promotion_type, title, summary, image_url,
      external_link, placement, is_sponsored, start_date, end_date,
      schools ( name, city, state, primary_color, logo_url )
    `)
    .eq('status', 'live')
    .lte('start_date', today)
    .gte('end_date', today)
    .order('is_sponsored', { ascending: false })
    .order('start_date', { ascending: false })
    .limit(6)

  const promotions = data ?? []
  if (promotions.length === 0) return null

  return (
    <section className="page-content">
      <div className={styles.headingRow}>
        <span className="overline">On SchoolOS right now</span>
        <h2 className="h2">What schools are announcing this term</h2>
      </div>

      <div className={styles.grid}>
        {promotions.map((p, i) => (
          <div key={p.id} className={`${styles.cardSlot} ${motion.staggerItem}`} style={{ animationDelay: `${i * 70}ms` }}>
            <PromotionCard promotion={p} />
          </div>
        ))}
      </div>
    </section>
  )
}
