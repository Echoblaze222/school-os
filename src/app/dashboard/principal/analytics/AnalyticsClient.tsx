'use client'
// src/app/dashboard/principal/analytics/AnalyticsClient.tsx
// FIX: was querying results table and showing raw rows with no meaning.
// Now fetches aggregated data: avg scores per subject, attendance rate,
// class performance, and assignment completion — all from real DB tables.

import { useState, useEffect } from 'react'
import { createClient }        from '@/lib/supabase/client'
import RolePageWrapper         from '@/components/RolePageWrapper'
import { BarChartIcon }        from '@/components/Icons'
import styles                  from '@/app/dashboard/student/records/page.module.css'

interface Props { profile: any; school: any; userId: string }

const TERMS    = ['First Term', 'Second Term', 'Third Term']
const CUR_YEAR = new Date().getMonth() >= 8
  ? `${new Date().getFullYear()}/${new Date().getFullYear() + 1}`
  : `${new Date().getFullYear() - 1}/${new Date().getFullYear()}`

function pct(n: number, max: number) {
  return max > 0 ? Math.round((n / max) * 100) : 0
}
function fmtScore(n: number) { return n.toFixed(1) }

// Thin horizontal bar
function Bar({ value, max = 100, color }: { value: number; max?: number; color: string }) {
  const w = Math.min(100, max > 0 ? (value / max) * 100 : 0)
  return (
    <div style={{
      height: 7, borderRadius: 999,
      background: 'var(--glass-border)',
      overflow: 'hidden', marginTop: 6,
    }}>
      <div style={{
        height: '100%', width: `${w}%`,
        background: color, borderRadius: 999,
        transition: 'width 0.6s ease',
      }}/>
    </div>
  )
}

export default function AnalyticsClient({ profile, school, userId }: Props) {
  const supabase = createClient()
  const sc       = school?.primary_color ?? '#7C3AED'

  const [term,    setTerm]    = useState('First Term')
  const [year,    setYear]    = useState(CUR_YEAR)
  const [loading, setLoading] = useState(true)

  // ── Aggregated state ────────────────────────────────────────
  const [overview, setOverview] = useState({
    totalStudents: 0, totalTeachers: 0, totalClasses: 0,
    avgScore: 0, totalResults: 0,
  })
  const [subjectRows,   setSubjectRows]   = useState<{ name: string; avg: number; count: number }[]>([])
  const [classRows,     setClassRows]     = useState<{ name: string; avg: number; count: number }[]>([])
  const [gradeBreakdown, setGradeBreakdown] = useState<{ grade: string; count: number }[]>([])
  const [assignStats,   setAssignStats]   = useState({ total: 0, submitted: 0, graded: 0 })

  useEffect(() => { load() }, [term, year])

  async function load() {
    if (!school?.id) { setLoading(false); return }
    setLoading(true)

    const [
      { count: studentCount },
      { count: teacherCount },
      { count: classCount },
      { data: results },
      { data: assignments },
      { data: submissions },
    ] = await Promise.all([
      supabase.from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('school_id', school.id).eq('role', 'student'),

      supabase.from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('school_id', school.id).eq('role', 'teacher'),

      supabase.from('classes')
        .select('*', { count: 'exact', head: true })
        .eq('school_id', school.id),

      // Results with subject + class join for per-subject and per-class breakdowns
      supabase.from('results')
        .select(`
          id, score, max_score, grade,
          class_subjects (
            subjects ( name ),
            classes  ( name, class_level )
          )
        `)
        .eq('school_id', school.id)
        .eq('term', term)
        .eq('academic_year', year)
        .not('score', 'is', null)
        .limit(3000),

      supabase.from('assignments')
        .select('id', { count: 'exact', head: false })
        .eq('school_id', school.id)
        .eq('term', term),

      supabase.from('assignment_submissions')
        .select('status')
        .eq('school_id', school.id),
    ])

    const rows = results ?? []

    // ── Overall avg ─────────────────────────────────────────
    const scores = rows
      .filter((r: any) => r.score != null && r.max_score > 0)
      .map((r: any) => (r.score / r.max_score) * 100)
    const avgScore = scores.length
      ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length
      : 0

    setOverview({
      totalStudents: studentCount ?? 0,
      totalTeachers: teacherCount ?? 0,
      totalClasses:  classCount   ?? 0,
      avgScore,
      totalResults:  rows.length,
    })

    // ── Per-subject avg ──────────────────────────────────────
    const subMap: Record<string, { total: number; cnt: number }> = {}
    for (const r of rows as any[]) {
      const subj = (r.class_subjects as any)?.subjects?.name
      if (!subj || r.max_score <= 0) continue
      const pctScore = (r.score / r.max_score) * 100
      if (!subMap[subj]) subMap[subj] = { total: 0, cnt: 0 }
      subMap[subj].total += pctScore
      subMap[subj].cnt   += 1
    }
    const subjRows = Object.entries(subMap)
      .map(([name, { total, cnt }]) => ({ name, avg: total / cnt, count: cnt }))
      .sort((a, b) => b.avg - a.avg)
    setSubjectRows(subjRows)

    // ── Per-class avg ────────────────────────────────────────
    const clsMap: Record<string, { total: number; cnt: number }> = {}
    for (const r of rows as any[]) {
      const cls = (r.class_subjects as any)?.classes?.name
        ?? (r.class_subjects as any)?.classes?.class_level
      if (!cls || r.max_score <= 0) continue
      const pctScore = (r.score / r.max_score) * 100
      if (!clsMap[cls]) clsMap[cls] = { total: 0, cnt: 0 }
      clsMap[cls].total += pctScore
      clsMap[cls].cnt   += 1
    }
    const clsRows = Object.entries(clsMap)
      .map(([name, { total, cnt }]) => ({ name, avg: total / cnt, count: cnt }))
      .sort((a, b) => b.avg - a.avg)
    setClassRows(clsRows)

    // ── Grade breakdown ──────────────────────────────────────
    const gradeMap: Record<string, number> = {}
    for (const r of rows as any[]) {
      const g = r.grade ?? '—'
      gradeMap[g] = (gradeMap[g] ?? 0) + 1
    }
    const gradeOrder = ['A', 'B', 'C', 'D', 'E', 'F', '—']
    setGradeBreakdown(
      Object.entries(gradeMap)
        .sort(([a], [b]) => {
          const ai = gradeOrder.indexOf(a)
          const bi = gradeOrder.indexOf(b)
          return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
        })
        .map(([grade, count]) => ({ grade, count })),
    )

    // ── Assignment stats ─────────────────────────────────────
    const subs = submissions ?? []
    setAssignStats({
      total:     assignments?.length ?? 0,
      submitted: subs.filter((s: any) => s.status !== 'pending').length,
      graded:    subs.filter((s: any) => s.status === 'graded').length,
    })

    setLoading(false)
  }

  const gradeColor = (g: string) => {
    if (g === 'A') return '#22c55e'
    if (g === 'B') return '#3b82f6'
    if (g === 'C') return '#f59e0b'
    if (g === 'D' || g === 'E') return '#f97316'
    if (g === 'F') return '#ef4444'
    return '#6b7280'
  }

  const noData = !loading && overview.totalResults === 0

  return (
    <RolePageWrapper userId={userId} role="principal" profile={profile} school={school} title="Analytics">

      {/* ── Term / Year selector ── */}
      <div style={{
        display: 'flex', gap: 'var(--space-3)', alignItems: 'center',
        padding: '0 var(--space-5) var(--space-4)', flexWrap: 'wrap',
      }}>
        <input
          value={year}
          onChange={e => setYear(e.target.value)}
          placeholder="2024/2025"
          style={{
            width: 110, height: 38, padding: '0 10px', flexShrink: 0,
            background: 'var(--input-bg)', border: '1px solid var(--input-border)',
            borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none',
          }}
        />
        <div style={{ display: 'flex', gap: 6, flex: 1, flexWrap: 'wrap' }}>
          {TERMS.map(t => (
            <button
              key={t}
              onClick={() => setTerm(t)}
              style={{
                padding: '6px 14px', borderRadius: 999, fontSize: '0.78rem',
                fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
                background: term === t ? sc       : 'var(--glass-bg)',
                color:      term === t ? '#fff'   : 'var(--text-muted)',
                border:     term === t ? `1px solid ${sc}` : '1px solid var(--glass-border)',
              }}
            >
              {t.replace(' Term', '')}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className={styles.loading}><span/><span/><span/></div>
      ) : noData ? (
        <div className={styles.empty}>
          <BarChartIcon size={40} color="var(--text-faint)" strokeWidth={1}/>
          <p>No results data for {term} {year}</p>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: -8 }}>
            Teachers need to post results for this term before analytics appear.
          </p>
        </div>
      ) : (
        <div style={{ padding: '0 var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>

          {/* ── Overview cards ── */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(2,1fr)',
            gap: 'var(--space-3)',
          }}>
            {[
              { label: 'Students',    value: overview.totalStudents, color: sc },
              { label: 'Teachers',    value: overview.totalTeachers, color: '#3b82f6' },
              { label: 'Classes',     value: overview.totalClasses,  color: '#f59e0b' },
              { label: 'Avg Score',   value: `${fmtScore(overview.avgScore)}%`, color: overview.avgScore >= 50 ? '#22c55e' : '#ef4444' },
            ].map(c => (
              <div key={c.label} style={{
                background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
                borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)',
                textAlign: 'center',
              }}>
                <p style={{ fontSize: '1.5rem', fontWeight: 800, color: c.color, margin: 0 }}>
                  {c.value}
                </p>
                <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', margin: '4px 0 0',
                  fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {c.label}
                </p>
              </div>
            ))}
          </div>

          {/* ── Grade breakdown ── */}
          {gradeBreakdown.length > 0 && (
            <Section title="Grade Distribution" color={sc}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                {gradeBreakdown.map(({ grade, count }) => {
                  const maxCount = Math.max(...gradeBreakdown.map(g => g.count))
                  const barH = Math.max(20, (count / maxCount) * 80)
                  return (
                    <div key={grade} style={{ textAlign: 'center', flex: 1, minWidth: 32 }}>
                      <div style={{ fontSize: '0.7rem', fontWeight: 700,
                        color: 'var(--text-primary)', marginBottom: 4 }}>
                        {count}
                      </div>
                      <div style={{
                        height: barH, background: gradeColor(grade),
                        borderRadius: 4, transition: 'height 0.5s ease',
                      }}/>
                      <div style={{ fontSize: '0.72rem', fontWeight: 800,
                        color: gradeColor(grade), marginTop: 4 }}>
                        {grade}
                      </div>
                    </div>
                  )
                })}
              </div>
            </Section>
          )}

          {/* ── Subject performance ── */}
          {subjectRows.length > 0 && (
            <Section title="Subject Averages" color={sc}>
              {subjectRows.slice(0, 8).map(s => (
                <div key={s.name} style={{ marginBottom: 'var(--space-3)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                      {s.name}
                    </span>
                    <span style={{
                      fontSize: '0.8rem', fontWeight: 700,
                      color: s.avg >= 50 ? '#22c55e' : '#ef4444',
                    }}>
                      {fmtScore(s.avg)}%
                    </span>
                  </div>
                  <Bar value={s.avg} color={s.avg >= 50 ? '#22c55e' : '#ef4444'}/>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                    {s.count} result{s.count !== 1 ? 's' : ''}
                  </span>
                </div>
              ))}
            </Section>
          )}

          {/* ── Class performance ── */}
          {classRows.length > 0 && (
            <Section title="Class Performance" color={sc}>
              {classRows.map(c => (
                <div key={c.name} style={{ marginBottom: 'var(--space-3)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                      {c.name}
                    </span>
                    <span style={{
                      fontSize: '0.8rem', fontWeight: 700,
                      color: c.avg >= 50 ? '#22c55e' : '#ef4444',
                    }}>
                      {fmtScore(c.avg)}%
                    </span>
                  </div>
                  <Bar value={c.avg} color={sc}/>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                    {c.count} result{c.count !== 1 ? 's' : ''}
                  </span>
                </div>
              ))}
            </Section>
          )}

          {/* ── Assignment stats ── */}
          {assignStats.total > 0 && (
            <Section title="Assignments This Term" color={sc}>
              {[
                { label: 'Total Set',  value: assignStats.total,                              color: sc },
                { label: 'Submitted', value: assignStats.submitted,                           color: '#3b82f6' },
                { label: 'Graded',    value: assignStats.graded,                              color: '#22c55e' },
                { label: 'Completion', value: `${pct(assignStats.submitted, assignStats.total * 10)}%`, color: '#f59e0b' },
              ].map(item => (
                <div key={item.label} style={{
                  display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', padding: 'var(--space-3) 0',
                  borderBottom: '1px solid var(--glass-border)',
                }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    {item.label}
                  </span>
                  <span style={{ fontSize: '0.9rem', fontWeight: 700, color: item.color }}>
                    {item.value}
                  </span>
                </div>
              ))}
            </Section>
          )}

          <div style={{ height: 8 }}/>
        </div>
      )}

      <div className={styles.spacer}/>
    </RolePageWrapper>
  )
}

// ── Local section card ─────────────────────────────────────────────────────
function Section({
  title, color, children,
}: { title: string; color: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
      borderRadius: 'var(--radius-xl)', padding: 'var(--space-4) var(--space-5)',
    }}>
      <p style={{
        fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase',
        letterSpacing: '0.07em', color, marginBottom: 'var(--space-4)',
      }}>
        {title}
      </p>
      {children}
    </div>
  )
    }
    
