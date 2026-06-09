'use client'
// src/app/dashboard/parent/results/ResultsClient.tsx
// FIXED: subject name from class_subjects → subjects join (not results.subject which doesn't exist)
// FIXED: data fetched server-side with correct joins; client is display-only
// FIXED: child resolved via profiles.parent_id = userId (not a separate table)
// FIXED: term filter against real DB term values

import { useState, useMemo } from 'react'
import RolePageWrapper from '@/components/RolePageWrapper'
import { BarChartIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'

interface Props {
  profile: any
  school:  any
  userId:  string
  child:   any | null
  results: any[]
}

const TERMS       = ['All Terms', 'First Term', 'Second Term', 'Third Term']
const TYPE_LABELS: Record<string, string> = {
  day_test: 'Day Test',
  mid_term: 'Mid-Term',
  exam:     'Exam',
}

function gradeColor(g: string) {
  if (g === 'A') return '#10B981'
  if (g === 'B') return '#3B82F6'
  if (g === 'C') return '#F59E0B'
  if (g === 'D') return '#F97316'
  return '#EF4444'
}

export default function ResultsClient({ profile, school, userId, child, results }: Props) {
  const [termFilter, setTermFilter] = useState('All Terms')
  const sc = school?.primary_color ?? '#7C3AED'

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

  const avg = filtered.length
    ? Math.round(filtered.reduce((s: number, r: any) => s + (r.score / (r.max_score || 100)) * 100, 0) / filtered.length)
    : 0

  if (!child) return (
    <RolePageWrapper userId={userId} role="parent" profile={profile} school={school} title="Child's Results">
      <div className={styles.empty}>
        <BarChartIcon size={40} color="var(--text-faint)" strokeWidth={1} />
        <p>No child linked to your account yet. Contact the school secretary.</p>
      </div>
    </RolePageWrapper>
  )

  return (
    <RolePageWrapper userId={userId} role="parent" profile={profile} school={school} title="Child's Results">

      {/* Child info banner */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: sc + '15', border: `1px solid ${sc}30`, borderRadius: 12, marginBottom: 'var(--space-5)' }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: sc + '30', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: sc, fontSize: '1rem', flexShrink: 0 }}>
          {child.full_name.slice(0, 2).toUpperCase()}
        </div>
        <div>
          <p style={{ margin: 0, fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9rem' }}>{child.full_name}</p>
          <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            {child.class_level ?? 'Unknown Class'}{child.admission_number ? ` · ${child.admission_number}` : ''}
          </p>
        </div>
        {filtered.length > 0 && (
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <p style={{ margin: 0, fontWeight: 800, fontSize: '1.1rem', color: avg >= 60 ? '#10B981' : '#EF4444' }}>{avg}%</p>
            <p style={{ margin: 0, fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 600 }}>AVG</p>
          </div>
        )}
      </div>

      {/* Term filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
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

      {/* Results table */}
      {filtered.length === 0 ? (
        <div className={styles.empty}>
          <BarChartIcon size={40} color="var(--text-faint)" strokeWidth={1} />
          <p>No results found{termFilter !== 'All Terms' ? ` for ${termFilter}` : ''} yet.</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                {['Subject', 'Type', 'Term', 'Score', 'Grade'].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r: any, i: number) => (
                <tr key={r.id ?? i} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <td style={{ padding: '10px', fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                    {r.subject_name}
                  </td>
                  <td style={{ padding: '10px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    {TYPE_LABELS[r.result_type] ?? r.result_type}
                  </td>
                  <td style={{ padding: '10px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    {r.term}
                  </td>
                  <td style={{ padding: '10px', fontSize: '0.88rem', color: 'var(--text-primary)', fontWeight: 700 }}>
                    {r.score}<span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400 }}>/{r.max_score ?? 100}</span>
                  </td>
                  <td style={{ padding: '10px' }}>
                    <span style={{ fontWeight: 800, color: gradeColor(r.grade), fontSize: '0.9rem' }}>{r.grade ?? '—'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={styles.spacer} />
    </RolePageWrapper>
  )
}
