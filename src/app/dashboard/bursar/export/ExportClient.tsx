'use client'
// src/app/dashboard/bursar/export/ExportClient.tsx
//
// Fixed: was reading from `fee_payments` and `school_fees`, tables nothing
// writes to anymore. Now exports from `payments` (joined through
// payment_invoices -> fee_structures -> profiles) and `fee_structures`
// directly, and computes debtors from `payment_invoices` instead of
// manually diffing school_fees vs fee_payments.

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

const TERM_KEY_MAP: Record<string, string> = {
  'First Term': 'first', 'Second Term': 'second', 'Third Term': 'third',
}
const TERM_LABELS: Record<string, string> = {
  first: 'First Term', second: 'Second Term', third: 'Third Term',
}

type DataSet = 'payments' | 'fee_structures' | 'debtors'

export default function ExportClient({ profile, school, userId }: Props) {
  const [term,      setTerm]      = useState('First Term')
  const [year,      setYear]      = useState(CUR_YEAR)
  const [dataSet,   setDataSet]   = useState<DataSet>('payments')
  const [exporting, setExporting] = useState(false)
  const [result,    setResult]    = useState<{ count:number } | null>(null)
  const [error,     setError]     = useState('')
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
    setExporting(true); setResult(null); setError('')

    try {
      if (dataSet === 'payments') {
        let q = supabase
          .from('payments')
          .select(`
            receipt_number, payment_method, payment_reference, notes,
            paid_at, created_at, amount_paid_ngn, amount_paid_usd, currency_used,
            payment_invoices ( fee_structures ( description, term, academic_year ) ),
            profiles!student_id ( full_name, class_level )
          `)
          .eq('school_id', school?.id)
          .eq('payment_invoices.fee_structures.academic_year', year)

        if (term !== 'All Terms') {
          q = q.eq('payment_invoices.fee_structures.term', TERM_KEY_MAP[term] ?? 'first')
        }
        const { data, error: err } = await q.order('created_at', { ascending: false })
        if (err) throw err

        const wantedTermKey = term === 'All Terms' ? null : (TERM_KEY_MAP[term] ?? 'first')

        const rows = (data ?? [])
          .filter((row: any) => {
            const fs = row.payment_invoices?.fee_structures
            if (!fs || fs.academic_year !== year) return false
            if (wantedTermKey && fs.term !== wantedTermKey) return false
            return true
          })
          .map((row: any) => {
            const fs      = row.payment_invoices.fee_structures
            const student = row['profiles!student_id']
            return {
              receipt_number: row.receipt_number,
              student_name:   student?.full_name ?? '',
              class_level:    student?.class_level ?? '',
              amount:         row.currency_used === 'USD' ? row.amount_paid_usd : row.amount_paid_ngn,
              currency:       row.currency_used,
              term:           TERM_LABELS[fs?.term] ?? fs?.term ?? '',
              academic_year:  fs?.academic_year ?? '',
              fee_type:       fs?.description ?? '',
              payment_method: row.payment_method,
              reference:      row.payment_reference,
              notes:          row.notes,
              created_at:     row.paid_at ?? row.created_at,
            }
          })

        if (rows.length > 0) {
          const cols = ['receipt_number','student_name','class_level','amount','currency','term',
            'academic_year','fee_type','payment_method','reference','notes','created_at']
          triggerDownload(toCSV(rows, cols),
            `payments-${term.replace(/ /g,'-')}-${year.replace('/','-')}.csv`)
        }
        setResult({ count: rows.length })
      }

      if (dataSet === 'fee_structures') {
        let q = supabase
          .from('fee_structures')
          .select('description, amount_ngn, term, academic_year, created_at, classes(class_level)')
          .eq('school_id', school?.id)
          .eq('academic_year', year)

        if (term !== 'All Terms') q = q.eq('term', TERM_KEY_MAP[term] ?? 'first')
        const { data, error: err } = await q
        if (err) throw err

        const rows = (data ?? []).map((f: any) => ({
          class_level:   f.classes?.class_level ?? '',
          fee_type:      f.description,
          amount:        f.amount_ngn,
          term:          TERM_LABELS[f.term] ?? f.term,
          academic_year: f.academic_year,
          created_at:    f.created_at,
        })).sort((a, b) => (a.class_level || '').localeCompare(b.class_level || ''))

        if (rows.length > 0) {
          const cols = ['class_level','fee_type','amount','term','academic_year','created_at']
          triggerDownload(toCSV(rows, cols),
            `fee-structures-${year.replace('/','-')}.csv`)
        }
        setResult({ count: rows.length })
      }

      if (dataSet === 'debtors') {
        const termFilter = term === 'All Terms' ? 'First Term' : term
        const termKey     = TERM_KEY_MAP[termFilter] ?? 'first'

        const { data: invoices, error: err } = await supabase
          .from('payment_invoices')
          .select(`
            balance_ngn, amount_due_ngn, amount_paid_ngn, status,
            fee_structures ( term, academic_year ),
            profiles!student_id ( full_name, default_code, class_level )
          `)
          .eq('school_id', school?.id)
          .eq('fee_structures.term', termKey)
          .eq('fee_structures.academic_year', year)
          .gt('balance_ngn', 0)

        if (err) throw err

        // Aggregate per student (one student may have multiple unpaid invoices)
        const byStudent = new Map<string, any>()
        for (const inv of (invoices ?? [])) {
          if (!inv.fee_structures) continue
          const student = (inv as any)['profiles!student_id']
          if (!student) continue
          const key = student.full_name + '|' + (student.default_code ?? '')
          if (!byStudent.has(key)) {
            byStudent.set(key, {
              full_name:    student.full_name,
              default_code: student.default_code ?? '',
              class_level:  student.class_level ?? '',
              expected:     0,
              paid:         0,
              outstanding:  0,
            })
          }
          const entry = byStudent.get(key)
          entry.expected    += inv.amount_due_ngn ?? 0
          entry.paid        += inv.amount_paid_ngn ?? 0
          entry.outstanding += inv.balance_ngn ?? 0
        }

        const debtors = Array.from(byStudent.values())
          .filter(d => d.outstanding > 0)
          .sort((a, b) => b.outstanding - a.outstanding)

        if (debtors.length > 0) {
          const cols = ['full_name','default_code','class_level','expected','paid','outstanding']
          triggerDownload(toCSV(debtors, cols),
            `debtors-${termFilter.replace(/ /g,'-')}-${year.replace('/','-')}.csv`)
        }
        setResult({ count: debtors.length })
      }
    } catch (e: any) {
      setError(e.message ?? 'Export failed. Please try again.')
    }

    setExporting(false)
  }

  const DATASETS: { key:DataSet; label:string; desc:string }[] = [
    { key:'payments',       label:'Payment Records',  desc:'All recorded student fee payments' },
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

      {error && (
        <div style={{ padding:'var(--space-4)', marginTop:'var(--space-5)',
          background:'#EF444415', border:'1px solid #EF444440',
          borderRadius:10, fontSize:'0.85rem', fontWeight:700, color:'#EF4444' }}>
          ⚠️ {error}
        </div>
      )}

      {result !== null && !error && (
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
