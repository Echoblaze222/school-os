'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { DownloadIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'

interface Props { profile: any; school: any; userId: string }

const TERMS    = ['First Term', 'Second Term', 'Third Term', 'All Terms']
const CUR_YEAR = new Date().getMonth() >= 8
  ? `${new Date().getFullYear()}/${new Date().getFullYear()+1}`
  : `${new Date().getFullYear()-1}/${new Date().getFullYear()}`

type DataSet = 'fee_payments' | 'fee_structures' | 'debtors'

export default function ExportClient({ profile, school, userId }: Props) {
  const [term,      setTerm]      = useState('First Term')
  const [year,      setYear]      = useState(CUR_YEAR)
  const [dataSet,   setDataSet]   = useState<DataSet>('fee_payments')
  const [exporting, setExporting] = useState(false)
  const [result,    setResult]    = useState<{ count:number } | null>(null)
  const supabase = createClient()
  const sc       = school?.primary_color ?? '#7C3AED'

  function toCSV(rows: any[], headers: string[]) {
    const esc  = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    return [headers.join(','), ...rows.map(r => headers.map(h => esc(r[h])).join(','))].join('\n')
  }

  function triggerDownload(csv: string, filename: string) {
    const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = Object.assign(document.createElement('a'), { href:url, download:filename })
    a.click(); URL.revokeObjectURL(url)
  }

  async function exportData() {
    setExporting(true); setResult(null)

    if (dataSet === 'fee_payments') {
      let q = supabase.from('fee_payments').select('*')
        .eq('school_id', school?.id).eq('academic_year', year)
      if (term !== 'All Terms') q = q.eq('term', term)
      const { data } = await q.order('created_at', { ascending:false })
      if (data && data.length > 0) {
        const cols = ['receipt_number','student_name','class_level','amount','term',
          'academic_year','fee_type','payment_method','reference','notes','created_at']
        triggerDownload(toCSV(data, cols),
          `payments-${term.replace(/ /g,'-')}-${year.replace('/','-')}.csv`)
      }
      setResult({ count: data?.length ?? 0 })
    }

    if (dataSet === 'fee_structures') {
      let q = supabase.from('school_fees').select('*')
        .eq('school_id', school?.id).eq('academic_year', year)
      if (term !== 'All Terms') q = q.eq('term', term)
      const { data } = await q.order('class_level')
      if (data && data.length > 0) {
        const cols = ['class_level','fee_type','amount','term','academic_year','description','created_at']
        triggerDownload(toCSV(data, cols),
          `fee-structures-${year.replace('/','-')}.csv`)
      }
      setResult({ count: data?.length ?? 0 })
    }

    if (dataSet === 'debtors') {
      const termFilter = term === 'All Terms' ? 'First Term' : term
      const [{ data: students }, { data: feeStructures }, { data: payments }] = await Promise.all([
        supabase.from('profiles').select('id, full_name, default_code, class_level')
          .eq('school_id', school?.id).eq('role', 'student'),
        supabase.from('school_fees').select('class_level, amount')
          .eq('school_id', school?.id).eq('term', termFilter).eq('academic_year', year),
        supabase.from('fee_payments').select('student_id, amount')
          .eq('school_id', school?.id).eq('term', termFilter).eq('academic_year', year),
      ])
      const expected: Record<string, number> = {}
      for (const f of (feeStructures ?? []))
        expected[f.class_level] = (expected[f.class_level] ?? 0) + (f.amount ?? 0)
      const paid: Record<string, number> = {}
      for (const p of (payments ?? []))
        if (p.student_id) paid[p.student_id] = (paid[p.student_id] ?? 0) + (p.amount ?? 0)
      const debtors = (students ?? [])
        .map((s: any) => ({
          full_name:   s.full_name,
          default_code:s.default_code,
          class_level: s.class_level,
          expected:    expected[s.class_level] ?? 0,
          paid:        paid[s.id] ?? 0,
          outstanding: (expected[s.class_level] ?? 0) - (paid[s.id] ?? 0),
        }))
        .filter(s => s.outstanding > 0)
        .sort((a, b) => b.outstanding - a.outstanding)
      if (debtors.length > 0) {
        const cols = ['full_name','default_code','class_level','expected','paid','outstanding']
        triggerDownload(toCSV(debtors, cols),
          `debtors-${termFilter.replace(/ /g,'-')}-${year.replace('/','-')}.csv`)
      }
      setResult({ count: debtors.length })
    }

    setExporting(false)
  }

  const DATASETS: { key:DataSet; label:string; desc:string }[] = [
    { key:'fee_payments',   label:'Payment Records',  desc:'All recorded student fee payments' },
    { key:'fee_structures', label:'Fee Structures',   desc:'Expected fee amounts by class level' },
    { key:'debtors',        label:'Debtors List',     desc:'Students with outstanding balances' },
  ]

  const inp: React.CSSProperties = { width:'100%', height:44, padding:'0 14px',
    background:'var(--input-bg)', border:'1px solid var(--input-border)',
    borderRadius:10, color:'var(--text-primary)', fontSize:'0.85rem', outline:'none' }
  const lbl: React.CSSProperties = { fontSize:'0.72rem', fontWeight:700,
    color:'var(--text-muted)', letterSpacing:'0.05em', marginBottom:6, display:'block' }

  return (
    <RolePageWrapper userId={userId} role="bursar" profile={profile} school={school} title="Export Data">
      <div style={{ display:'grid', gap:'var(--space-5)' }}>

        {/* Dataset picker */}
        <div>
          <label style={lbl}>WHAT TO EXPORT</label>
          <div style={{ display:'grid', gap:'var(--space-3)' }}>
            {DATASETS.map(ds => (
              <button key={ds.key} onClick={() => setDataSet(ds.key)}
                style={{ padding:'var(--space-4)',
                  background: dataSet===ds.key ? sc+'18' : 'var(--input-bg)',
                  border: `1px solid ${dataSet===ds.key ? sc : 'var(--input-border)'}`,
                  borderRadius:10, cursor:'pointer', textAlign:'left',
                  transition:'all 0.15s' }}>
                <p style={{ fontSize:'0.85rem', fontWeight:700,
                  color: dataSet===ds.key ? sc : 'var(--text-primary)', margin:'0 0 2px' }}>
                  {ds.label}
                </p>
                <p style={{ fontSize:'0.75rem', color:'var(--text-muted)', margin:0 }}>
                  {ds.desc}
                </p>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label style={lbl}>ACADEMIC YEAR</label>
          <input value={year} onChange={e => setYear(e.target.value)}
            placeholder="2024/2025" style={inp}/>
        </div>

        <div>
          <label style={lbl}>TERM</label>
          <select value={term} onChange={e => setTerm(e.target.value)} style={inp}>
            {TERMS.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {result !== null && (
        <div style={{ padding:'var(--space-4)', marginTop:'var(--space-5)',
          background: result.count > 0 ? '#10B98115' : '#F59E0B15',
          border: `1px solid ${result.count > 0 ? '#10B98140' : '#F59E0B40'}`,
          borderRadius:10, fontSize:'0.85rem', fontWeight:700,
          color: result.count > 0 ? '#10B981' : '#F59E0B' }}>
          {result.count > 0
            ? `✓ Downloaded ${result.count} record${result.count !== 1 ? 's' : ''}`
            : 'No records found for this selection'}
        </div>
      )}

      <button onClick={exportData} disabled={exporting}
        style={{ width:'100%', height:50, background:sc, color:'#fff',
          border:'none', borderRadius:10, fontWeight:700, fontSize:'0.9rem',
          cursor:'pointer', marginTop:'var(--space-5)',
          display:'flex', alignItems:'center', justifyContent:'center',
          gap:10, opacity:exporting ? 0.7 : 1 }}>
        <DownloadIcon size={18} color="#fff"/>
        {exporting ? 'Preparing download…' : 'Download CSV'}
      </button>

      <div className={styles.spacer}/>
    </RolePageWrapper>
  )
}
