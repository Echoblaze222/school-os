'use client'
import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { ResultRow, ClassOption } from '../types'
import styles from '../principal.module.css'

interface Props { results: ResultRow[]; classOptions: ClassOption[] }

const TERMS = ['first','second','third']
const TYPES = ['day_test','mid_term','exam']
const TYPE_LABELS: Record<string,string> = { day_test:'Day Test', mid_term:'Mid-Term', exam:'Exam' }

function gradeColor(g: string) {
  const u = g.toUpperCase()
  if (u.startsWith('A')) return 'var(--success)'
  if (u.startsWith('B')) return 'var(--info)'
  if (u.startsWith('C')) return 'var(--warning)'
  return 'var(--error)'
}

const IconSun=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
const IconMoon=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z"/></svg>
const IconChevronLeft=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><path d="M15 18l-6-6 6-6"/></svg>
const IconCheck=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={13} height={13}><polyline points="20 6 9 17 4 12"/></svg>
const IconDownload=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>

export default function PrincipalResultsClient({ results, classOptions }: Props) {
  const [isDark, setIsDark] = useState(true)
  const [mounted, setMounted] = useState(false)
  const [termFilter, setTermFilter] = useState('first')
  const [typeFilter, setTypeFilter] = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [approving, setApproving] = useState<Set<string>>(new Set())
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set(results.filter(r=>r.approved).map(r=>r.id)))
  const [toast, setToast] = useState<string|null>(null)

  useEffect(() => {
    const s = localStorage.getItem('schoolos_theme'); const dark = s!=='light'
    setIsDark(dark); document.documentElement.setAttribute('data-theme',dark?'dark':'light'); setMounted(true)
  }, [])
  const toggleTheme = () => { const n=!isDark; setIsDark(n); document.documentElement.setAttribute('data-theme',n?'dark':'light'); localStorage.setItem('schoolos_theme',n?'dark':'light') }

  const filtered = useMemo(() => results.filter(r => {
    if (termFilter && r.term !== termFilter) return false
    if (typeFilter && r.result_type !== typeFilter) return false
    if (classFilter && r.class_id !== classFilter) return false
    return true
  }), [results, termFilter, typeFilter, classFilter])

  function showToast(m: string) { setToast(m); setTimeout(()=>setToast(null),3000) }

  async function approveResult(id: string) {
    setApproving(p=>new Set(p).add(id))
    const supabase = createClient()
    const { error } = await supabase.from('results').update({ approved: true }).eq('id', id)
    setApproving(p=>{ const n=new Set(p); n.delete(id); return n })
    if (!error) { setApprovedIds(p=>new Set(p).add(id)); showToast('Result approved') }
  }

  async function approveAll() {
    const ids = filtered.filter(r=>!approvedIds.has(r.id)).map(r=>r.id)
    if (!ids.length) return
    const supabase = createClient()
    await supabase.from('results').update({ approved: true }).in('id', ids)
    setApprovedIds(p=>new Set([...p,...ids]))
    showToast(`${ids.length} results approved`)
  }

  async function exportPDF() {
    // Client-side CSV export (PDF generation would require a server action / library)
    const headers = ['Student','Number','Subject','Class','Term','Type','Score','Max','Grade','Approved']
    const rows = filtered.map(r => [r.student_name, r.student_number??'', r.subject_name, r.class_name, r.term, TYPE_LABELS[r.result_type]??r.result_type, r.score, r.max_score, r.grade, approvedIds.has(r.id)?'Yes':'No'])
    const csv = [headers, ...rows].map(r=>r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `results-${termFilter}-term.csv`; a.click()
    URL.revokeObjectURL(a.href)
    showToast('Exported as CSV')
  }

  if (!mounted) return null
  const pendingCount = filtered.filter(r=>!approvedIds.has(r.id)).length

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link href="/dashboard/principal" className={styles.backBtn} style={{marginBottom:8,display:'inline-flex'}}><IconChevronLeft /> Dashboard</Link>
          <h1 className={styles.pageTitle}>View & <span>Approve Results</span></h1>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.themeBtn} onClick={toggleTheme}>{isDark?<IconSun />:<IconMoon />}</button>
          <button className={styles.secondaryBtn} style={{display:'flex',alignItems:'center',gap:6}} onClick={exportPDF}><IconDownload /> Export CSV</button>
          {pendingCount > 0 && <button className={styles.primaryBtn} onClick={approveAll}>Approve All ({pendingCount})</button>}
        </div>
      </header>

      <div style={{position:'relative',zIndex:1,padding:'var(--space-6)',maxWidth:1000}}>
        {/* Filters */}
        <div className={styles.filterBar} style={{marginBottom:'var(--space-5)'}}>
          {TERMS.map(t=>(
            <button key={t} className={`${styles.filterBtn} ${termFilter===t?styles.filterBtnActive:''}`} onClick={()=>setTermFilter(t)}>
              {t.charAt(0).toUpperCase()+t.slice(1)} Term
            </button>
          ))}
          <span style={{color:'var(--glass-border)',fontSize:'1.2rem'}}>|</span>
          <button className={`${styles.filterBtn} ${!typeFilter?styles.filterBtnActive:''}`} onClick={()=>setTypeFilter('')}>All Types</button>
          {TYPES.map(t=><button key={t} className={`${styles.filterBtn} ${typeFilter===t?styles.filterBtnActive:''}`} onClick={()=>setTypeFilter(typeFilter===t?'':t)}>{TYPE_LABELS[t]}</button>)}
          <span style={{color:'var(--glass-border)',fontSize:'1.2rem'}}>|</span>
          <select className={styles.searchInput} style={{minWidth:140,padding:'8px 12px'}} value={classFilter} onChange={e=>setClassFilter(e.target.value)}>
            <option value="">All Classes</option>
            {classOptions.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <span style={{fontSize:'.78rem',color:'var(--text-muted)',marginLeft:'auto'}}>{filtered.length} results · {pendingCount} pending</span>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr className={styles.tableHead}>
              <th>Student</th><th>Subject</th><th>Class</th><th>Type</th><th>Score</th><th>Grade</th><th>Teacher</th><th>Approved</th>
            </tr></thead>
            <tbody>
              {filtered.length===0
                ? <tr><td colSpan={8}><div className={styles.emptyState}>No results match these filters.</div></td></tr>
                : filtered.map(r=>{
                  const isApproved = approvedIds.has(r.id)
                  const isApproving = approving.has(r.id)
                  return (
                    <tr key={r.id} className={styles.tableRow}>
                      <td><div className={styles.userCell}><div className={styles.avatar}>{r.student_name.slice(0,2).toUpperCase()}</div><div><p className={styles.nameCell}>{r.student_name}</p><p className={styles.metaCell}>{r.student_number??'—'}</p></div></div></td>
                      <td><span style={{fontSize:'.84rem',color:'var(--text-secondary)',fontWeight:500}}>{r.subject_name}</span></td>
                      <td><span style={{fontSize:'.80rem',color:'var(--text-muted)'}}>{r.class_name}</span></td>
                      <td><span className={`${styles.badge} ${styles.badgeMuted}`}>{TYPE_LABELS[r.result_type]??r.result_type}</span></td>
                      <td><span style={{fontFamily:'var(--font-display)',fontSize:'1rem',fontWeight:700,color:'var(--text-primary)'}}>{r.score}<span style={{fontSize:'.72rem',color:'var(--text-muted)',fontWeight:400}}>/{r.max_score}</span></span></td>
                      <td><span style={{fontFamily:'var(--font-display)',fontSize:'.95rem',fontWeight:800,color:gradeColor(r.grade)}}>{r.grade}</span></td>
                      <td><span style={{fontSize:'.75rem',color:'var(--text-muted)'}}>{r.teacher_name??'—'}</span></td>
                      <td>
                        {isApproved
                          ? <span className={`${styles.badge} ${styles.badgeSuccess}`}><IconCheck /> Approved</span>
                          : <button className={styles.submitBtn} style={{padding:'4px 12px',fontSize:'.72rem'}} disabled={isApproving} onClick={()=>approveResult(r.id)}>{isApproving?'…':'Approve'}</button>
                        }
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      </div>
      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  )
}
