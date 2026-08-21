// src/app/rankings/page.tsx
// Lane F - public rankings. Every category shows its methodology summary
// and data freshness inline (§50) rather than a single unexplained score.
import { createAdminClient } from '@/lib/supabase/admin'
import PublicHeader from '../discover/PublicHeader'
import styles from '../discover/public.module.css'

export const revalidate = 300

export default async function RankingsPage() {
  const supabase = createAdminClient()

  const { data: categories, error } = await supabase
    .from('ranking_categories')
    .select('id, key, label, description, methodology_summary, min_sample_size')
    .eq('is_active', true)
    .order('label')

  const categoryResults = await Promise.all((categories ?? []).map(async (category) => {
    const { data: scores } = await supabase
      .from('school_ranking_scores')
      .select(`
        school_id, score, sample_size, insufficient_data, period_end,
        schools ( name, city, state )
      `)
      .eq('category_id', category.id)
      .order('period_end', { ascending: false })
      .order('score', { ascending: false, nullsFirst: false })

    const seen = new Set<string>()
    const latest = (scores ?? []).filter((s: any) => {
      if (seen.has(s.school_id)) return false
      seen.add(s.school_id)
      return true
    }).slice(0, 20)

    return { category, scores: latest }
  }))

  return (
    <>
      <PublicHeader active="rankings" />
      <main className={styles.page}>
        <h1 className={styles.pageTitle}>School Rankings</h1>
        <p className={styles.pageSubtitle}>
          Organic, data-based categories only. Sponsored placement on SchoolOS never changes a
          school&apos;s ranking here, and a category is marked as having insufficient data rather
          than showing a manufactured score.
        </p>

        {error && <p className={styles.emptyState}>Couldn&apos;t load rankings right now.</p>}

        {!error && categoryResults.length === 0 && (
          <p className={styles.emptyState}>No ranking categories are active yet.</p>
        )}

        {categoryResults.map(({ category, scores }) => (
          <section key={category.id} className={styles.categoryBlock}>
            <h2 className={styles.categoryLabel}>{category.label}</h2>
            <p className={styles.categoryMethodology}>{category.methodology_summary}</p>

            {scores.length === 0 ? (
              <p className={styles.emptyState}>No schools have data for this category yet.</p>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr><th>School</th><th>Score</th><th>As of</th></tr>
                </thead>
                <tbody>
                  {scores.map((s: any) => (
                    <tr key={s.school_id}>
                      <td>{s.schools?.name ?? 'Unknown school'}{s.schools?.city ? ` · ${s.schools.city}` : ''}</td>
                      <td>
                        {s.insufficient_data
                          ? <span className={styles.insufficientTag}>Insufficient data</span>
                          : s.score}
                      </td>
                      <td>{s.period_end}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        ))}
      </main>
    </>
  )
}
