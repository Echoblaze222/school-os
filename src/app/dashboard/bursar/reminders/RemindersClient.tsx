'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { BellIcon, PeopleIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'

type Tab = 'send' | 'history'
interface Props { profile: any; school: any; userId: string }

const TERMS    = ['First Term', 'Second Term', 'Third Term']
const CUR_YEAR = new Date().getMonth() >= 8
  ? `${new Date().getFullYear()}/${new Date().getFullYear()+1}`
  : `${new Date().getFullYear()-1}/${new Date().getFullYear()}`

function currentTerm() {
  const m = new Date().getMonth()
  if (m >= 8) return 'First Term'
  if (m <= 2) return 'Second Term'
  return 'Third Term'
}

export default function RemindersClient({ profile, school, userId }: Props) {
  const [tab,      setTab]      = useState<Tab>('send')
  const [debtors,  setDebtors]  = useState<any[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [history,  setHistory]  = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [sending,  setSending]  = useState(false)
  const [sent,     setSent]     = useState(false)
  const [term,     setTerm]     = useState(currentTerm())
  const [year,     setYear]     = useState(CUR_YEAR)
  const [message,  setMessage]  = useState('')
  const supabase = createClient()
  const sc       = school?.primary_color ?? '#7C3AED'

  useEffect(() => {
    if (tab === 'send') loadDebtors()
    else                loadHistory()
  }, [tab, term, year])

  async function loadDebtors() {
    setLoading(true)
    const [{ data: students }, { data: feeStructures }, { data: payments }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, class_level, default_code')
        .eq('school_id', school?.id).eq('role', 'student'),
      supabase.from('school_fees').select('class_level, amount')
        .eq('school_id', school?.id).eq('term', term).eq('academic_year', year),
      supabase.from('fee_payments').select('student_id, amount')
        .eq('school_id', school?.id).eq('term', term).eq('academic_year', year),
    ])
    const expected: Record<string, number> = {}
    for (const fee of (feeStructures ?? [])) {
      expected[fee.class_level] = (expected[fee.class_level] ?? 0) + (fee.amount ?? 0)
    }
    const paid: Record<string, number> = {}
    for (const p of (payments ?? [])) {
      if (p.student_id) paid[p.student_id] = (paid[p.student_id] ?? 0) + (p.amount ?? 0)
    }
    const result = (students ?? [])
      .map(s => ({ ...s, outstanding: (expected[s.class_level] ?? 0) - (paid[s.id] ?? 0) }))
      .filter(s => s.outstanding > 0)
      .sort((a, b) => b.outstanding - a.outstanding)
    setDebtors(result)
    setSelected(new Set())
    setLoading(false)
  }

  async function loadHistory() {
    setLoading(true)
    const { data } = await supabase.from('announcements').select('*')
      .eq('school_id', school?.id).ilike('title', '%fee reminder%')
      .order('created_at', { ascending: false }).limit(20)
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
    const body = message.trim() ||
      `Dear Parent/Guardian, this is a reminder that your ward's school fees for ${term} ${year} are outstanding. Kindly make payment at your earliest convenience. Thank you.`
    await supabase.from('announcements').insert({
      school_id: school.id, author_id: userId,
      title:    `Fee Reminder — ${term} ${year}`,
      body, audience: 'parents', status: 'published',
    })
    setSending(false); setSent(true)
    setSelected(new Set()); setMessage('')
    setTimeout(() => setSent(false), 4000)
  }

  function fmtAmt(n: number) {
    return new Intl.NumberFormat('en-NG', {
      style:'currency', currency:'NGN', minimumFractionDigits:0
    }).format(n)
  }
  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-NG',
      { day:'numeric', month:'short', year:'numeric' })
  }

  return (
    <RolePageWrapper userId={userId} role="bursar" profile={profile} school={school} title="Reminders">
      <div className={styles.tabs} style={{ marginBottom:'var(--space-4)' }}>
        {(['send','history'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`${styles.tab} ${tab===t ? styles.tabActive : ''}`}
            style={tab===t ? { background:sc, color:'#fff', borderColor:sc } : {}}>
            {t === 'send' ? 'Send Reminders' : 'Sent History'}
          </button>
        ))}
      </div>

      {/* ── Send Reminders ────────────────────────────────── */}
      {tab === 'send' && (
        <>
          <div style={{ display:'flex', gap:'var(--space-3)', marginBottom:'var(--space-4)', alignItems:'center' }}>
            <input value={year} onChange={e => setYear(e.target.value)}
              style={{ height:40, padding:'0 12px', background:'var(--input-bg)',
                border:'1px solid var(--input-border)', borderRadius:8,
                color:'var(--text-primary)', fontSize:'0.82rem', outline:'none',
                width:110, flexShrink:0 }}/>
            <div className={styles.tabs} style={{ flex:1 }}>
              {TERMS.map(t => (
                <button key={t} onClick={() => setTerm(t)}
                  className={`${styles.tab} ${term===t ? styles.tabActive : ''}`}
                  style={term===t ? { background:sc, color:'#fff', borderColor:sc } : {}}>
                  {t.replace(' Term','')}
                </button>
              ))}
            </div>
          </div>

          {sent && (
            <div style={{ padding:'var(--space-4)', background:'#10B98115',
              border:'1px solid #10B98140', borderRadius:10, marginBottom:'var(--space-4)',
              fontSize:'0.85rem', fontWeight:700, color:'#10B981' }}>
              ✓ Reminder published to parents
            </div>
          )}

          {/* Composer — shows when students are selected */}
          {selected.size > 0 && (
            <div style={{ background:'var(--glass-bg)', border:'1px solid var(--glass-border)',
              borderRadius:'var(--radius-xl)', padding:'var(--space-4)', marginBottom:'var(--space-4)' }}>
              <p style={{ fontSize:'0.78rem', fontWeight:700, color:'var(--text-primary)',
                margin:'0 0 8px' }}>
                Reminder for {selected.size} student{selected.size > 1 ? 's' : ''}
              </p>
              <textarea value={message} onChange={e => setMessage(e.target.value)} rows={3}
                placeholder="Leave blank to use the default message…"
                style={{ width:'100%', padding:'10px 12px', background:'var(--input-bg)',
                  border:'1px solid var(--input-border)', borderRadius:8,
                  color:'var(--text-primary)', fontSize:'0.82rem',
                  outline:'none', resize:'none' }}/>
              <button onClick={sendReminders} disabled={sending}
                style={{ width:'100%', marginTop:'var(--space-3)', height:40,
                  background:sc, color:'#fff', border:'none', borderRadius:8,
                  fontWeight:700, fontSize:'0.85rem', cursor:'pointer',
                  opacity:sending ? 0.6 : 1 }}>
                {sending
                  ? 'Sending…'
                  : `Send Reminder to ${selected.size} Parent${selected.size > 1 ? 's' : ''}`}
              </button>
            </div>
          )}

          {loading
            ? <div className={styles.loading}><span/><span/><span/></div>
            : debtors.length === 0
              ? <div className={styles.empty}>
                  <BellIcon size={40} color="var(--text-faint)" strokeWidth={1}/>
                  <p>No outstanding fees for {term} {year}</p>
                </div>
              : <>
                  <div style={{ display:'flex', justifyContent:'space-between',
                    alignItems:'center', marginBottom:'var(--space-3)' }}>
                    <p style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--text-muted)',
                      letterSpacing:'0.05em', margin:0 }}>
                      {debtors.length} DEBTOR{debtors.length !== 1 ? 'S' : ''}
                    </p>
                    <button onClick={toggleAll}
                      style={{ background:'none', border:'none', cursor:'pointer',
                        fontSize:'0.75rem', color:sc, fontWeight:700, padding:0 }}>
                      {selected.size === debtors.length ? 'Deselect all' : 'Select all'}
                    </button>
                  </div>
                  <div className={styles.list}>
                    {debtors.map((d: any) => (
                      <div key={d.id} className={styles.card}
                        onClick={() => toggleSelect(d.id)} style={{ cursor:'pointer' }}>
                        {/* Checkbox */}
                        <div style={{ width:20, height:20, borderRadius:4, flexShrink:0,
                          border:`2px solid ${selected.has(d.id) ? sc : 'var(--input-border)'}`,
                          background: selected.has(d.id) ? sc : 'transparent',
                          display:'flex', alignItems:'center', justifyContent:'center' }}>
                          {selected.has(d.id) && (
                            <span style={{ color:'#fff', fontSize:'0.7rem', fontWeight:900 }}>✓</span>
                          )}
                        </div>
                        <div className={styles.cardIcon} style={{ background:'#EF444420' }}>
                          <PeopleIcon size={16} color="#EF4444"/>
                        </div>
                        <div className={styles.cardBody}>
                          <p className={styles.cardTitle}>{d.full_name}</p>
                          <p className={styles.cardMeta}>{d.class_level} · {d.default_code}</p>
                        </div>
                        <span style={{ fontSize:'0.82rem', fontWeight:800,
                          color:'#EF4444', flexShrink:0 }}>
                          {fmtAmt(d.outstanding)}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
          }
        </>
      )}

      {/* ── Sent History ──────────────────────────────────── */}
      {tab === 'history' && (
        loading
          ? <div className={styles.loading}><span/><span/><span/></div>
          : history.length === 0
            ? <div className={styles.empty}>
                <BellIcon size={40} color="var(--text-faint)" strokeWidth={1}/>
                <p>No reminders sent yet</p>
              </div>
            : <div className={styles.list}>
                {history.map((item: any) => (
                  <div key={item.id} className={styles.card}>
                    <div className={styles.cardIcon} style={{ background:sc+'20' }}>
                      <BellIcon size={16} color={sc}/>
                    </div>
                    <div className={styles.cardBody}>
                      <p className={styles.cardTitle}>{item.title}</p>
                      {item.body && (
                        <p className={styles.cardMeta}>{item.body.slice(0, 70)}…</p>
                      )}
                    </div>
                    <p style={{ fontSize:'0.7rem', color:'var(--text-muted)', flexShrink:0 }}>
                      {fmtDate(item.created_at)}
                    </p>
                  </div>
                ))}
              </div>
      )}
      <div className={styles.spacer}/>
    </RolePageWrapper>
  )
}
