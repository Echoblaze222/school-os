'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { unwrapEmbed } from '@/lib/utils/unwrapEmbed'
import {
  ZapIcon, SunIcon, MoonIcon, ClipboardIcon, CheckCircleIcon,
  AlertCircleIcon, WalletIcon, SearchIcon, CreditCardIcon,
  ReceiptIcon, ClockIcon, AlertIcon, CheckIcon,
} from '@/components/Icons'
import styles from './invoices.module.css'

const TERMS = ['First Term', 'Second Term', 'Third Term']
const CUR_YEAR = new Date().getMonth() >= 8
  ? `${new Date().getFullYear()}/${new Date().getFullYear() + 1}`
  : `${new Date().getFullYear() - 1}/${new Date().getFullYear()}`

const STATUS_COLORS: Record<string, string> = {
  completed: 'badge-success',
  partial:   'badge-warning',
  pending:   'badge-info',
  overdue:   'badge-error',
}
function StatusIcon({ status }: { status: string }) {
  if (status === 'completed') return <CheckCircleIcon size={13} color="currentColor" />
  if (status === 'partial')   return <ClockIcon       size={13} color="currentColor" />
  if (status === 'overdue')   return <AlertCircleIcon size={13} color="currentColor" />
  return <ClockIcon size={13} color="currentColor" />
}

const OVERLAY: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 200,
  background: 'var(--bg-overlay)', backdropFilter: 'blur(4px)',
  display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
  padding: '0 0 0 0',
}
const SHEET: React.CSSProperties = {
  width: '100%', maxWidth: 520,
  background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
  borderRadius: '18px 18px 0 0', padding: '20px 20px 36px',
  maxHeight: '88vh', overflowY: 'auto',
}

export default function InvoicesClient({ invoices: initialInvoices, schoolId }: any) {
  const router = useRouter()
  const supabase = createClient()
  const [invoices,      setInvoices]      = useState<any[]>(initialInvoices)
  const [statusFilter,  setStatusFilter]  = useState('all')
  const [termFilter,    setTermFilter]    = useState('all')
  const [search,        setSearch]        = useState('')
  const [theme,         setTheme]         = useState<'dark' | 'light'>('dark')

  // Preview / edit modal
  const [previewInv,    setPreviewInv]    = useState<any | null>(null)
  const [editDueDate,   setEditDueDate]   = useState('')
  const [editStatus,    setEditStatus]    = useState('')
  const [saving,        setSaving]        = useState(false)
  const [saveMsg,       setSaveMsg]       = useState('')

  function openPreview(inv: any) {
    setPreviewInv(inv)
    setEditDueDate(inv.due_date ? inv.due_date.slice(0, 10) : '')
    setEditStatus(inv.status ?? 'pending')
    setSaveMsg('')
  }
  function closePreview() { setPreviewInv(null); setSaveMsg('') }

  async function saveInvoiceEdit() {
    if (!previewInv) return
    setSaving(true); setSaveMsg('')
    const updates: any = { updated_at: new Date().toISOString() }
    if (editDueDate) updates.due_date = editDueDate
    if (editStatus)  updates.status   = editStatus

    const { error } = await supabase
      .from('payment_invoices')
      .update(updates)
      .eq('id', previewInv.id)

    if (error) {
      setSaveMsg('Error: ' + error.message)
    } else {
      // Patch local state
      setInvoices(prev => prev.map(i =>
        i.id === previewInv.id ? { ...i, ...updates } : i
      ))
      setPreviewInv((p: any) => ({ ...p, ...updates }))
      setSaveMsg('Saved')
      setTimeout(() => setSaveMsg(''), 2500)
    }
    setSaving(false)
  }

  // Generate invoices state
  const [genTerm,       setGenTerm]       = useState('First Term')
  const [genYear,       setGenYear]       = useState(CUR_YEAR)
  const [generating,    setGenerating]    = useState(false)
  const [genResult,     setGenResult]     = useState<{ ok: boolean; msg: string } | null>(null)
  const [showGenPanel,  setShowGenPanel]  = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('schoolos_theme') as any
    if (saved) {
      setTheme(saved)
      document.documentElement.setAttribute('data-theme', saved === 'light' ? 'light' : '')
    }
  }, [])

  const filtered = useMemo(() => {
    return invoices.filter((inv: any) => {
      const student = unwrapEmbed(inv.profiles) as any
      const fs       = unwrapEmbed(inv.fee_structures) as any
      const name    = student?.full_name?.toLowerCase() ?? ''
      const admNo   = student?.permanent_student_id?.toLowerCase() ?? ''
      const invTerm = fs?.term ?? ''

      const matchSearch = !search ||
        name.includes(search.toLowerCase()) ||
        admNo.includes(search.toLowerCase())
      const matchStatus = statusFilter === 'all' || inv.status === statusFilter
      const matchTerm   = termFilter === 'all' || invTerm === termFilter

      return matchSearch && matchStatus && matchTerm
    })
  }, [invoices, search, statusFilter, termFilter])

  const stats = useMemo(() => ({
    totalDue:     filtered.reduce((s: number, i: any) => s + (i.amount_due_ngn || 0), 0),
    totalPaid:    filtered.reduce((s: number, i: any) => s + (i.amount_paid_ngn || 0), 0),
    totalBalance: filtered.reduce((s: number, i: any) => s + (i.balance_ngn || 0), 0),
    overdue:      filtered.filter((i: any) => i.status === 'overdue').length,
  }), [filtered])

  function fmt(n: number) { return `₦${(n || 0).toLocaleString()}` }
  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  async function generateInvoices() {
    setGenerating(true)
    setGenResult(null)
    try {
      const res = await fetch('/api/bursar/generate-invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ term: genTerm, academic_year: genYear }),
      })
      const data = await res.json()
      if (!res.ok) {
        setGenResult({ ok: false, msg: data.error || 'Failed to generate invoices.' })
      } else {
        setGenResult({ ok: true, msg: data.message })
        // Refresh page to reload invoices from server
        setTimeout(() => router.refresh(), 1500)
      }
    } catch {
      setGenResult({ ok: false, msg: 'Network error. Please try again.' })
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className={styles.page}>

      {/* ── Invoice Preview / Edit Modal ── */}
      {previewInv && (() => {
        const student = unwrapEmbed(previewInv.profiles) as any
        const fee     = unwrapEmbed(previewInv.fee_structures) as any
        const inp: React.CSSProperties = {
          height: 38, padding: '0 12px', background: 'var(--input-bg)',
          border: '1px solid var(--input-border)', borderRadius: 8,
          color: 'var(--text-primary)', fontSize: '0.82rem', outline: 'none', width: '100%',
          boxSizing: 'border-box',
        }
        return (
          <div style={OVERLAY} onClick={closePreview}>
            <div style={SHEET} onClick={e => e.stopPropagation()}>
              {/* Handle */}
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--glass-border)', margin: '0 auto 18px' }} />

              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div>
                  <p style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                    {student?.full_name ?? 'Unknown'}
                  </p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                    {student?.class_level ?? '—'} · {student?.permanent_student_id ?? student?.admission_number ?? '—'}
                  </p>
                </div>
                <span className={`badge ${STATUS_COLORS[previewInv.status] ?? 'badge-info'}`}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <StatusIcon status={previewInv.status} /> {previewInv.status}
                </span>
              </div>

              {/* Fee info */}
              <div style={{ background: 'var(--input-bg)', border: '1px solid var(--glass-border)', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
                <p style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 2px' }}>
                  {fee?.description ?? 'School Fees'}
                </p>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: 0 }}>
                  {fee?.term ? fee.term.charAt(0).toUpperCase() + fee.term.slice(1) + ' Term' : '—'}
                  {fee?.academic_year ? ` · ${fee.academic_year}` : ''}
                </p>
              </div>

              {/* Amounts */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
                {[
                  { label: 'Due',     val: fmt(previewInv.amount_due_ngn),  color: 'var(--text-primary)' },
                  { label: 'Paid',    val: fmt(previewInv.amount_paid_ngn), color: 'var(--success)' },
                  { label: 'Balance', val: fmt(previewInv.balance_ngn),     color: previewInv.balance_ngn > 0 ? 'var(--error)' : 'var(--success)' },
                ].map(({ label, val, color }) => (
                  <div key={label} style={{ background: 'var(--input-bg)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '10px 8px', textAlign: 'center' }}>
                    <p style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', margin: '0 0 4px' }}>{label.toUpperCase()}</p>
                    <p style={{ fontSize: '0.9rem', fontWeight: 800, color, margin: 0 }}>{val}</p>
                  </div>
                ))}
              </div>

              {/* ── Edit Fields ── */}
              <p style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', margin: '0 0 10px' }}>EDIT INVOICE</p>

              <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>DUE DATE</label>
                  <input type="date" value={editDueDate} onChange={e => setEditDueDate(e.target.value)} style={inp} />
                </div>
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>STATUS</label>
                  <select value={editStatus} onChange={e => setEditStatus(e.target.value)} style={inp}>
                    <option value="pending">Pending</option>
                    <option value="partial">Partial</option>
                    <option value="overdue">Overdue</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              </div>

              {saveMsg && (
                <p style={{ fontSize: '0.8rem', fontWeight: 700, color: saveMsg.startsWith('Error') ? 'var(--danger)' : 'var(--success)', margin: '0 0 10px' }}>
                  {saveMsg}
                </p>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={saveInvoiceEdit} disabled={saving}
                  style={{ flex: 1, height: 42, background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
                {previewInv.balance_ngn > 0 && (
                  <a href={`/dashboard/bursar/record-payment?invoice=${previewInv.id}&student=${student?.full_name ?? ''}`}
                    style={{ flex: 1, height: 42, background: 'var(--input-bg)', color: 'var(--text-primary)', border: '1px solid var(--input-border)', borderRadius: 10, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, textDecoration: 'none' }}>
                    <CreditCardIcon size={15} color="var(--text-primary)" /> Record Payment
                  </a>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.push('/dashboard/bursar')}>←</button>
        <h1 className={styles.headerTitle}>Invoices</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className={styles.iconBtn}
            onClick={() => { setShowGenPanel(p => !p); setGenResult(null) }}
            title="Generate invoices from fee structures">
            <ZapIcon size={18} color="var(--text-primary)" />
          </button>
          <button className={styles.iconBtn} onClick={() => {
            const next = theme === 'dark' ? 'light' : 'dark'
            setTheme(next)
            localStorage.setItem('schoolos_theme', next)
            document.documentElement.setAttribute('data-theme', next === 'light' ? 'light' : '')
          }}>
            {theme === 'dark'
              ? <SunIcon size={18} color="var(--text-primary)" />
              : <MoonIcon size={18} color="var(--text-primary)" />}
          </button>
        </div>
      </header>

      {/* ── Generate Invoices Panel ── */}
      {showGenPanel && (
        <div style={{
          background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
          borderRadius: 12, padding: '16px', marginBottom: 16,
        }}>
          <p style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <ZapIcon size={14} color="var(--brand)" /> Generate Invoices from Fee Structures
          </p>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0 0 12px', lineHeight: 1.5 }}>
            This creates invoices for all active students based on the fee structures you've set up.
            Safe to run multiple times — existing invoices are not duplicated.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <input
              value={genYear}
              onChange={e => setGenYear(e.target.value)}
              placeholder="2025/2026"
              style={{
                height: 40, padding: '0 12px', background: 'var(--input-bg)',
                border: '1px solid var(--input-border)', borderRadius: 8,
                color: 'var(--text-primary)', fontSize: '0.82rem', outline: 'none',
              }}
            />
            <select
              value={genTerm}
              onChange={e => setGenTerm(e.target.value)}
              style={{
                height: 40, padding: '0 12px', background: 'var(--input-bg)',
                border: '1px solid var(--input-border)', borderRadius: 8,
                color: 'var(--text-primary)', fontSize: '0.82rem', outline: 'none',
              }}>
              {TERMS.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>

          {genResult && (
            <div style={{
              padding: '10px 14px', marginBottom: 12,
              background: genResult.ok ? 'var(--success-subtle)' : 'var(--danger-subtle)',
              border: `1px solid ${genResult.ok ? 'var(--success)' : 'var(--danger)'}`,
              borderRadius: 8, fontSize: '0.8rem', fontWeight: 600,
              color: genResult.ok ? 'var(--success)' : 'var(--danger)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {genResult.ok
                ? <CheckIcon size={14} color="var(--success)" />
                : <AlertIcon size={14} color="var(--danger)" />}
              {genResult.msg}
            </div>
          )}

          <button
            onClick={generateInvoices}
            disabled={generating}
            style={{
              width: '100%', height: 40, background: 'var(--brand)',
              color: '#fff', border: 'none', borderRadius: 8,
              fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
              opacity: generating ? 0.6 : 1,
            }}>
            {generating ? 'Generating…' : `Generate Invoices — ${genTerm} ${genYear}`}
          </button>
        </div>
      )}

      {/* Stats */}
      <div className={styles.statsRow}>
        <div className={`glass-card ${styles.statCard}`}>
          <span className={styles.statEmoji}><ClipboardIcon size={22} color="var(--brand)" /></span>
          <p className={styles.statValue}>{fmt(stats.totalDue)}</p>
          <p className={styles.statLabel}>Total Due</p>
        </div>
        <div className={`glass-card ${styles.statCard}`}>
          <span className={styles.statEmoji}><CheckCircleIcon size={22} color="var(--success)" /></span>
          <p className={styles.statValue}>{fmt(stats.totalPaid)}</p>
          <p className={styles.statLabel}>Collected</p>
        </div>
        <div className={`glass-card ${styles.statCard}`}>
          <span className={styles.statEmoji}><AlertCircleIcon size={22} color="var(--warning)" /></span>
          <p className={styles.statValue}>{stats.overdue}</p>
          <p className={styles.statLabel}>Overdue</p>
        </div>
      </div>

      {/* Balance card */}
      <div className={`glass-card ${styles.balanceCard}`}>
        <p className={styles.balanceLabel} style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
          <WalletIcon size={14} color="var(--text-muted)" /> Outstanding Balance
        </p>
        <p className={styles.balanceAmount}>{fmt(stats.totalBalance)}</p>
      </div>

      {/* Filters */}
      <div className={styles.filters}>
        <div className={styles.searchBar}>
          <SearchIcon size={15} color="var(--text-muted)" />
          <input
            type="text"
            placeholder="Search student name or ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className={styles.searchInput}
          />
        </div>
        <div className={styles.filterRow}>
          <select className={styles.filterSelect} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="all">All Status</option>
            <option value="completed">Paid</option>
            <option value="partial">Partial</option>
            <option value="pending">Pending</option>
            <option value="overdue">Overdue</option>
          </select>
          <select className={styles.filterSelect} value={termFilter} onChange={e => setTermFilter(e.target.value)}>
            <option value="all">All Terms</option>
            <option value="first">First Term</option>
            <option value="second">Second Term</option>
            <option value="third">Third Term</option>
          </select>
        </div>
      </div>

      {/* Invoice list */}
      <div className={styles.invoiceList}>
        {filtered.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyEmoji}><ReceiptIcon size={40} color="var(--text-faint)" strokeWidth={1} /></p>
            <p className={styles.emptyTitle}>No invoices found</p>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 6, textAlign: 'center', lineHeight: 1.5 }}>
              Tap the Generate button above to create invoices from your fee structures,{'\n'}
              or create fee structures first under Fee Records.
            </p>
          </div>
        ) : (
          filtered.map((inv: any) => {
            const student = unwrapEmbed(inv.profiles) as any
            const fee     = unwrapEmbed(inv.fee_structures) as any

            return (
              <div key={inv.id} className={`glass-card ${styles.invoiceCard}`}
                onClick={() => openPreview(inv)}
                style={{ cursor: 'pointer' }}>
                <div className={styles.invoiceTop}>
                  <div>
                    <p className={styles.studentName}>{student?.full_name ?? 'Unknown'}</p>
                    <p className={styles.studentMeta}>
                      {student?.permanent_student_id ?? student?.admission_number ?? '—'}
                      {student?.class_level ? ` · ${student.class_level}` : ''}
                    </p>
                  </div>
                  <span className={`badge ${STATUS_COLORS[inv.status] ?? 'badge-info'}`}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <StatusIcon status={inv.status} /> {inv.status}
                  </span>
                </div>

                <p className={styles.feeDesc}>{fee?.description ?? 'School Fees'}</p>
                <p className={styles.feeTerm}>
                  {fee?.term
                    ? fee.term.charAt(0).toUpperCase() + fee.term.slice(1) + ' Term'
                    : ''}
                  {fee?.academic_year ? ` · ${fee.academic_year}` : ''}
                </p>

                <div className={styles.invoiceAmounts}>
                  <div className={styles.amountCol}>
                    <p className={styles.amountLabel}>Due</p>
                    <p className={styles.amountVal}>{fmt(inv.amount_due_ngn)}</p>
                  </div>
                  <div className={styles.amountCol}>
                    <p className={styles.amountLabel}>Paid</p>
                    <p className={`${styles.amountVal} ${styles.paidAmt}`}>{fmt(inv.amount_paid_ngn)}</p>
                  </div>
                  <div className={styles.amountCol}>
                    <p className={styles.amountLabel}>Balance</p>
                    <p className={`${styles.amountVal} ${inv.balance_ngn > 0 ? styles.balanceAmt : styles.paidAmt}`}>
                      {fmt(inv.balance_ngn)}
                    </p>
                  </div>
                </div>

                {inv.due_date && (
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '6px 0 0' }}>
                    Due: {fmtDate(inv.due_date)}
                  </p>
                )}
              </div>
            )
          })
        )}
      </div>

      <div style={{ height: '100px' }} />
    </div>
  )
}
