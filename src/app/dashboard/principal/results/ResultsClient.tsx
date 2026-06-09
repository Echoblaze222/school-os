'use client'
// src/app/dashboard/principal/results/ResultsClient.tsx
// FIXED: groups results by class_subjects.classes.id + subjects.name + posted_by
//        (replaces broken grouping on nonexistent results.class_id / results.teacher_id / results.subject)
// ADDED: approve individual or all results (updates results.approved if column exists, else no-op)
// FIXED: expandable per-student detail without a second query (data is pre-loaded server-side)

import { useState, useMemo } from 'react'
import RolePageWrapper from '@/components/RolePageWrapper'
import { BarChartIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'
import { createClient } from '@/lib/supabase/client'

interface Props {
  profile: any
  school:  any
  userId:  string
  classes: any[]
  results: any[]
}

const TERMS       = ['First Term', 'Second Term', 'Third Term']
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

interface ResultGroup {
  key:          string
  class_id:     string
  class_name:   string
  subject_name: string
  teacher_name: string
  posted_by:    string
  term:         string
  result_type:  string
  count:        number
  avg_pct:      number
  pass_count:   number
  rows:         any[]  // individual result rows for expand
}

export default function ResultsClient({ profile, school, userId, classes, results }: Props) {
  const [termFilter,    setTermFilter]    = useState('First Term')
  const [classFilter,   setClassFilter]   = useState('')
  const [typeFilter,    setTypeFilter]    = useState('')
  const [expandedKey,   setExpandedKey]   = useState<string | null>(null)
  const [approvedIds,   setApprovedIds]   = useState<Set<string>>(new Set())
  const [toast,         setToast]         = useState<string | null>(null)
  const supabase = createClient()
  const sc       = school?.primary_color ?? '#7C3AED'

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  // Enrich + group results client-side (all data pre-loaded)
  const enriched = useMemo(() => results.map((r: any) => ({
    ...r,
    class_id:     r.class_subjects?.classes?.id ?? '',
    class_name:   r.class_subjects?.classes?.name ?? r.class_subjects?.classes?.class_level ?? '—',
    subject_name: r.class_subjects?.subjects?.name ?? '—',
    teacher_name: r.poster?.full_name ?? 'Unknown',
  })), [results])

  // Apply filters
  const filtered = useMemo(() => enriched.filter((r: any) => {
    if (r.term !== termFilter)                  return false
    if (typeFilter  && r.result_type !== typeFilter)  return false
    if (classFilter && r.class_id    !== classFilter) return false
    return true
  }), [enriched, termFilter, typeFilter, classFilter])

  // Group into summary rows: one per [class, subject, teacher, term, result_type]
  const groups: ResultGroup[] = useMemo(() => {
    const map: Record<string, ResultGroup> = {}
    filtered.forEach((r: any) => {
      const key = `${r.class_id}__${r.subject_name}__${r.posted_by}__${r.result_type}`
      if (!map[key]) {
        map[key] = {
          key,
          class_id:     r.class_id,
          class_name:   r.class_name,
          subject_name: r.subject_name,
          teacher_name: r.teacher_name,
          posted_by:    r.posted_by,
          term:         r.term,
          result_type:  r.result_type,
          count:        0,
          avg_pct:      0,
          pass_count:   0,
          rows:         [],
        }
      }
      map[key].rows.push(r)
      map[key].count++
      if (r.grade !== 'F') map[key].pass_count++
    })

    // Compute averages
    return Object.values(map).map(g => {
      const total    = g.rows.reduce((s: number, r: any) => s + (r.score ?? 0), 0)
      const maxTotal = g.rows.reduce((s: number, r: any) => s + (r.max_score ?? 100), 0)
      return { ...g, avg_pct: maxTotal > 0 ? Math.round((total / maxTotal) * 100) : 0 }
    }).sort((a, b) => a.class_name.localeCompare(b.class_name) || a.subject_name.localeCompare(b.subject_name))
  }, [filtered])

  // Group groups by class for nested display
  const byClass = useMemo(() => {
    const map: Record<string, ResultGroup[]> = {}
    groups.forEach(g => {
      if (!map[g.class_id]) map[g.class_id] = []
      map[g.class_id].push(g)
    })
    return map
  }, [groups])

  const totalStudents = groups.reduce((s, g) => s + g.count, 0)
  const overallAvg    = groups.length
    ? Math.round(groups.reduce((s, g) => s + g.avg_pct, 0) / groups.length)
    : 0

  async function approveResult(id: string) {
    const { error } = await supabase.from('results').update({ approved: true }).eq('id', id)
    if (!error) { setApprovedIds(prev => new Set(prev).add(id)); showToast('Approved') }
  }

  async function approveGroup(group: ResultGroup) {
    const ids = group.rows.map((r: any) => r.id).filter((id: string) => !approvedIds.has(id))
    if (!ids.length) return
    await supabase.from('results').update({ approved: true }).in('id', ids)
    setApprovedIds(prev => new Set([...prev, ...ids]))
    showToast(`${ids.length} results approved`)
  }

  // CSV export
  function exportCSV() {
    const headers = ['Student', 'Adm No.', 'Subject', 'Class', 'Term', 'Type', 'Score', 'Max', 'Grade', 'Teacher']
    const rows = filtered.map((r: any) => [
      r.student?.full_name ?? '—',
      r.student?.admission_number ?? r.student?.default_code ?? '—',
      r.subject_name,
      r.class_name,
      r.term,
      TYPE_LABELS[r.result_type] ?? r.result_type,
      r.score,
      r.max_score ?? 100,
      r.grade,
      r.teacher_name,
    ])
    const csv  = [headers, ...rows].map(row => row.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href     = URL.createObjectURL(blob)
    a.download = `results-${termFilter.replace(' ', '-').toLowerCase()}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
    showToast('Exported as CSV')
  }

  return (
    <RolePageWrapper userId={userId} role="principal" profile={profile} school={school} title="Results">

      {/* Filters row */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 'var(--space-4)', flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Term pills */}
        {TERMS.map(t => (
          <button key={t} onClick={() => setTermFilter(t)} style={{
            padding: '6px 14px', borderRadius: 999, cursor: 'pointer', flexShrink: 0,
            border:     `1px solid ${termFilter === t ? sc : 'var(--glass-border)'}`,
            background: termFilter === t ? sc : 'transparent',
            color:      termFilter === t ? '#fff' : 'var(--text-muted)',
            fontSize: '0.75rem', fontWeight: 700,
          }}>{t}</button>
        ))}

        <span style={{ color: 'var(--glass-border)', fontSize: '1.1rem' }}>|</span>

        {/* Type filter */}
        <button onClick={() => setTypeFilter('')} style={{
          padding: '5px 11px', borderRadius: 999, cursor: 'pointer',
          border:     `1px solid ${!typeFilter ? sc + '60' : 'var(--glass-border)'}`,
          background: !typeFilter ? sc + '18' : 'transparent',
          color:      !typeFilter ? sc : 'var(--text-muted)',
          fontSize: '0.72rem', fontWeight: 700,
        }}>All Types</button>
        {Object.entries(TYPE_LABELS).map(([val, label]) => (
          <button key={val} onClick={() => setTypeFilter(typeFilter === val ? '' : val)} style={{
            padding: '5px 11px', borderRadius: 999, cursor: 'pointer',
            border:     `1px solid ${typeFilter === val ? sc + '60' : 'var(--glass-border)'}`,
            background: typeFilter === val ? sc + '18' : 'transparent',
            color:      typeFilter === val ? sc : 'var(--text-muted)',
            fontSize: '0.72rem', fontWeight: 700,
          }}>{label}</button>
        ))}

        {/* Class select */}
        <select
          value={classFilter}
          onChange={e => setClassFilter(e.target.value)}
          style={{ height: 34, padding: '0 10px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.78rem', outline: 'none', cursor: 'pointer' }}>
          <option value="">All Classes</option>
          {classes.map((c: any) => (
            <option key={c.id} value={c.id}>{c.name ?? c.class_level}</option>
          ))}
        </select>

        {/* Export */}
        <button onClick={exportCSV} style={{ marginLeft: 'auto', padding: '6px 12px', borderRadius: 8, border: '1px solid var(--glass-border)', background: 'transparent', color: 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}>
          ↓ Export CSV
        </button>
      </div>

      {/* Summary stats */}
      {groups.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 'var(--space-5)' }}>
          {[
            { label: 'Groups',     value: groups.length,  color: sc          },
            { label: 'Students',   value: totalStudents,  color: '#3B82F6'   },
            { label: 'Avg Score',  value: `${overallAvg}%`, color: overallAvg >= 60 ? '#10B981' : '#EF4444' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center', padding: '10px 8px', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 8 }}>
              <p style={{ margin: '0 0 2px', fontSize: '1.2rem', fontWeight: 800, color: s.color }}>{s.value}</p>
              <p style={{ margin: 0, fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* No results */}
      {groups.length === 0 && (
        <div className={styles.empty}>
          <BarChartIcon size={40} color="var(--text-faint)" strokeWidth={1} />
          <p>No results posted for {termFilter}{typeFilter ? ` · ${TYPE_LABELS[typeFilter]}` : ''}{classFilter ? ' in this class' : ''}.</p>
        </div>
      )}

      {/* Grouped results */}
      {Object.entries(byClass).map(([cid, cGroups]) => (
        <div key={cid} style={{ marginBottom: 'var(--space-5)' }}>
          {/* Class header */}
          <div style={{ padding: '8px 14px', background: sc + '18', border: `1px solid ${sc}30`, borderRadius: '10px 10px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p style={{ margin: 0, fontWeight: 800, color: sc, fontSize: '0.88rem' }}>{cGroups[0].class_name}</p>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              {cGroups.length} subject{cGroups.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Subject rows */}
          <div style={{ border: `1px solid ${sc}20`, borderTop: 'none', borderRadius: '0 0 10px 10px', overflow: 'hidden' }}>
            {cGroups.map((g, i) => {
              const isExp     = expandedKey === g.key
              const passRate  = g.count > 0 ? Math.round((g.pass_count / g.count) * 100) : 0
              const pendingN  = g.rows.filter((r: any) => !approvedIds.has(r.id)).length

              return (
                <div key={g.key}>
                  {/* Summary row */}
                  <div style={{ borderTop: i > 0 ? '1px solid var(--glass-border)' : 'none', display: 'flex', alignItems: 'center' }}>
                    <button
                      onClick={() => setExpandedKey(isExp ? null : g.key)}
                      style={{ flex: 1, textAlign: 'left', padding: '10px 14px', background: isExp ? 'var(--glass-bg)' : 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'inherit' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: '0 0 2px', fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                          {g.subject_name}
                          <span style={{ marginLeft: 6, fontSize: '0.68rem', fontWeight: 500, color: 'var(--text-muted)' }}>{TYPE_LABELS[g.result_type] ?? g.result_type}</span>
                        </p>
                        <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          {g.teacher_name} · {g.count} students
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
                        <div style={{ textAlign: 'center' }}>
                          <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: g.avg_pct >= 60 ? '#10B981' : '#EF4444' }}>{g.avg_pct}%</p>
                          <p style={{ margin: 0, fontSize: '0.55rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>avg</p>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: passRate >= 70 ? '#10B981' : '#F59E0B' }}>{passRate}%</p>
                          <p style={{ margin: 0, fontSize: '0.55rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>pass</p>
                        </div>
                      </div>
                      <span style={{ color: 'var(--text-muted)', fontSize: 12, transform: isExp ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>▾</span>
                    </button>

                    {/* Approve group button */}
                    {pendingN > 0 && (
                      <button
                        onClick={() => approveGroup(g)}
                        style={{ padding: '5px 10px', marginRight: 8, borderRadius: 6, border: `1px solid ${sc}40`, background: 'transparent', color: sc, fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                        Approve ({pendingN})
                      </button>
                    )}
                  </div>

                  {/* Expanded student list */}
                  {isExp && (
                    <div style={{ borderTop: '1px solid var(--glass-border)', background: 'var(--glass-bg)', padding: '8px 14px 12px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr>
                            {['Student', 'Adm No.', 'Score', 'Grade', ''].map(h => (
                              <th key={h} style={{ padding: '5px 6px', textAlign: 'left', fontSize: '0.6rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {g.rows.map((r: any) => {
                            const isApproved = approvedIds.has(r.id)
                            return (
                              <tr key={r.id} style={{ borderTop: '1px solid var(--glass-border)' }}>
                                <td style={{ padding: '6px', fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                                  {r.student?.full_name ?? '—'}
                                </td>
                                <td style={{ padding: '6px', fontFamily: 'monospace', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                  {r.student?.admission_number ?? r.student?.default_code ?? '—'}
                                </td>
                                <td style={{ padding: '6px', fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                                  {r.score}<span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>/{r.max_score ?? 100}</span>
                                </td>
                                <td style={{ padding: '6px' }}>
                                  <span style={{ fontWeight: 800, color: gradeColor(r.grade), fontSize: '0.8rem' }}>{r.grade}</span>
                                </td>
                                <td style={{ padding: '6px' }}>
                                  {isApproved ? (
                                    <span style={{ fontSize: '0.68rem', color: '#10B981', fontWeight: 700 }}>✓ Approved</span>
                                  ) : (
                                    <button onClick={() => approveResult(r.id)} style={{ fontSize: '0.68rem', fontWeight: 700, color: sc, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                                      Approve
                                    </button>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}

      <div className={styles.spacer} />

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)', padding: '10px 20px', background: '#10B981', color: '#fff', borderRadius: 24, fontWeight: 700, fontSize: '0.82rem', zIndex: 999, boxShadow: '0 4px 20px rgba(0,0,0,0.3)', whiteSpace: 'nowrap' }}>
          {toast}
        </div>
      )}
    </RolePageWrapper>
  )
}
