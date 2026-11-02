'use client'

// Parent: who may collect my child. Codes are shown ONCE (the server only
// keeps a hash), so the UI makes the code easy to pass on via WhatsApp/copy.

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import RoleSubHeader from '@/components/RoleSubHeader'
import { PARENT_FEATURE_GROUPS } from '@/app/dashboard/parent/featureGroups'
import { ShieldIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'
import { SkeletonList } from '@/components/motion/Skeleton'

interface Props { profile: any; school: any; userId: string }

const input: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 10, fontSize: '0.85rem',
  background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'inherit',
}
const label: React.CSSProperties = { fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', margin: '10px 0 4px' }

export default function PickupsClient({ profile, school, userId }: Props) {
  const supabase = createClient()
  const sc = school?.primary_color ?? '#7C3AED'

  const [loading, setLoading] = useState(true)
  const [children, setChildren] = useState<any[]>([])
  const [child, setChild] = useState<any>(null)
  const [people, setPeople] = useState<any[]>([])
  const [problem, setProblem] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ person_name: '', relationship: '', phone: '', valid_until: '' })
  const [busy, setBusy] = useState(false)
  const [issued, setIssued] = useState<{ name: string; code: string } | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const loadPeople = useCallback(async (childId: string) => {
    const res = await fetch(`/api/parent/pickups?student_id=${childId}`, { cache: 'no-store' })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { setProblem(json.error ?? 'Could not load'); return }
    setProblem(null)
    setPeople(json.people ?? [])
  }, [])

  useEffect(() => {
    (async () => {
      const { data: links } = await supabase.from('parent_student_links').select('student_id').eq('parent_id', userId)
      let kids: any[] = []
      if (links?.length) {
        const { data } = await supabase.from('profiles').select('id, full_name, class_level').in('id', links.map(l => l.student_id))
        kids = data ?? []
      } else {
        const { data } = await supabase.from('profiles').select('id, full_name, class_level').eq('parent_id', userId)
        kids = data ?? []
      }
      setChildren(kids)
      if (kids.length) { setChild(kids[0]); await loadPeople(kids[0].id) }
      setLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function switchChild(c: any) {
    setChild(c); setPeople([]); setIssued(null); setShowForm(false)
    await loadPeople(c.id)
  }

  async function add() {
    setBusy(true); setMsg(null)
    const res = await fetch('/api/parent/pickups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: child.id, ...form }),
    })
    const json = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setMsg(json.error ?? 'Could not save'); return }
    setIssued({ name: form.person_name, code: json.code })
    setForm({ person_name: '', relationship: '', phone: '', valid_until: '' })
    setShowForm(false)
    loadPeople(child.id)
  }

  async function act(id: string, name: string, action: 'revoke' | 'regenerate') {
    if (action === 'revoke' && !window.confirm(`Remove ${name}? They will no longer be able to collect ${child.full_name?.split(' ')[0]}.`)) return
    const res = await fetch('/api/parent/pickups', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { setMsg(json.error ?? 'Could not update'); return }
    if (action === 'regenerate') setIssued({ name, code: json.code })
    loadPeople(child.id)
  }

  const shareText = issued
    ? `Pickup code for ${child?.full_name} at ${school?.name ?? 'school'}: ${issued.code}. Show this code and your ID at the school gate.`
    : ''

  return (
    <RoleSubHeader userId={userId} role="parent" profile={profile} school={school} title="Pickup" featureGroups={PARENT_FEATURE_GROUPS}>
      {loading ? <SkeletonList count={3} variant="card" /> : !child ? (
        <div className={styles.empty}><ShieldIcon size={40} color="var(--text-faint)" strokeWidth={1} /><p>No child linked to your account.</p></div>
      ) : (
        <>
          {children.length > 1 && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
              {children.map(c => (
                <button className="pressable" key={c.id} onClick={() => switchChild(c)} style={{
                  padding: '6px 14px', borderRadius: 999, fontSize: '0.75rem', fontWeight: 700, flexShrink: 0, cursor: 'pointer',
                  background: child.id === c.id ? sc : 'var(--glass-bg)', color: child.id === c.id ? '#fff' : 'var(--text-muted)',
                  border: `1px solid ${child.id === c.id ? sc : 'var(--glass-border)'}`,
                }}>{c.full_name?.split(' ')[0]}</button>
              ))}
            </div>
          )}

          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 12px' }}>
            Only people you list here, with their own 6-digit code, can collect {child.full_name?.split(' ')[0]}. The school checks the code at the gate.
          </p>

          {issued && (
            <div className={styles.card} style={{ cursor: 'default', flexDirection: 'column', alignItems: 'stretch', gap: 8, borderColor: sc, marginBottom: 16 }}>
              <p className={styles.cardTitle} style={{ margin: 0 }}>Code for {issued.name}</p>
              <p style={{ margin: 0, fontSize: '2rem', fontWeight: 800, letterSpacing: 6, fontFamily: 'monospace', color: sc }}>{issued.code}</p>
              <p style={{ margin: 0, fontSize: '0.75rem', color: '#F59E0B' }}>Save or send it now. For safety it is never shown again; you can issue a new one any time.</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <a className="pressable" href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer"
                   style={{ padding: '8px 14px', borderRadius: 10, background: sc, color: '#fff', fontWeight: 700, fontSize: '0.8rem', textDecoration: 'none' }}>Send on WhatsApp</a>
                <button className="pressable" onClick={() => navigator.clipboard?.writeText(shareText)}
                        style={{ padding: '8px 14px', borderRadius: 10, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'inherit', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>Copy</button>
                <button className="pressable" onClick={() => setIssued(null)}
                        style={{ padding: '8px 14px', borderRadius: 10, background: 'transparent', border: '1px solid var(--glass-border)', color: 'var(--text-muted)', fontSize: '0.8rem', cursor: 'pointer' }}>Done</button>
              </div>
            </div>
          )}

          {problem && <div className={styles.empty}><p>{problem}</p></div>}
          {msg && <p style={{ color: '#EF4444', fontSize: '0.8rem' }}>{msg}</p>}

          <button className="pressable" onClick={() => setShowForm(v => !v)}
                  style={{ padding: '10px 16px', borderRadius: 10, border: 'none', background: sc, color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', marginBottom: 12 }}>
            {showForm ? 'Close' : 'Add a person'}
          </button>

          {showForm && (
            <div className={styles.card} style={{ cursor: 'default', flexDirection: 'column', alignItems: 'stretch', marginBottom: 16 }}>
              <p style={label}>Full name</p>
              <input style={input} value={form.person_name} onChange={e => setForm(f => ({ ...f, person_name: e.target.value }))} />
              <p style={label}>Relationship (e.g. Uncle, Driver, Neighbour)</p>
              <input style={input} value={form.relationship} onChange={e => setForm(f => ({ ...f, relationship: e.target.value }))} />
              <p style={label}>Phone (optional)</p>
              <input style={input} type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              <p style={label}>Allowed until (optional)</p>
              <input style={input} type="date" value={form.valid_until} onChange={e => setForm(f => ({ ...f, valid_until: e.target.value }))} />
              <button className="pressable" onClick={add} disabled={busy || !form.person_name.trim() || !form.relationship.trim()}
                      style={{ marginTop: 14, padding: '10px 16px', borderRadius: 10, border: 'none', background: sc, color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
                {busy ? 'Saving…' : 'Save and get code'}
              </button>
            </div>
          )}

          <p className={styles.sectionLabel}>Authorised people</p>
          {people.filter(p => p.active).length === 0 ? (
            <div className={styles.empty}>No one added yet.</div>
          ) : (
            <div className={styles.list}>
              {people.filter(p => p.active).map(p => {
                const expired = p.valid_until && p.valid_until < new Date().toISOString().slice(0, 10)
                return (
                  <div key={p.id} className={styles.card} style={{ cursor: 'default', flexWrap: 'wrap', gap: 8 }}>
                    <div className={styles.cardIcon} style={{ background: sc + '22', color: sc }}><ShieldIcon size={18} /></div>
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <p className={styles.cardTitle}>{p.person_name}</p>
                      <p className={styles.cardMeta}>{p.relationship}{p.phone ? ` · ${p.phone}` : ''}{p.valid_until ? ` · until ${p.valid_until}` : ''}</p>
                    </div>
                    {expired && <span className={styles.statusBadge} style={{ background: '#EF444422', color: '#EF4444' }}>Expired</span>}
                    <button className="pressable" onClick={() => act(p.id, p.person_name, 'regenerate')}
                            style={{ padding: '6px 10px', borderRadius: 8, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'inherit', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}>New code</button>
                    <button className="pressable" onClick={() => act(p.id, p.person_name, 'revoke')}
                            style={{ padding: '6px 10px', borderRadius: 8, background: '#EF444422', border: 'none', color: '#EF4444', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}>Remove</button>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
      <div style={{ height: 110 }} />
    </RoleSubHeader>
  )
}
