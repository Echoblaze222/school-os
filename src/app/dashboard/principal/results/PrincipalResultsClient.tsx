'use client'
// src/app/dashboard/principal/results/PrincipalResultsClient.tsx
//
// REDESIGNED: replaced principal.module.css table (which had no mobile CSS)
//   with inline-styled card list matching the rest of the app design system.
//   On mobile each result is a card — no horizontal scrolling table.
// FIXED: term filter labels ('First Term') vs DB values ('first') — now shows
//   correct labels but filters using DB enum values
// FIXED: typeFilter toggle — clicking active type now clears it (shows All)

import { useEffect, useState, useMemo } from 'react'
import { useRealtimeTable }             from '@/hooks/useRealtimeTable'
import Link                             from 'next/link'
import { createClient }                 from '@/lib/supabase/client'
import type { ResultRow, ClassOption }  from '../types'

interface Props { results: ResultRow[]; classOptions: ClassOption[]; schoolId?: string }

const TERM_OPTIONS = [
  { value: 'first',  label: 'First Term'  },
  { value: 'second', label: 'Second Term' },
  { value: 'third',  label: 'Third Term'  },
]
const TYPE_OPTIONS = [
  { value: 'day_test', label: 'Day Test' },
  { value: 'mid_term', label: 'Mid-Term' },
  { value: 'exam',     label: 'Exam'     },
]

function gradeColor(g: string) {
  const u = (g ?? '').toUpperCase()
  if (u === 'A') return '#22c55e'
  if (u === 'B') return '#3b82f6'
  if (u === 'C') return '#f59e0b'
  if (u === 'D' || u === 'E') return '#f97316'
  if (u === 'F') return '#ef4444'
  return '#6b7280'
}
function gradeBg(g: string) { return gradeColor(g) + '22' }
function initials(n: string) { return n.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase() }

const IcDownload = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
const IcCheck   = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
const IcBack    = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>

export default function PrincipalResultsClient({ results: initialResults, classOptions, schoolId }: Props) {
  const [termFilter,  setTermFilter]  = useState('first')
  const [typeFilter,  setTypeFilter]  = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [approving,   setApproving]   = useState<Set<string>>(new Set())
  const [approvedIds, setApprovedIds] = useState<Set<string>>(
    new Set(initialResults.filter(r => r.approved).map(r => r.id))
  )
  const [toast, setToast] = useState<string | null>(null)

  // Realtime: approved updates push immediately
  const [liveResults] = useRealtimeTable<ResultRow>({
    table:   'results',
    filter:  schoolId ? `school_id=eq.${schoolId}` : undefined,
    initial: initialResults,
  })

  // Sync approvedIds when realtime pushes updates
  useEffect(() => {
    const newApproved = liveResults.filter(r => r.approved).map(r => r.id)
    setApprovedIds(prev => new Set([...prev, ...newApproved]))
  }, [liveResults])

  const sc = '#800020' // fallback; RolePageWrapper isn't used here so we use school colour inline

  const filtered = useMemo(() => liveResults.filter(r => {
    if (termFilter  && r.term        !== termFilter)  return false
    if (typeFilter  && r.result_type !== typeFilter)  return false
    if (classFilter && r.class_id    !== classFilter) return false
    return true
  }), [liveResults, termFilter, typeFilter, classFilter])

  const pendingCount = filtered.filter(r => !approvedIds.has(r.id)).length

  function showToast(m: string) { setToast(m); setTimeout(() => setToast(null), 3000) }

  async function approveResult(id: string) {
    setApproving(p => new Set(p).add(id))
    const supabase = createClient()
    const { error } = await supabase.from('results').update({ approved: true }).eq('id', id)
    setApproving(p => { const n = new Set(p); n.delete(id); return n })
    if (!error) { setApprovedIds(p => new Set(p).add(id)); showToast('Result approved ✓') }
    else showToast('Approval failed')
  }

  async function approveAll() {
    const ids = filtered.filter(r => !approvedIds.has(r.id)).map(r => r.id)
    if (!ids.length) return
    const supabase = createClient()
    const { error } = await supabase.from('results').update({ approved: true }).in('id', ids)
    if (!error) { setApprovedIds(p => new Set([...p, ...ids])); showToast(`${ids.length} results approved ✓`) }
    else showToast('Bulk approval failed')
  }

  function exportCSV() {
    const headers = ['Student', 'Number', 'Subject', 'Class', 'Term', 'Type', 'Score', 'Max', 'Grade', 'Approved']
    const TYPE_LABELS: Record<string, string> = { day_test: 'Day Test', mid_term: 'Mid-Term', exam: 'Exam' }
    const rows = filtered.map(r => [
      r.student_name, r.student_number ?? '',
      r.subject_name, r.class_name,
      r.term, TYPE_LABELS[r.result_type] ?? r.result_type,
      r.score, r.max_score, r.grade,
      approvedIds.has(r.id) ? 'Yes' : 'No',
    ])
    const csv  = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a    = document.createElement('a')
    a.href     = URL.createObjectURL(blob)
    a.download = `results-${termFilter}-term.csv`
    a.click()
    URL.revokeObjectURL(a.href)
    showToast('Exported as CSV')
  }

  const currentTermLabel = TERM_OPTIONS.find(t => t.value === termFilter)?.label ?? 'First Term'

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', paddingBottom: 100 }}>

      {/* ── Header ── */}
      <div style={{
        padding: '16px 16px 0',
        borderBottom: '1px solid var(--glass-border)',
        paddingBottom: 16,
        background: 'var(--bg-primary)',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <Link href="/dashboard/principal" style={{
            display: 'flex', alignItems: 'center', gap: 6,
            color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600,
            textDecoration: 'none',
          }}>
            <IcBack /> Dashboard
          </Link>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={exportCSV}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '7px 12px', borderRadius: 8,
                background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
                color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
              }}
            >
              <IcDownload /> CSV
            </button>
            {pendingCount > 0 && (
              <button
                onClick={approveAll}
                style={{
                  padding: '7px 12px', borderRadius: 8,
                  background: '#22c55e', border: 'none',
                  color: '#fff', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
                }}
              >
                Approve All ({pendingCount})
              </button>
            )}
          </div>
        </div>
        <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>
          Results
        </h1>
      </div>

      <div style={{ padding: '16px 16px 0' }}>

        {/* ── Term filter ── */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, overflowX: 'auto', paddingBottom: 2 }}>
          {TERM_OPTIONS.map(t => (
            <button
              key={t.value}
              onClick={() => setTermFilter(t.value)}
              style={{
                flexShrink: 0, padding: '6px 14px', borderRadius: 999,
                fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
                background: termFilter === t.value ? '#800020'      : 'var(--glass-bg)',
                color:      termFilter === t.value ? '#fff'         : 'var(--text-muted)',
                border:     termFilter === t.value ? '1px solid #800020' : '1px solid var(--glass-border)',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Type filter ── */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, overflowX: 'auto', paddingBottom: 2 }}>
          <button
            onClick={() => setTypeFilter('')}
            style={{
              flexShrink: 0, padding: '6px 14px', borderRadius: 999,
              fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
              background: !typeFilter ? '#800020'      : 'var(--glass-bg)',
              color:      !typeFilter ? '#fff'         : 'var(--text-muted)',
              border:     !typeFilter ? '1px solid #800020' : '1px solid var(--glass-border)',
            }}
          >
            All Types
          </button>
          {TYPE_OPTIONS.map(t => (
            <button
              key={t.value}
              onClick={() => setTypeFilter(prev => prev === t.value ? '' : t.value)}
              style={{
                flexShrink: 0, padding: '6px 14px', borderRadius: 999,
                fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
                background: typeFilter === t.value ? '#800020'      : 'var(--glass-bg)',
                color:      typeFilter === t.value ? '#fff'         : 'var(--text-muted)',
                border:     typeFilter === t.value ? '1px solid #800020' : '1px solid var(--glass-border)',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Class filter + stats ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <select
            value={classFilter}
            onChange={e => setClassFilter(e.target.value)}
            style={{
              flex: 1, padding: '8px 12px', borderRadius: 8,
              background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
              color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none',
            }}
          >
            <option value="">All Classes</option>
            {classOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button
            onClick={exportCSV}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
              padding: '8px 12px', borderRadius: 8,
              background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
              color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
            }}
          >
            <IcDownload /> Export CSV
          </button>
        </div>

        {/* ── Stats row ── */}
        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 14 }}>
          {filtered.length} result{filtered.length !== 1 ? 's' : ''} · {pendingCount} pending approval
        </p>

        {/* ── Result cards ── */}
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} style={{ marginBottom: 12, opacity: 0.4 }}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
            <p style={{ margin: 0, fontWeight: 700, color: 'var(--text-primary)' }}>
              No results posted for {currentTermLabel}.
            </p>
            <p style={{ margin: '4px 0 0', fontSize: '0.78rem' }}>
              Teachers need to post results before they appear here.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(r => {
              const isApproved  = approvedIds.has(r.id)
              const isApproving = approving.has(r.id)
              const pct         = r.max_score > 0 ? Math.round((r.score / r.max_score) * 100) : 0
              const typeLabel   = TYPE_OPTIONS.find(t => t.value === r.result_type)?.label ?? r.result_type

              return (
                <div
                  key={r.id}
                  style={{
                    background:    'var(--glass-bg)',
                    border:        `1px solid ${isApproved ? '#22c55e44' : 'var(--glass-border)'}`,
                    borderRadius:  14,
                    padding:       '12px 14px',
                    display:       'flex',
                    alignItems:    'center',
                    gap:           12,
                  }}
                >
                  {/* Avatar */}
                  <div style={{
                    width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                    background: 'var(--glass-border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)',
                  }}>
                    {initials(r.student_name)}
                  </div>

                  {/* Main info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      margin: '0 0 2px', fontWeight: 700, fontSize: '0.85rem',
                      color: 'var(--text-primary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {r.student_name}
                    </p>
                    <p style={{ margin: '0 0 4px', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                      {r.student_number ?? '—'}
                    </p>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                        {r.subject_name}
                      </span>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>·</span>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                        {r.class_name}
                      </span>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>·</span>
                      <span style={{
                        fontSize: '0.65rem', fontWeight: 700, padding: '2px 7px',
                        borderRadius: 999, background: 'var(--glass-border)',
                        color: 'var(--text-muted)',
                      }}>
                        {typeLabel}
                      </span>
                    </div>
                    {/* Score bar */}
                    <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 4, background: 'var(--glass-border)', borderRadius: 999, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: gradeColor(r.grade), borderRadius: 999, transition: 'width 0.4s' }}/>
                      </div>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                        {r.score}/{r.max_score}
                      </span>
                    </div>
                  </div>

                  {/* Right: grade + approve */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: 8,
                      background: gradeBg(r.grade),
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <span style={{ fontWeight: 800, fontSize: '0.9rem', color: gradeColor(r.grade) }}>
                        {r.grade ?? '—'}
                      </span>
                    </div>
                    {isApproved ? (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 3,
                        fontSize: '0.65rem', fontWeight: 700, color: '#22c55e',
                      }}>
                        <IcCheck /> Done
                      </div>
                    ) : (
                      <button
                        onClick={() => approveResult(r.id)}
                        disabled={isApproving}
                        style={{
                          padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                          background: isApproving ? 'var(--glass-border)' : '#22c55e',
                          border: 'none', color: '#fff',
                          fontSize: '0.68rem', fontWeight: 700,
                          opacity: isApproving ? 0.7 : 1,
                        }}
                      >
                        {isApproving ? '…' : 'Approve'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Toast ── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)',
          background: '#1f2937', color: '#fff', padding: '10px 20px',
          borderRadius: 10, fontSize: '0.82rem', fontWeight: 600,
          zIndex: 999, whiteSpace: 'nowrap', boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        }}>
          {toast}
        </div>
      )}
    </div>
  )
}
