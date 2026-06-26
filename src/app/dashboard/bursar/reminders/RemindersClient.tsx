'use client'
// src/app/dashboard/bursar/reminders/RemindersClient.tsx
// Fixed:
//   1. Debtors loaded from payment_invoices (correct table) not school_fees
//   2. Each reminder written individually to fee_reminders table (not announcements)
//   3. Bursar can compose custom message per-send with smart default
//   4. History reads from fee_reminders with proper student name display

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { BellIcon, PeopleIcon } from '@/components/Icons'
import { unwrapEmbed } from '@/lib/utils/unwrapEmbed'
import styles from '@/app/dashboard/student/records/page.module.css'

type Tab = 'send' | 'history'
interface Props { profile: any; school: any; userId: string }

const TERMS    = ['First Term', 'Second Term', 'Third Term']
const CUR_YEAR = new Date().getMonth() >= 8
  ? `${new Date().getFullYear()}/${new Date().getFullYear() + 1}`
  : `${new Date().getFullYear() - 1}/${new Date().getFullYear()}`

function currentTerm() {
  const m = new Date().getMonth()
  if (m >= 8) return 'First Term'
  if (m <= 2) return 'Second Term'
  return 'Third Term'
}

const TERM_KEY_MAP: Record<string, string> = {
  'First Term': 'first', 'Second Term': 'second', 'Third Term': 'third',
}

/** Build a personalised reminder message for one student */
function buildMessage(studentName: string, className: string, outstanding: number, term: string, year: string, schoolName: string) {
  const fmtd = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 }).format(outstanding)
  return `Dear Parent/Guardian of ${studentName},

This is a friendly reminder from ${schoolName || 'the school'} that the outstanding school fee balance of ${fmtd} for ${className} — ${term} ${year} — has not been settled.

Kindly visit the school's bursar office or make payment via your preferred channel at your earliest convenience.

If you have already made payment, please disregard this message and present your receipt to the bursar for confirmation.

Thank you for your cooperation.

${schoolName || 'School Management'}`
}

export default function RemindersClient({ profile, school, userId }: Props) {
  const [tab,        setTab]        = useState<Tab>('send')
  const [debtors,    setDebtors]    = useState<any[]>([])
  const [selected,   setSelected]   = useState<Set<string>>(new Set())
  const [history,    setHistory]    = useState<any[]>([])
  const [loading,    setLoading]    = useState(true)
  const [sending,    setSending]    = useState(false)
  const [sentCount,  setSentCount]  = useState(0)
  const [sentDone,   setSentDone]   = useState(false)
  const [term,       setTerm]       = useState(currentTerm())
  const [year,       setYear]       = useState(CUR_YEAR)
  const [customMsg,  setCustomMsg]  = useState('')
  const [useCustom,  setUseCustom]  = useState(false)
  const [preview,    setPreview]    = useState('')
  const [error,      setError]      = useState('')

  const [previewMsg,    setPreviewMsg]    = useState<any | null>(null)

  const OVERLAY: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 200,
    background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
  }
  const SHEET: React.CSSProperties = {
    width: '100%', maxWidth: 520,
    background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
    borderRadius: '18px 18px 0 0', padding: '20px 20px 36px',
    maxHeight: '85vh', overflowY: 'auto',
  }

  const supabase = createClient()
  const sc       = school?.primary_color ?? '#7C3AED'
  const schoolName = school?.name ?? 'the school'

  useEffect(() => {
    if (tab === 'send') loadDebtors()
    else loadHistory()
  }, [tab, term, year])

  // Update preview when selection or message changes
  useEffect(() => {
    if (selected.size === 0) { setPreview(''); return }
    const first = debtors.find(d => selected.has(d.id))
    if (!first) return
    const msg = useCustom && customMsg.trim()
      ? customMsg
      : buildMessage(first.full_name, first.class_level ?? '—', first.outstanding, term, year, schoolName)
    setPreview(msg)
  }, [selected, useCustom, customMsg, debtors, term, year])

  async function loadDebtors() {
    setLoading(true)
    setError('')
    const termKey = TERM_KEY_MAP[term] ?? 'first'

    // Query payment_invoices directly - this is the correct source of truth
    const { data, error: err } = await supabase
      .from('payment_invoices')
      .select(`
        id,
        student_id,
        balance_ngn,
        status,
        fee_structures ( description, term, academic_year ),
        profiles!student_id ( id, full_name, class_level, default_code )
      `)
      .eq('school_id', school?.id)
      .eq('fee_structures.term', termKey)
      .eq('fee_structures.academic_year', year)
      .in('status', ['pending', 'partial', 'overdue'])
      .gt('balance_ngn', 0)

    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }

    // Aggregate outstanding per student (one student may have multiple invoices)
    // Also re-verify term/year client-side — the .eq('fee_structures.term', ...)
    // filter above targets a nested embed that PostgREST doesn't always honor reliably.
    const studentMap = new Map<string, any>()
    for (const inv of (data ?? [])) {
      const fs = unwrapEmbed((inv as any).fee_structures)
      if (!fs || fs.term !== termKey || fs.academic_year !== year) continue

      const student = unwrapEmbed((inv as any).profiles)
      if (!student) continue
      const sid = student.id
      if (!studentMap.has(sid)) {
        studentMap.set(sid, {
          id:          sid,
          full_name:   student.full_name,
          class_level: student.class_level ?? '—',
          default_code: student.default_code ?? '',
          parent:      null,  // resolved via parent_student_links in sendReminders
          outstanding: 0,
          invoiceIds:  [],
        })
      }
      const entry = studentMap.get(sid)
      entry.outstanding  += inv.balance_ngn ?? 0
      entry.invoiceIds.push(inv.id)
    }

    const result = Array.from(studentMap.values())
      .sort((a, b) => b.outstanding - a.outstanding)

    setDebtors(result)
    setSelected(new Set())
    setLoading(false)
  }

  async function loadHistory() {
    setLoading(true)
    const { data } = await supabase
      .from('fee_reminders')
      .select(`
        id, channel, status, message_body, sent_at, created_at,
        payment_invoices (
          student_id,
          profiles!student_id ( full_name, class_level )
        )
      `)
      .eq('triggered_by', userId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (data) setHistory(data)
    setLoading(false)
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected(selected.size === debtors.length
      ? new Set()
      : new Set(debtors.map(d => d.id))
    )
  }

  async function sendReminders() {
    if (selected.size === 0) return
    setSending(true)
    setSentCount(0)
    setError('')

    const selectedDebtors = debtors.filter(d => selected.has(d.id))
    let count = 0

    for (const debtor of selectedDebtors) {
      // Build personalised message for this specific student
      const msgBody = useCustom && customMsg.trim()
        ? customMsg
            .replace('{student}', debtor.full_name)
            .replace('{class}', debtor.class_level)
            .replace('{amount}', new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 }).format(debtor.outstanding))
            .replace('{term}', term)
            .replace('{year}', year)
        : buildMessage(debtor.full_name, debtor.class_level, debtor.outstanding, term, year, schoolName)

      // FIX: look up parent via parent_student_links (profiles has no parent_id column)
      const { data: linkRow } = await supabase
        .from('parent_student_links')
        .select('parent_id')
        .eq('student_id', debtor.id)
        .maybeSingle()

      const parentId = linkRow?.parent_id ?? null

      // Insert one fee_reminder record per invoice for this student
      for (const invoiceId of debtor.invoiceIds) {
        const { error: remErr } = await supabase
          .from('fee_reminders')
          .insert({
            invoice_id:   invoiceId,
            parent_id:    parentId,   // null if no parent linked — parent won't see it but won't crash
            channel:      'in_app',
            status:       'sent',
            message_body: msgBody,
            sent_at:      new Date().toISOString(),
            triggered_by: userId,
          })

        if (remErr) {
          console.error('Reminder insert error:', remErr.message)
          continue
        }

        // FIX: also push a notification so it shows on parent dashboard instantly
        if (parentId) {
          try {
            await supabase.from('notifications').insert({
              user_id:   parentId,
              school_id: school?.id,
              title:     'Fee Reminder',
              body:      `Outstanding balance reminder for ${debtor.full_name} — ${term} ${year}`,
              type:      'fee_reminder',
            })
          } catch (_) {} // non-critical
        }
      }

      count++
      setSentCount(count)
    }

    setSending(false)
    setSentDone(true)
    setSelected(new Set())
    setCustomMsg('')
    setUseCustom(false)
    setTimeout(() => { setSentDone(false); setSentCount(0) }, 5000)
    // Refresh history
    loadHistory()
  }

  function fmtAmt(n: number) {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency', currency: 'NGN', minimumFractionDigits: 0,
    }).format(n)
  }
  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  const inp: React.CSSProperties = {
    height: 40, padding: '0 12px', background: 'var(--input-bg)',
    border: '1px solid var(--input-border)', borderRadius: 8,
    color: 'var(--text-primary)', fontSize: '0.82rem', outline: 'none',
  }

  return (
    <RolePageWrapper userId={userId} role="bursar" profile={profile} school={school} title="Fee Reminders">

      {/* ── Message Preview Modal ── */}
      {previewMsg && (() => {
        const inv     = unwrapEmbed(previewMsg.payment_invoices)
        const student = unwrapEmbed(inv?.profiles)
        return (
          <div style={OVERLAY} onClick={() => setPreviewMsg(null)}>
            <div style={SHEET} onClick={e => e.stopPropagation()}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--glass-border)', margin: '0 auto 18px' }} />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                <div>
                  <p style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                    {student?.full_name ?? 'Unknown Student'}
                  </p>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '3px 0 0' }}>
                    {student?.class_level ?? '—'} · {fmtDate(previewMsg.sent_at ?? previewMsg.created_at)}
                  </p>
                </div>
                <span style={{
                  padding: '3px 10px', borderRadius: 20, fontSize: '0.68rem', fontWeight: 700,
                  background: previewMsg.status === 'sent' ? '#10B98120' : '#F59E0B20',
                  color:      previewMsg.status === 'sent' ? '#10B981'   : '#F59E0B',
                }}>
                  {previewMsg.status}
                </span>
              </div>

              <p style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', margin: '0 0 8px' }}>
                MESSAGE BODY
              </p>
              <div style={{
                background: 'var(--input-bg)', border: '1px solid var(--glass-border)',
                borderRadius: 10, padding: '14px', fontSize: '0.82rem',
                color: 'var(--text-primary)', lineHeight: 1.7, whiteSpace: 'pre-wrap',
              }}>
                {previewMsg.message_body ?? '(No message body recorded)'}
              </div>

              <button
                onClick={() => setPreviewMsg(null)}
                style={{ width: '100%', height: 42, marginTop: 16, background: 'var(--input-bg)', color: 'var(--text-primary)', border: '1px solid var(--input-border)', borderRadius: 10, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
                Close
              </button>
            </div>
          </div>
        )
      })()}

      {/* Tab switcher */}
      <div className={styles.tabs} style={{ marginBottom: 'var(--space-4)' }}>
        {(['send', 'history'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`}
            style={tab === t ? { background: sc, color: '#fff', borderColor: sc } : {}}>
            {t === 'send' ? '📢 Send Reminders' : '📋 Sent History'}
          </button>
        ))}
      </div>

      {/* ── SEND REMINDERS TAB ──────────────────────────── */}
      {tab === 'send' && (
        <>
          {/* Year + Term selector */}
          <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-4)', alignItems: 'center' }}>
            <input
              value={year} onChange={e => setYear(e.target.value)}
              placeholder="2025/2026"
              style={{ ...inp, width: 110, flexShrink: 0 }}
            />
            <div className={styles.tabs} style={{ flex: 1 }}>
              {TERMS.map(t => (
                <button key={t} onClick={() => setTerm(t)}
                  className={`${styles.tab} ${term === t ? styles.tabActive : ''}`}
                  style={term === t ? { background: sc, color: '#fff', borderColor: sc } : {}}>
                  {t.replace(' Term', '')}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div style={{
              padding: '10px 14px', background: '#EF444415', border: '1px solid #EF444440',
              borderRadius: 8, marginBottom: 'var(--space-4)',
              fontSize: '0.8rem', color: '#EF4444', fontWeight: 600,
            }}>
              ⚠️ {error}
            </div>
          )}

          {sentDone && (
            <div style={{
              padding: 'var(--space-4)', background: '#10B98115',
              border: '1px solid #10B98140', borderRadius: 10,
              marginBottom: 'var(--space-4)', fontSize: '0.85rem',
              fontWeight: 700, color: '#10B981',
            }}>
              ✓ {sentCount} reminder{sentCount !== 1 ? 's' : ''} sent successfully and saved to records
            </div>
          )}

          {/* Composer — shown when students selected */}
          {selected.size > 0 && (
            <div style={{
              background: 'var(--glass-bg)', border: `1px solid ${sc}40`,
              borderRadius: 'var(--radius-xl)', padding: 'var(--space-4)',
              marginBottom: 'var(--space-4)',
            }}>
              <p style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 var(--space-3)' }}>
                📝 Compose Reminder — {selected.size} student{selected.size !== 1 ? 's' : ''}
              </p>

              {/* Toggle custom vs default */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 'var(--space-3)' }}>
                <button
                  onClick={() => setUseCustom(false)}
                  style={{
                    padding: '6px 12px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 700,
                    border: `1px solid ${!useCustom ? sc : 'var(--input-border)'}`,
                    background: !useCustom ? sc + '20' : 'var(--input-bg)',
                    color: !useCustom ? sc : 'var(--text-muted)', cursor: 'pointer',
                  }}>
                  ✨ Auto (personalised)
                </button>
                <button
                  onClick={() => setUseCustom(true)}
                  style={{
                    padding: '6px 12px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 700,
                    border: `1px solid ${useCustom ? sc : 'var(--input-border)'}`,
                    background: useCustom ? sc + '20' : 'var(--input-bg)',
                    color: useCustom ? sc : 'var(--text-muted)', cursor: 'pointer',
                  }}>
                  ✏️ Write custom
                </button>
              </div>

              {useCustom ? (
                <>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '0 0 8px', lineHeight: 1.5 }}>
                    You can use placeholders: <code style={{ background: 'var(--input-bg)', padding: '1px 4px', borderRadius: 4 }}>{'{student}'}</code>{' '}
                    <code style={{ background: 'var(--input-bg)', padding: '1px 4px', borderRadius: 4 }}>{'{class}'}</code>{' '}
                    <code style={{ background: 'var(--input-bg)', padding: '1px 4px', borderRadius: 4 }}>{'{amount}'}</code>{' '}
                    <code style={{ background: 'var(--input-bg)', padding: '1px 4px', borderRadius: 4 }}>{'{term}'}</code>
                  </p>
                  <textarea
                    rows={6}
                    value={customMsg}
                    onChange={e => setCustomMsg(e.target.value)}
                    placeholder={`Dear Parent of {student},\n\nYour ward in {class} has an outstanding balance of {amount} for {term}...\n\nPlease make payment at your earliest convenience.\n\nThank you.`}
                    style={{
                      width: '100%', padding: '10px 12px', background: 'var(--input-bg)',
                      border: '1px solid var(--input-border)', borderRadius: 8,
                      color: 'var(--text-primary)', fontSize: '0.82rem',
                      outline: 'none', resize: 'vertical', boxSizing: 'border-box',
                      lineHeight: 1.6,
                    }}
                  />
                </>
              ) : (
                /* Preview of auto-generated message */
                preview && (
                  <div style={{
                    padding: '12px 14px', background: 'var(--input-bg)',
                    border: '1px solid var(--input-border)', borderRadius: 8,
                    fontSize: '0.78rem', color: 'var(--text-primary)',
                    lineHeight: 1.7, whiteSpace: 'pre-wrap',
                    maxHeight: 200, overflowY: 'auto',
                  }}>
                    <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.06em', margin: '0 0 8px' }}>
                      PREVIEW (first student):
                    </p>
                    {preview}
                  </div>
                )
              )}

              <button
                onClick={sendReminders}
                disabled={sending || (useCustom && !customMsg.trim())}
                style={{
                  width: '100%', marginTop: 'var(--space-3)', height: 44,
                  background: sc, color: '#fff', border: 'none', borderRadius: 8,
                  fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer',
                  opacity: (sending || (useCustom && !customMsg.trim())) ? 0.6 : 1,
                }}>
                {sending
                  ? `Sending… (${sentCount}/${selected.size})`
                  : `📤 Send to ${selected.size} Parent${selected.size !== 1 ? 's' : ''}`}
              </button>
            </div>
          )}

          {/* Debtors list */}
          {loading
            ? <div className={styles.loading}><span /><span /><span /></div>
            : debtors.length === 0
              ? (
                <div className={styles.empty}>
                  <BellIcon size={40} color="var(--text-faint)" strokeWidth={1} />
                  <p>No outstanding invoices for {term} {year}</p>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    All students are fully paid up for this term.
                  </p>
                </div>
              )
              : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                    <p style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', margin: 0 }}>
                      {debtors.length} DEBTOR{debtors.length !== 1 ? 'S' : ''}
                      {selected.size > 0 && ` · ${selected.size} selected`}
                    </p>
                    <button
                      onClick={toggleAll}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: sc, fontWeight: 700, padding: 0 }}>
                      {selected.size === debtors.length ? 'Deselect all' : 'Select all'}
                    </button>
                  </div>

                  <div className={styles.list}>
                    {debtors.map((d: any) => (
                      <div
                        key={d.id}
                        className={styles.card}
                        onClick={() => toggleSelect(d.id)}
                        style={{ cursor: 'pointer', border: selected.has(d.id) ? `1px solid ${sc}50` : undefined }}>
                        {/* Checkbox */}
                        <div style={{
                          width: 20, height: 20, borderRadius: 4, flexShrink: 0,
                          border: `2px solid ${selected.has(d.id) ? sc : 'var(--input-border)'}`,
                          background: selected.has(d.id) ? sc : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all 0.15s',
                        }}>
                          {selected.has(d.id) && <span style={{ color: '#fff', fontSize: '0.65rem', fontWeight: 900 }}>✓</span>}
                        </div>
                        <div className={styles.cardIcon} style={{ background: '#EF444420' }}>
                          <PeopleIcon size={16} color="#EF4444" />
                        </div>
                        <div className={styles.cardBody}>
                          <p className={styles.cardTitle}>{d.full_name}</p>
                          <p className={styles.cardMeta}>
                            {d.class_level}
                            {d.parent ? ` · Parent: ${d.parent.full_name}` : ' · No parent linked'}
                          </p>
                        </div>
                        <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#EF4444', flexShrink: 0 }}>
                          {fmtAmt(d.outstanding)}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )
          }
        </>
      )}

      {/* ── SENT HISTORY TAB ────────────────────────────── */}
      {tab === 'history' && (
        loading
          ? <div className={styles.loading}><span /><span /><span /></div>
          : history.length === 0
            ? (
              <div className={styles.empty}>
                <BellIcon size={40} color="var(--text-faint)" strokeWidth={1} />
                <p>No reminders sent yet</p>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>
                  Reminders you send will appear here.
                </p>
              </div>
            )
            : (
              <div className={styles.list}>
                {history.map((item: any) => {
                  const inv     = unwrapEmbed(item.payment_invoices)
                  const student = unwrapEmbed(inv?.profiles)
                  return (
                    <div key={item.id} style={{
                      background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
                      borderRadius: 12, padding: '14px 16px', marginBottom: 8,
                      cursor: 'pointer',
                    }} onClick={() => setPreviewMsg(item)}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                        <div>
                          <p style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                            {student?.full_name ?? 'Unknown Student'}
                          </p>
                          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                            {student?.class_level ?? '—'} · {fmtDate(item.sent_at ?? item.created_at)}
                          </p>
                        </div>
                        <span style={{
                          padding: '3px 10px', borderRadius: 20, fontSize: '0.68rem', fontWeight: 700,
                          background: item.status === 'sent' ? '#10B98120' : '#F59E0B20',
                          color:      item.status === 'sent' ? '#10B981'   : '#F59E0B',
                        }}>
                          {item.status}
                        </span>
                      </div>
                      {item.message_body && (
                        <p style={{
                          fontSize: '0.75rem', color: 'var(--text-muted)', margin: '8px 0 0',
                          lineHeight: 1.5,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}>
                          {item.message_body.slice(0, 120)}{item.message_body.length > 120 ? '… tap to view' : ''}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            )
      )}

      <div className={styles.spacer} />
    </RolePageWrapper>
  )
}
