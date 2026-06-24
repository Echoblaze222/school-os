'use client'
// src/app/dashboard/student/results/ResultsClient.tsx
// FIXED: subject name resolved from class_subjects → subjects join (results has no subject column)
// FIXED: result_type label lookup uses TYPE_LABELS map
// FIXED: term filter compares against exact DB values ('First Term', 'Second Term', 'Third Term')
// FIXED: grouped display handles missing academic_year gracefully
// FIXED: avg/pass stats are computed on filtered set only
// ADDED: per-type breakdown within each term group (Day Test / Mid-Term / Exam rows)
// ADDED: percentage label on progress bar
// ADDED: graceful fallback when class_subjects join is null (data posted without class link)

import { useState, useMemo } from 'react'
import RolePageWrapper from '@/components/RolePageWrapper'
import { BarChartIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'

interface ResultRow {
  id:            string
  term:          string
  academic_year: string | null
  result_type:   string
  score:         number
  max_score:     number
  grade:         string
  remarks:       string | null
  posted_at:     string | null
  class_subjects: {
    id:       string
    subjects: { id: string; name: string; code: string } | null
    classes:  { id: string; name: string; class_level: string } | null
  } | null
}

interface Props {
  profile: any
  school:  any
  userId:  string
  results: ResultRow[]
}

const TERMS = ['All Terms', 'First Term', 'Second Term', 'Third Term'] as const

const TYPE_LABELS: Record<string, string> = {
  day_test: 'Day Test',
  mid_term: 'Mid-Term',
  exam:     'Exam',
}

const TYPE_ORDER: Record<string, number> = {
  day_test: 0,
  mid_term: 1,
  exam:     2,
}

function gradeColor(g: string) {
  if (!g || g === '—') return 'var(--text-muted)'
  if (g === 'A') return '#10B981'
  if (g === 'B') return '#3B82F6'
  if (g === 'C') return '#F59E0B'
  if (g === 'D') return '#F97316'
  return '#EF4444'
}

function gradeBg(g: string) {
  if (g === 'A') return '#10B98118'
  if (g === 'B') return '#3B82F618'
  if (g === 'C') return '#F59E0B18'
  if (g === 'D') return '#F9731618'
  return '#EF444418'
}

// Resolve the display name of a result row
function resolveSubjectName(r: ResultRow): string {
  return r.class_subjects?.subjects?.name ?? '—'
}

function resolveClassName(r: ResultRow): string {
  const cls = r.class_subjects?.classes
  return cls?.name ?? cls?.class_level ?? '—'
}

export default function ResultsClient({ profile, school, userId, results }: Props) {
  const [termFilter, setTermFilter] = useState<string>('All Terms')
  const sc = school?.primary_color ?? '#7C3AED'

  // Enrich with resolved names
  const enriched = useMemo(() =>
    results.map(r => ({
      ...r,
      subject_name: resolveSubjectName(r),
      class_name:   resolveClassName(r),
    })),
  [results])

  // Apply term filter
  const filtered = useMemo(() =>
    termFilter === 'All Terms'
      ? enriched
      : enriched.filter(r => r.term === termFilter),
  [enriched, termFilter])

  // Summary stats (only over filtered set)
  const avg = filtered.length
    ? Math.round(
        filtered.reduce((sum, r) => sum + (r.score / (r.max_score || 100)) * 100, 0)
        / filtered.length
      )
    : 0
  const passCount = filtered.filter(r => r.grade !== 'F' && r.grade !== '—').length

  // Group by "year · term", sorted newest first
  const grouped = useMemo(() => {
    const map: Record<string, typeof enriched> = {}
    filtered.forEach(r => {
      const year = r.academic_year ?? 'Unknown Year'
      const key  = `${year} · ${r.term}`
      if (!map[key]) map[key] = []
      map[key].push(r)
    })
    // Sort each group by result_type order (day_test → mid_term → exam)
    Object.values(map).forEach(rows =>
      rows.sort((a, b) => (TYPE_ORDER[a.result_type] ?? 99) - (TYPE_ORDER[b.result_type] ?? 99))
    )
    return map
  }, [filtered])

  return (
    <RolePageWrapper
      userId={userId}
      role="student"
      profile={profile}
      school={school}
      title="My Results"
    >

      {/* ── Summary stats ── */}
      {filtered.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 8,
          marginBottom: 'var(--space-5)',
        }}>
          {[
            { label: 'Results',   value: filtered.length, color: sc },
            { label: 'Avg Score', value: `${avg}%`,        color: avg >= 50 ? '#10B981' : '#EF4444' },
            { label: 'Passes',    value: passCount,         color: '#10B981' },
          ].map(s => (
            <div key={s.label} style={{
              textAlign: 'center',
              padding: '12px 8px',
              background: 'var(--glass-bg)',
              border: '1px solid var(--glass-border)',
              borderRadius: 12,
            }}>
              <p style={{ margin: '0 0 2px', fontSize: '1.4rem', fontWeight: 800, color: s.color }}>
                {s.value}
              </p>
              <p style={{
                margin: 0,
                fontSize: '0.6rem',
                fontWeight: 700,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}>
                {s.label}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* ── Term filter tabs ── */}
      <div style={{
        display: 'flex',
        gap: 8,
        marginBottom: 'var(--space-5)',
        overflowX: 'auto',
        paddingBottom: 2,
        WebkitOverflowScrolling: 'touch' as any,
      }}>
        {TERMS.map(t => (
          <button
            key={t}
            onClick={() => setTermFilter(t)}
            style={{
              padding:    '6px 14px',
              borderRadius: 999,
              cursor:     'pointer',
              flexShrink: 0,
              border:     `1px solid ${termFilter === t ? sc : 'var(--glass-border)'}`,
              background: termFilter === t ? sc : 'transparent',
              color:      termFilter === t ? '#fff' : 'var(--text-muted)',
              fontSize:   '0.75rem',
              fontWeight: 700,
              transition: 'all 0.15s ease',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ── Results list ── */}
      {filtered.length === 0 ? (
        <div className={styles.empty}>
          <BarChartIcon size={40} color="var(--text-faint)" strokeWidth={1} />
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: '0.85rem' }}>
            {termFilter !== 'All Terms'
              ? `No results found for ${termFilter} yet.`
              : 'No results posted yet. Check back after assessments.'}
          </p>
        </div>
      ) : (
        Object.entries(grouped).map(([groupKey, rows]) => (
          <div key={groupKey} style={{ marginBottom: 'var(--space-5)' }}>

            {/* Group header */}
            <p style={{
              margin: '0 0 var(--space-2)',
              fontSize: '0.65rem',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: 'var(--text-muted)',
            }}>
              {groupKey}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {rows.map(r => {
                const pct = r.max_score > 0
                  ? Math.round((r.score / r.max_score) * 100)
                  : 0

                return (
                  <div
                    key={r.id}
                    style={{
                      display:    'flex',
                      alignItems: 'center',
                      gap:        14,
                      padding:    '12px 16px',
                      background: 'var(--glass-bg)',
                      border:     '1px solid var(--glass-border)',
                      borderRadius: 12,
                    }}
                  >
                    {/* Subject + type */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{
                        margin: '0 0 2px',
                        fontWeight: 700,
                        color: 'var(--text-primary)',
                        fontSize: '0.9rem',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {r.subject_name}
                      </p>
                      <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        {TYPE_LABELS[r.result_type] ?? r.result_type}
                        {r.remarks && (
                          <span style={{ marginLeft: 6, fontStyle: 'italic' }}>
                            · {r.remarks}
                          </span>
                        )}
                      </p>
                    </div>

                    {/* Score + progress bar */}
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-end',
                      gap: 4,
                      flexShrink: 0,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                        <span style={{
                          fontSize: '1.25rem',
                          fontWeight: 800,
                          color: 'var(--text-primary)',
                          lineHeight: 1,
                        }}>
                          {r.score}
                        </span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          /{r.max_score ?? 100}
                        </span>
                      </div>
                      {/* Bar + percentage */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{
                          width: 64,
                          height: 4,
                          background: 'var(--glass-border)',
                          borderRadius: 999,
                          overflow: 'hidden',
                        }}>
                          <div style={{
                            height: '100%',
                            width: `${pct}%`,
                            background: gradeColor(r.grade),
                            borderRadius: 999,
                            transition: 'width 0.4s ease',
                          }} />
                        </div>
                        <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                          {pct}%
                        </span>
                      </div>
                    </div>

                    {/* Grade badge */}
                    <div style={{
                      width: 34,
                      height: 34,
                      borderRadius: 8,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: gradeBg(r.grade),
                      flexShrink: 0,
                    }}>
                      <span style={{
                        fontWeight: 800,
                        fontSize: '0.9rem',
                        color: gradeColor(r.grade),
                      }}>
                        {r.grade ?? '—'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}

      <div className={styles.spacer} />
    </RolePageWrapper>
  )
}
