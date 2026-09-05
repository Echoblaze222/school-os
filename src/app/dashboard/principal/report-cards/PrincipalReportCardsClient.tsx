'use client'
// src/app/dashboard/principal/report-cards/PrincipalReportCardsClient.tsx

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import DashboardHeader from '@/components/DashboardHeader'
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh'

const TERM_LABEL: Record<string, string> = {
  first: 'First Term', second: 'Second Term', third: 'Third Term',
}

export default function PrincipalReportCardsClient({ profile, school, principalId, hasSignature, reportCards }: any) {
  const supabase = createClient()
  const sc = school?.primary_color ?? '#7C3AED'

  const [cards, setCards] = useState(reportCards)
  const [principalRemarks, setPrincipalRemarks] = useState<Record<string, string>>(
    Object.fromEntries(reportCards.map((rc: any) => [rc.id, rc.principal_remark ?? '']))
  )
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const pending  = cards.filter((c: any) => c.status === 'pending_approval')
  const approved = cards.filter((c: any) => c.status === 'approved')

  async function load() {
    const { data } = await supabase
      .from('report_cards')
      .select(`
        id, term, academic_year, class_teacher_remark, principal_remark, status,
        attendance_start_date, attendance_end_date,
        student:profiles!report_cards_student_id_fkey ( full_name, admission_number ),
        classes ( name, class_level )
      `)
      .eq('school_id', school?.id)
      .order('created_at', { ascending: false })
    if (data) setCards(data)
  }

  // Class teachers submit report cards into this queue continuously -
  // the principal shouldn't have to manually reload to see a new one
  // waiting for approval.
  useRealtimeRefresh({ tables: ['report_cards'], filter: `school_id=eq.${school?.id}`, onChange: load })

  async function approve(id: string) {
    if (!hasSignature) {
      setError('Upload your signature in Settings before approving report cards.')
      return
    }
    setSavingId(id)
    setError(null)
    const { error: err } = await supabase
      .from('report_cards')
      .update({
        principal_remark: principalRemarks[id] ?? '',
        status: 'approved',
        approved_by: principalId,
        approved_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (err) {
      console.error('[principal report cards] approve error:', err.message)
      setError("We couldn't approve that report card. Try again.")
    } else {
      setCards((prev: any) => prev.map((c: any) => c.id === id ? { ...c, status: 'approved' } : c))
    }
    setSavingId(null)
  }

  async function downloadPreview(id: string) {
    setDownloadingId(id)
    const res = await fetch('/api/report-card/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ report_card_id: id }),
    })
    const data = await res.json()
    setDownloadingId(null)
    if (data.url) window.open(data.url, '_blank')
    else setError(data.error ?? 'Failed to generate preview')
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: 'var(--space-4)' }}>
      <DashboardHeader profile={profile} school={school} userId={principalId} role="principal" title="Report Cards" />

      {!hasSignature && (
        <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid #F59E0B', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#F59E0B', fontSize: '0.85rem' }}>
          You haven't uploaded a signature yet. Add one in Settings before approving report cards.
        </div>
      )}
      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid #EF4444', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#EF4444', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}

      <h3 style={{ marginBottom: 10 }}>Pending Approval ({pending.length})</h3>
      {pending.length === 0 && <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>Nothing waiting for review.</p>}
      {pending.map((rc: any) => (
        <div key={rc.id} style={{ border: '1px solid var(--glass-border)', borderRadius: 10, padding: 14, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <strong>{rc.student?.full_name}</strong>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              {rc.classes?.name ?? rc.classes?.class_level} · {TERM_LABEL[rc.term] ?? rc.term} · {rc.academic_year}
            </span>
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 8 }}>
            <em>Class teacher's remark:</em> {rc.class_teacher_remark || 'N/A'}
          </p>
          <textarea
            value={principalRemarks[rc.id] ?? ''}
            onChange={e => setPrincipalRemarks(r => ({ ...r, [rc.id]: e.target.value }))}
            placeholder="Your remark (optional)…"
            className="input"
            style={{ width: '100%', minHeight: 50, marginBottom: 8 }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="pressable" onClick={() => downloadPreview(rc.id)} disabled={downloadingId === rc.id}
              style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--glass-border)', background: 'transparent', color: 'var(--text-primary)', fontWeight: 600 }}>
              {downloadingId === rc.id ? 'Loading…' : 'Preview'}
            </button>
            <button className="pressable" onClick={() => approve(rc.id)} disabled={savingId === rc.id}
              style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: sc, color: '#fff', fontWeight: 700 }}>
              {savingId === rc.id ? 'Approving…' : 'Approve & Sign'}
            </button>
          </div>
        </div>
      ))}

      <h3 style={{ margin: '24px 0 10px' }}>Approved ({approved.length})</h3>
      {approved.map((rc: any) => (
        <div key={rc.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', border: '1px solid var(--glass-border)', borderRadius: 10, marginBottom: 8 }}>
          <span>{rc.student?.full_name}, {TERM_LABEL[rc.term] ?? rc.term} · {rc.academic_year}</span>
          <button className="pressable" onClick={() => downloadPreview(rc.id)} disabled={downloadingId === rc.id}
            style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--glass-border)', background: 'transparent', color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.8rem' }}>
            {downloadingId === rc.id ? 'Loading…' : 'View PDF'}
          </button>
        </div>
      ))}
    </div>
  )
}
