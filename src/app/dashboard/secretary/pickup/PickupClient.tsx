'use client'

// Front desk gate check: find the child, enter the 6-digit code the person
// shows, confirm who it belongs to, then release. Everything is logged and
// the parents are told.

import { useState } from 'react'
import RoleSubHeader from '@/components/RoleSubHeader'
import { SECRETARY_FEATURE_GROUPS } from '@/app/dashboard/secretary/featureGroups'
import { ShieldIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'

interface Props { profile: any; school: any; userId: string }

const input: React.CSSProperties = {
  width: '100%', padding: '12px 14px', borderRadius: 10, fontSize: '0.95rem',
  background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'inherit',
}

export default function PickupClient({ profile, school, userId }: Props) {
  const sc = school?.primary_color ?? '#7C3AED'

  const [q, setQ] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [student, setStudent] = useState<any>(null)
  const [people, setPeople] = useState<any[]>([])
  const [today, setToday] = useState<any[]>([])
  const [code, setCode] = useState('')
  const [match, setMatch] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  async function search() {
    if (q.trim().length < 2) return
    setSearching(true)
    const res = await fetch(`/api/secretary/pickups?q=${encodeURIComponent(q.trim())}`, { cache: 'no-store' })
    const json = await res.json().catch(() => ({}))
    setSearching(false)
    if (!res.ok) { setMsg({ text: json.error ?? 'Search failed', ok: false }); return }
    setMsg(null)
    setResults(json.students ?? [])
  }

  async function pick(s: any) {
    const res = await fetch(`/api/secretary/pickups?student_id=${s.id}`, { cache: 'no-store' })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { setMsg({ text: json.error ?? 'Could not load', ok: false }); return }
    setMsg(null); setMatch(null); setCode('')
    setStudent(json.student); setPeople(json.people ?? []); setToday(json.today ?? [])
    setResults([])
  }

  async function post(body: Record<string, unknown>) {
    const res = await fetch('/api/secretary/pickups', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: student.id, ...body }),
    })
    return { ok: res.ok, json: await res.json().catch(() => ({})) }
  }

  async function verify() {
    setBusy(true); setMsg(null); setMatch(null)
    const { ok, json } = await post({ action: 'verify', code })
    setBusy(false)
    if (!ok) {
      const extra = typeof json.attemptsLeft === 'number' ? ` ${json.attemptsLeft} attempt${json.attemptsLeft === 1 ? '' : 's'} left.` : ''
      setMsg({ text: (json.error ?? 'Could not verify') + extra, ok: false })
      return
    }
    setMatch(json.match)
  }

  async function release() {
    setBusy(true)
    const { ok, json } = await post({ action: 'release', authorized_pickup_id: match.id, code })
    setBusy(false)
    if (!ok) { setMsg({ text: json.error ?? 'Could not record release', ok: false }); return }
    setMsg({ text: `${student.full_name} released to ${match.person_name}. Parents have been told.`, ok: true })
    setMatch(null); setCode('')
    pick(student)
  }

  async function deny() {
    const name = window.prompt('Name of the person refused (optional):') ?? ''
    setBusy(true)
    await post({ action: 'deny', person_name: name, notes: 'Refused at gate' })
    setBusy(false)
    setMsg({ text: 'Refusal recorded.', ok: true })
    setMatch(null); setCode('')
    pick(student)
  }

  return (
    <RoleSubHeader userId={userId} role="secretary" profile={profile} school={school} title="Gate pickup" featureGroups={SECRETARY_FEATURE_GROUPS}>
      {msg && (
        <div className={styles.card} style={{ cursor: 'default', borderColor: msg.ok ? '#10B981' : '#EF4444', marginBottom: 12 }}>
          <p style={{ margin: 0, fontSize: '0.85rem', color: msg.ok ? '#10B981' : '#EF4444', fontWeight: 600 }}>{msg.text}</p>
        </div>
      )}

      {!student ? (
        <>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 10px' }}>Find the child being collected.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input style={input} placeholder="Child's name" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()} />
            <button className="pressable" onClick={search} disabled={searching || q.trim().length < 2}
                    style={{ padding: '0 18px', borderRadius: 10, border: 'none', background: sc, color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Search</button>
          </div>
          <div className={styles.list} style={{ marginTop: 12 }}>
            {results.map(s => (
              <button key={s.id} className={`${styles.card} pressable`} style={{ textAlign: 'left', cursor: 'pointer', width: '100%' }} onClick={() => pick(s)}>
                <div className={styles.cardIcon} style={{ background: sc + '22', color: sc }}><ShieldIcon size={18} /></div>
                <div style={{ flex: 1 }}>
                  <p className={styles.cardTitle}>{s.full_name}</p>
                  <p className={styles.cardMeta}>{s.class_level ?? 'Unassigned'}</p>
                </div>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className={styles.card} style={{ cursor: 'default', marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <p className={styles.cardTitle}>{student.full_name}</p>
              <p className={styles.cardMeta}>{student.class_level ?? 'Unassigned'} · {people.length} authorised {people.length === 1 ? 'person' : 'people'}</p>
            </div>
            <button className="pressable" onClick={() => { setStudent(null); setMatch(null); setCode(''); setMsg(null) }}
                    style={{ padding: '6px 12px', borderRadius: 8, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'inherit', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>Change</button>
          </div>

          {people.length === 0 ? (
            <div className={styles.empty}>No one is authorised for this child yet. Do not release them; contact the parents.</div>
          ) : !match ? (
            <>
              <p className={styles.sectionLabel}>Enter the code the person shows</p>
              <input style={{ ...input, textAlign: 'center', fontSize: '1.6rem', letterSpacing: 8, fontFamily: 'monospace' }}
                     inputMode="numeric" maxLength={6} placeholder="000000" value={code}
                     onChange={e => setCode(e.target.value.replace(/\D/g, ''))} />
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="pressable" onClick={verify} disabled={busy || code.length !== 6}
                        style={{ flex: 1, padding: '12px', borderRadius: 10, border: 'none', background: sc, color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: busy || code.length !== 6 ? 0.6 : 1 }}>Check code</button>
                <button className="pressable" onClick={deny} disabled={busy}
                        style={{ padding: '12px 16px', borderRadius: 10, background: '#EF444422', border: 'none', color: '#EF4444', fontWeight: 700, cursor: 'pointer' }}>Refuse</button>
              </div>
            </>
          ) : (
            <div className={styles.card} style={{ cursor: 'default', flexDirection: 'column', alignItems: 'stretch', gap: 8, borderColor: '#10B981' }}>
              <p style={{ margin: 0, fontSize: '0.7rem', fontWeight: 700, color: '#10B981', textTransform: 'uppercase' }}>Code matches</p>
              <p className={styles.cardTitle} style={{ margin: 0, fontSize: '1.2rem' }}>{match.person_name}</p>
              <p className={styles.cardMeta} style={{ margin: 0 }}>{match.relationship}{match.phone ? ` · ${match.phone}` : ''}</p>
              <p style={{ margin: 0, fontSize: '0.78rem', color: '#F59E0B' }}>Check their ID matches this name before releasing.</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="pressable" onClick={release} disabled={busy}
                        style={{ flex: 1, padding: '12px', borderRadius: 10, border: 'none', background: '#10B981', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Release child</button>
                <button className="pressable" onClick={deny} disabled={busy}
                        style={{ padding: '12px 16px', borderRadius: 10, background: '#EF444422', border: 'none', color: '#EF4444', fontWeight: 700, cursor: 'pointer' }}>Refuse</button>
              </div>
            </div>
          )}

          {people.length > 0 && (
            <>
              <p className={styles.sectionLabel} style={{ marginTop: 20 }}>Authorised people (names only)</p>
              <div className={styles.list}>
                {people.map(p => (
                  <div key={p.id} className={styles.card} style={{ cursor: 'default' }}>
                    <div style={{ flex: 1 }}>
                      <p className={styles.cardTitle}>{p.person_name}</p>
                      <p className={styles.cardMeta}>{p.relationship}{p.valid_until ? ` · until ${p.valid_until}` : ''}</p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <p className={styles.sectionLabel} style={{ marginTop: 20 }}>Today</p>
          {today.length === 0 ? <div className={styles.empty}>Nothing recorded today.</div> : (
            <div className={styles.list}>
              {today.map(t => (
                <div key={t.id} className={styles.card} style={{ cursor: 'default' }}>
                  <div style={{ flex: 1 }}>
                    <p className={styles.cardTitle}>{t.outcome === 'released' ? 'Released' : t.outcome === 'denied' ? 'Refused' : 'Wrong code'}{t.person_name ? ` · ${t.person_name}` : ''}</p>
                    <p className={styles.cardMeta}>{new Date(t.created_at).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      <div style={{ height: 110 }} />
    </RoleSubHeader>
  )
}
