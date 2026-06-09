'use client'
// src/app/dashboard/student/results/ResultsClient.tsx
// FIXED: uses RolePageWrapper (not manual StudentNav + DashboardHeader)
// FIXED: subject name from class_subjects → subjects join (not results.subject column which doesn't exist)
// FIXED: term filter against actual DB values ('First Term' etc.)
// FIXED: result_type grouping per term

import { useState, useMemo } from 'react'
import RolePageWrapper from '@/components/RolePageWrapper'
import { BarChartIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'

interface Props {
  profile: any
  school:  any
  userId:  string
  results: any[]  // pre-fetched server-side
}

const TERMS       = ['All Terms', 'First Term', 'Second Term', 'Third Term']
const TYPE_LABELS: Record<string, string> = {
  day_test:  'Day Test',
  mid_term:  'Mid-Term',
  exam:      'Exam',
}

function gradeColor(g: string) {
  if (!g) return 'var(--text-muted)'
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

export default function ResultsClient({ profile, school, userId, results }: Props) {
  const [termFilter, setTermFilter] = useState('All Terms')
  const sc = school?.primary_color ?? '#7C3AED'

  // Enrich results with resolved subject name
  const enriched = useMemo(() => results.map((r: any) => ({
    ...r,
    subject_name: r.class_subjects?.subjects?.name ?? '—',
    class_name:   r.class_subjects?.classes?.name ?? r.class_subjects?.classes?.class_level ?? '—',
  })), [results])

  const filtered = useMemo(() =>
    termFilter === 'All Terms'
      ? enriched
      : enriched.filter((r: any) => r.term === termFilter),
  [enriched, termFilter])

  // Stats
  const avg = filtered.length
    ? Math.round(filtered.reduce((s: number, r: any) => s + (r.score / (r.max_score || 100)) * 100, 0) / filtered.length)
    : 0
  const passCount = filtered.filter((r: any) => r.grade !== 'F').length

  // Group by year + term for a cleaner visual layout
  const grouped = useMemo(() => {
    const map: Record<string, any[]> = {}
    filtered.forEach((r: any) => {
      const key = `${r.academic_year} · ${r.term}`
      if (!map[key]) map[key] = []
      map[key].push(r)
    })
    return map
  }, [filtered])

  return (
    <RolePageWrapper userId={userId} role="student" profile={profile} school={school} title="My Results">

      {/* Summary stats */}
      {filtered.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 'var(--space-5)' }}>
          {[
            { label: 'Subjects',  value: filtered.length, color: sc          },
            { label: 'Avg Score', value: `${avg}%`,        color: avg >= 60 ? '#10B981' : '#EF4444' },
            { label: 'Passes',    value: passCount,         color: '#10B981' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center', padding: '12px 8px', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 12 }}>
              <p style={{ margin: '0 0 2px', fontSize: '1.4rem', fontWeight: 800, color: s.color }}>{s.value}</p>
              <p style={{ margin: 0, fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Term filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 'var(--space-5)', flexWrap: 'wrap', overflowX: 'auto' }}>
        {TERMS.map(t => (
          <button key={t} onClick={() => setTermFilter(t)} style={{
            padding: '6px 14px', borderRadius: 999, cursor: 'pointer', flexShrink: 0,
            border:     `1px solid ${termFilter === t ? sc : 'var(--glass-border)'}`,
            background: termFilter === t ? sc : 'transparent',
            color:      termFilter === t ? '#fff' : 'var(--text-muted)',
            fontSize: '0.75rem', fontWeight: 700,
          }}>
            {t}
          </button>
        ))}
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className={styles.empty}>
          <BarChartIcon size={40} color="var(--text-faint)" strokeWidth={1} />
          <p>No results found{termFilter !== 'All Terms' ? ` for ${termFilter}` : ''} yet.</p>
        </div>
      ) : (
        Object.entries(grouped).map(([groupKey, rows]) => (
          <div key={groupKey} style={{ marginBottom: 'var(--space-5)' }}>
            {/* Group header */}
            <p style={{ margin: '0 0 var(--space-2)', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)' }}>
              {groupKey}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {rows.map((r: any) => {
                const pct = r.max_score > 0 ? Math.round((r.score / r.max_score) * 100) : 0
                return (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 12 }}>
                    {/* Subject info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: '0 0 2px', fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.subject_name}
                      </p>
                      <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        {TYPE_LABELS[r.result_type] ?? r.result_type}
                        {r.remarks && <span style={{ marginLeft: 6, fontStyle: 'italic' }}>{r.remarks}</span>}
                      </p>
                    </div>

                    {/* Score + progress */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                        <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{r.score}</span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>/{r.max_score ?? 100}</span>
                      </div>
                      {/* Progress bar */}
                      <div style={{ width: 72, height: 4, background: 'var(--glass-border)', borderRadius: 999, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: sc, borderRadius: 999, transition: 'width 0.4s ease' }} />
                      </div>
                    </div>

                    {/* Grade badge */}
                    <div style={{ width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: gradeBg(r.grade), flexShrink: 0 }}>
                      <span style={{ fontWeight: 800, fontSize: '0.9rem', color: gradeColor(r.grade) }}>{r.grade ?? '—'}</span>
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
