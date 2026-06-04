'use client'
// src/app/dashboard/principal/results/ResultsClient.tsx
// FIX: Results grouped by class → subject → teacher (not a raw flat list)
// FIX: Shows which teacher posted each set of results
// FIX: Class filter + term filter

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { BarChartIcon } from '@/components/Icons'

interface Props { profile: any; school: any; userId: string }

interface ResultGroup {
  class_id:     string
  class_name:   string
  subject:      string
  teacher_name: string
  teacher_id:   string
  count:        number
  avg_score:    number
  avg_pct:      number
  pass_count:   number
  term:         string
}

export default function ResultsClient({ profile, school, userId }: Props) {
  const [groups,   setGroups]   = useState<ResultGroup[]>([])
  const [classes,  setClasses]  = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [term,     setTerm]     = useState('1st Term')
  const [classId,  setClassId]  = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [detail,   setDetail]   = useState<any[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const supabase = createClient()
  const sc       = school?.primary_color ?? '#7C3AED'

  useEffect(() => { loadClasses() }, [])
  useEffect(() => { load() }, [term, classId])

  async function loadClasses() {
    const { data } = await supabase
      .from('classes')
      .select('id, name, class_level')
      .eq('school_id', school?.id)
      .order('class_level')
    if (data) setClasses(data)
  }

  async function load() {
    setLoading(true)
    // Fetch all results for this school + term, with teacher and class info
    let q = supabase
      .from('results')
      .select(`
        id, subject, score, max_score, grade, term, class_id,
        teacher_id,
        teacher:profiles!teacher_id ( full_name ),
        class:classes ( name, class_level )
      `)
      .eq('school_id', school?.id)
      .eq('term', term)

    if (classId) q = q.eq('class_id', classId)

    const { data } = await q.limit(500)

    if (!data) { setLoading(false); return }

    // Group by class_id + subject + teacher_id
    const map: Record<string, {
      class_id: string; class_name: string; subject: string
      teacher_name: string; teacher_id: string; term: string
      scores: number[]; max_scores: number[]; grades: string[]
    }> = {}

    data.forEach((r: any) => {
      const key = `${r.class_id}__${r.subject}__${r.teacher_id}`
      if (!map[key]) {
        map[key] = {
          class_id:     r.class_id,
          class_name:   r.class?.name ?? r.class?.class_level ?? '—',
          subject:      r.subject,
          teacher_name: r.teacher?.full_name ?? 'Unknown',
          teacher_id:   r.teacher_id,
          term:         r.term,
          scores:       [],
          max_scores:   [],
          grades:       [],
        }
      }
      map[key].scores.push(r.score ?? 0)
      map[key].max_scores.push(r.max_score ?? 100)
      map[key].grades.push(r.grade ?? 'F')
    })

    const result: ResultGroup[] = Object.values(map).map(g => {
      const total   = g.scores.reduce((s, v) => s + v, 0)
      const maxTotal = g.max_scores.reduce((s, v) => s + v, 0)
      const avg_pct = maxTotal > 0 ? Math.round((total / maxTotal) * 100) : 0
      return {
        class_id:     g.class_id,
        class_name:   g.class_name,
        subject:      g.subject,
        teacher_name: g.teacher_name,
        teacher_id:   g.teacher_id,
        term:         g.term,
        count:        g.scores.length,
        avg_score:    g.scores.length ? Math.round(total / g.scores.length) : 0,
        avg_pct,
        pass_count:   g.grades.filter(gr => gr !== 'F').length,
      }
    })

    // Sort: by class name, then subject
    result.sort((a, b) => {
      const c = a.class_name.localeCompare(b.class_name)
      return c !== 0 ? c : a.subject.localeCompare(b.subject)
    })

    setGroups(result)
    setLoading(false)
  }

  async function loadDetail(classId: string, subject: string, teacherId: string) {
    const key = `${classId}__${subject}__${teacherId}`
    if (expanded === key) { setExpanded(null); return }
    setExpanded(key)
    setDetailLoading(true)
    const { data } = await supabase
      .from('results')
      .select('id, score, max_score, grade, student:profiles!student_id(full_name, default_code)')
      .eq('school_id', school?.id)
      .eq('class_id', classId)
      .eq('subject', subject)
      .eq('teacher_id', teacherId)
      .eq('term', term)
      .order('student(full_name)')
    setDetail(data ?? [])
    setDetailLoading(false)
  }

  function gradeColor(g: string) {
    if (g === 'A') return '#10B981'
    if (g === 'B') return '#3B82F6'
    if (g === 'C') return '#F59E0B'
    if (g === 'D') return '#F97316'
    return '#EF4444'
  }

  // Group result groups by class for display
  const byClass: Record<string, ResultGroup[]> = {}
  groups.forEach(g => {
    if (!byClass[g.class_id]) byClass[g.class_id] = []
    byClass[g.class_id].push(g)
  })

  return (
    <RolePageWrapper userId={userId} role="principal" profile={profile} school={school} title="Results">

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 'var(--space-4)', flexWrap: 'wrap' as const }}>
        {['1st Term', '2nd Term', '3rd Term'].map(t => (
          <button key={t} onClick={() => setTerm(t)} style={{
            padding: '6px 14px', borderRadius: 999, fontSize: '0.75rem', fontWeight: 700,
            background: term === t ? sc : 'var(--glass-bg)',
            color:      term === t ? '#fff' : 'var(--text-muted)',
            border:     `1px solid ${term === t ? sc : 'var(--glass-border)'}`,
            cursor: 'pointer',
          }}>
            {t}
          </button>
        ))}
      </div>

      <div style={{ marginBottom: 'var(--space-5)' }}>
        <select
          value={classId}
          onChange={e => setClassId(e.target.value)}
          style={{
            height: 38, padding: '0 12px', width: '100%',
            background: 'var(--input-bg)',
            border: '1px solid var(--input-border)',
            borderRadius: 8, color: 'var(--text-primary)',
            fontSize: '0.85rem', outline: 'none',
          }}>
          <option value="">All Classes</option>
          {classes.map((c: any) => (
            <option key={c.id} value={c.id}>{c.name ?? c.class_level}</option>
          ))}
        </select>
      </div>

      {/* Summary stat */}
      {!loading && groups.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 'var(--space-5)' }}>
          {[
            { label: 'Groups',   value: groups.length,                                          color: sc },
            { label: 'Students', value: groups.reduce((s, g) => s + g.count, 0),               color: '#3B82F6' },
            { label: 'Avg Score',value: `${Math.round(groups.reduce((s, g) => s + g.avg_pct, 0) / groups.length)}%`, color: '#10B981' },
          ].map(s => (
            <div key={s.label} style={{
              textAlign: 'center', padding: '10px',
              background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 8,
            }}>
              <p style={{ margin: '0 0 2px', fontSize: '1.15rem', fontWeight: 800, color: s.color }}>{s.value}</p>
              <p style={{ margin: 0, fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', gap: 4, padding: '40px 0', justifyContent: 'center' }}>
          {[0,1,2].map(i => <span key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: sc, opacity: 0.5 + i * 0.2 }} />)}
        </div>
      ) : groups.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <BarChartIcon size={40} color="var(--text-faint)" strokeWidth={1} />
          <p style={{ color: 'var(--text-muted)', marginTop: 12 }}>No results for {term}{classId ? ' in this class' : ''}</p>
        </div>
      ) : (
        // Grouped by class
        Object.entries(byClass).map(([cid, cGroups]) => (
          <div key={cid} style={{ marginBottom: 'var(--space-5)' }}>
            {/* Class header */}
            <div style={{
              padding: '8px 14px',
              background: sc + '15',
              border: `1px solid ${sc}30`,
              borderRadius: '10px 10px 0 0',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <p style={{ margin: 0, fontWeight: 800, color: sc, fontSize: '0.88rem' }}>
                {cGroups[0].class_name}
              </p>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                {cGroups.length} subject{cGroups.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Subject rows */}
            <div style={{ border: `1px solid ${sc}20`, borderTop: 'none', borderRadius: '0 0 10px 10px', overflow: 'hidden' }}>
              {cGroups.map((g, i) => {
                const key   = `${g.class_id}__${g.subject}__${g.teacher_id}`
                const isExp = expanded === key
                const passRate = g.count > 0 ? Math.round((g.pass_count / g.count) * 100) : 0

                return (
                  <div key={key}>
                    <button
                      onClick={() => loadDetail(g.class_id, g.subject, g.teacher_id)}
                      style={{
                        width: '100%', textAlign: 'left' as const,
                        padding: '10px 14px',
                        background: isExp ? 'var(--glass-bg)' : 'var(--surface)',
                        border: 'none',
                        borderTop: i > 0 ? '1px solid var(--glass-border)' : 'none',
                        cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 10,
                        fontFamily: 'inherit',
                      }}>
                      {/* Subject + teacher */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: '0 0 2px', fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                          {g.subject}
                        </p>
                        <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          {g.teacher_name} · {g.count} students
                        </p>
                      </div>

                      {/* Avg + pass rate */}
                      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                        <div style={{ textAlign: 'center' as const }}>
                          <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: g.avg_pct >= 60 ? '#10B981' : '#EF4444' }}>
                            {g.avg_pct}%
                          </p>
                          <p style={{ margin: 0, fontSize: '0.55rem', color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>avg</p>
                        </div>
                        <div style={{ textAlign: 'center' as const }}>
                          <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: passRate >= 70 ? '#10B981' : '#F59E0B' }}>
                            {passRate}%
                          </p>
                          <p style={{ margin: 0, fontSize: '0.55rem', color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>pass</p>
                        </div>
                      </div>

                      <span style={{ color: 'var(--text-muted)', fontSize: 12, transform: isExp ? 'rotate(180deg)' : 'none', flexShrink: 0 }}>▾</span>
                    </button>

                    {/* Expanded student detail */}
                    {isExp && (
                      <div style={{ borderTop: '1px solid var(--glass-border)', background: 'var(--glass-bg)', padding: '8px 14px 12px' }}>
                        {detailLoading ? (
                          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', padding: '8px 0' }}>Loading…</p>
                        ) : (
                          <table style={{ width: '100%', borderCollapse: 'collapse' as const }}>
                            <thead>
                              <tr>
                                {['Student', 'Code', 'Score', 'Grade'].map(h => (
                                  <th key={h} style={{ padding: '5px 6px', textAlign: 'left' as const, fontSize: '0.6rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {detail.map((r: any) => (
                                <tr key={r.id} style={{ borderTop: '1px solid var(--glass-border)' }}>
                                  <td style={{ padding: '6px 6px', fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                                    {r.student?.full_name ?? '—'}
                                  </td>
                                  <td style={{ padding: '6px 6px', fontFamily: 'monospace', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                    {r.student?.default_code ?? '—'}
                                  </td>
                                  <td style={{ padding: '6px 6px', fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                                    {r.score}/{r.max_score ?? 100}
                                  </td>
                                  <td style={{ padding: '6px 6px' }}>
                                    <span style={{ fontWeight: 800, color: gradeColor(r.grade), fontSize: '0.8rem' }}>
                                      {r.grade}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}

      <div style={{ height: 110 }} />
    </RolePageWrapper>
  )
}
