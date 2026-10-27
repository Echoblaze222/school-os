'use client'

// NDPA data-protection tools: readiness checklist, DPO/registration settings,
// parental consent register, data-subject requests, breach register (72h
// clock) and a privacy-notice template. Reuses the Students page styles; all
// data goes through /api/principal/data-protection/[section].

import { useCallback, useEffect, useMemo, useState } from 'react'
import RoleSubHeader from '@/components/RoleSubHeader'
import { PRINCIPAL_FEATURE_GROUPS } from '../featureGroups'
import { CheckIcon, XIcon, AlertIcon } from '@/components/Icons'
import {
  CONSENT_TYPES, CONSENT_METHODS, REQUEST_TYPES, REQUEST_STATUSES, RISK_LEVELS, BREACH_STATUSES,
} from '@/lib/dataProtection'
import styles from '../students/students.module.css'

interface Props { profile: any; school: any; userId: string }

type Tab = 'overview' | 'settings' | 'consents' | 'requests' | 'breaches' | 'notice'
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'settings', label: 'Settings' },
  { id: 'consents', label: 'Consents' },
  { id: 'requests', label: 'Requests' },
  { id: 'breaches', label: 'Breaches' },
  { id: 'notice',   label: 'Privacy notice' },
]

const cap = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())

async function api(section: string, method = 'GET', body?: unknown) {
  const res = await fetch(`/api/principal/data-protection/${section}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  })
  const json = await res.json().catch(() => ({}))
  return { ok: res.ok, json }
}

const muted: React.CSSProperties = { fontSize: '0.78rem', color: 'var(--text-muted)' }

function Badge({ text, tone }: { text: string; tone: 'ok' | 'warn' | 'bad' | 'muted' }) {
  const colors = { ok: '#10B981', warn: '#F59E0B', bad: '#EF4444', muted: '#9CA3AF' }
  return (
    <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: 999, color: colors[tone], border: `1px solid ${colors[tone]}` }}>
      {text}
    </span>
  )
}

export default function DataProtectionClient({ profile, school, userId }: Props) {
  const sc = school?.primary_color ?? '#800020'
  const [tab, setTab] = useState<Tab>('overview')
  const [problem, setProblem] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  const showToast = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }, [])

  return (
    <RoleSubHeader userId={userId} role="principal" profile={profile} school={school} title="Data protection" featureGroups={PRINCIPAL_FEATURE_GROUPS}>
      {toast && (
        <div className={`${styles.toast} ${toast.ok ? styles.toastOk : styles.toastErr}`}>
          {toast.ok ? <CheckIcon size={14} /> : <XIcon size={14} />} {toast.msg}
        </div>
      )}
      <div className={styles.container}>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8, marginBottom: 8 }}>
          {TABS.map(t => (
            <button
              key={t.id}
              className={`${styles.filterSelect} pressable`}
              style={{ cursor: 'pointer', whiteSpace: 'nowrap', ...(tab === t.id ? { background: sc, color: '#fff' } : {}) }}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {problem ? (
          <div className={styles.empty}><AlertIcon size={32} /><p>{problem}</p></div>
        ) : (
          <>
            {(tab === 'overview' || tab === 'settings' || tab === 'notice') && (
              <SettingsPanel tab={tab} sc={sc} setProblem={setProblem} showToast={showToast} />
            )}
            {tab === 'consents' && <ConsentsPanel sc={sc} setProblem={setProblem} showToast={showToast} />}
            {tab === 'requests' && <RequestsPanel sc={sc} setProblem={setProblem} showToast={showToast} />}
            {tab === 'breaches' && <BreachesPanel sc={sc} setProblem={setProblem} showToast={showToast} />}
          </>
        )}
        <div style={{ height: 100 }} />
      </div>
    </RoleSubHeader>
  )
}

interface PanelProps { sc: string; setProblem: (p: string | null) => void; showToast: (m: string, ok?: boolean) => void }

// ── Overview + Settings + Privacy notice (share one fetch) ─────────────────────────────────────────────────

function SettingsPanel({ tab, sc, setProblem, showToast }: PanelProps & { tab: Tab }) {
  const [data, setData] = useState<any>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const { ok, json } = await api('settings')
    if (!ok) { setProblem(json.error ?? 'Could not load'); return }
    setProblem(null)
    setData(json)
    const s = json.settings ?? {}
    setForm({
      dpo_name: s.dpo_name ?? '', dpo_email: s.dpo_email ?? '', dpo_phone: s.dpo_phone ?? '',
      ndpc_registration_number: s.ndpc_registration_number ?? '',
      last_audit_return_year: s.last_audit_return_year?.toString() ?? '',
      last_audit_return_filed_on: s.last_audit_return_filed_on ?? '',
      privacy_notice_published_on: s.privacy_notice_published_on ?? '',
    })
  }, [setProblem])

  useEffect(() => { load() }, [load])

  async function save() {
    setSaving(true)
    const { ok, json } = await api('settings', 'PUT', form)
    setSaving(false)
    if (!ok) { showToast(json.error ?? 'Could not save', false); return }
    showToast('Saved')
    load()
  }

  if (!data) return <div className={styles.loadingList}>{[1, 2, 3].map(i => <div key={i} className={styles.skeleton} />)}</div>

  if (tab === 'overview') {
    return (
      <>
        <div className={styles.formCard}>
          <p className={styles.formTitle}>Readiness score: {data.checklist.score}%</p>
          <p style={muted}>A self-check against the Nigeria Data Protection Act. It is a guide, not legal advice or proof of compliance.</p>
        </div>
        <div className={styles.studentList}>
          {data.checklist.items.map((i: any) => (
            <div key={i.id} className={styles.studentRow} style={{ gap: 10 }}>
              <span style={{ color: i.ok ? '#10B981' : '#EF4444', display: 'flex' }}>{i.ok ? <CheckIcon size={16} /> : <XIcon size={16} />}</span>
              <div className={styles.studentInfo}>
                <p className={styles.studentName}>{i.label}</p>
                {!i.ok && <div className={styles.studentMeta}><span>{i.hint}</span></div>}
              </div>
            </div>
          ))}
        </div>
      </>
    )
  }

  if (tab === 'notice') {
    const md: string = data.privacyNotice
    return (
      <div className={styles.formCard}>
        <p className={styles.formTitle}>Privacy notice template</p>
        <p style={muted}>Complete the items in [brackets], have your Data Protection Officer or a lawyer review it, share it with parents, then record the date under Settings.</p>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.78rem', maxHeight: 360, overflow: 'auto', margin: '10px 0' }}>{md}</pre>
        <div className={styles.formActions}>
          <button className={`${styles.cancelFormBtn} pressable`} onClick={() => { navigator.clipboard?.writeText(md); showToast('Copied') }}>Copy</button>
          <button
            className={`${styles.saveBtn} pressable`}
            style={{ background: sc }}
            onClick={() => {
              const url = URL.createObjectURL(new Blob([md], { type: 'text/markdown;charset=utf-8' }))
              const a = document.createElement('a')
              a.href = url
              a.download = 'privacy-notice.md'
              a.click()
              URL.revokeObjectURL(url)
            }}
          >
            Download
          </button>
        </div>
      </div>
    )
  }

  const field = (key: string, label: string, type = 'text', placeholder = '') => (
    <div className={styles.fieldGroup} key={key}>
      <label className={styles.fieldLabel}>{label}</label>
      <input
        className={styles.fieldInput}
        type={type}
        placeholder={placeholder}
        value={form[key] ?? ''}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
      />
    </div>
  )

  return (
    <div className={styles.formCard}>
      <p className={styles.formTitle}>Data Protection Officer and registration</p>
      <div className={styles.formGrid}>
        {field('dpo_name', 'DPO name')}
        {field('dpo_email', 'DPO email', 'email')}
        {field('dpo_phone', 'DPO phone', 'tel')}
        {field('ndpc_registration_number', 'NDPC registration number')}
        {field('last_audit_return_year', 'Latest audit return covers year', 'number', 'e.g. 2025')}
        {field('last_audit_return_filed_on', 'Audit return filed on', 'date')}
        {field('privacy_notice_published_on', 'Privacy notice shared with parents on', 'date')}
      </div>
      <div className={styles.formActions}>
        <button className={`${styles.saveBtn} pressable`} style={{ background: sc }} onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

// ── Consents ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

function ConsentsPanel({ sc, setProblem, showToast }: PanelProps) {
  const [data, setData] = useState<any>(null)
  const [type, setType] = useState<string>(CONSENT_TYPES[0].id)
  const [onlyMissing, setOnlyMissing] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [method, setMethod] = useState<string>('paper')
  const [guardian, setGuardian] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { ok, json } = await api('consents')
    if (!ok) { setProblem(json.error ?? 'Could not load'); return }
    setProblem(null)
    setData(json)
  }, [setProblem])
  useEffect(() => { load() }, [load])

  const rows = useMemo(() => {
    if (!data) return []
    const q = search.trim().toLowerCase()
    return (data.students as any[]).filter(s => {
      const v = data.consents[s.id]?.[type]
      if (onlyMissing && v !== undefined) return false
      return !q || s.full_name?.toLowerCase().includes(q) || s.class_level?.toLowerCase().includes(q)
    })
  }, [data, type, onlyMissing, search])

  async function record(granted: boolean) {
    if (selected.size === 0) return
    setBusy(true)
    const { ok, json } = await api('consents', 'POST', {
      student_ids: [...selected], consent_type: type, granted, method, guardian_name: guardian,
    })
    setBusy(false)
    if (!ok) { showToast(json.error ?? 'Could not save', false); return }
    showToast(`${json.saved} recorded${json.skipped ? `, ${json.skipped} skipped` : ''}`)
    setSelected(new Set())
    load()
  }

  if (!data) return <div className={styles.loadingList}>{[1, 2, 3].map(i => <div key={i} className={styles.skeleton} />)}</div>
  const sum = data.summary[type]

  return (
    <>
      <div className={styles.formCard}>
        <p className={styles.formTitle}>Parental consent register</p>
        <p style={muted}>Record what parents have agreed to on paper or in person. Pick a consent type, tick the learners, then record.</p>
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>Consent type</label>
          <select className={styles.fieldInput} value={type} onChange={e => { setType(e.target.value); setSelected(new Set()) }}>
            {CONSENT_TYPES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
        <p style={{ ...muted, marginTop: 8 }}>
          Given: {sum.granted} · Declined: {sum.declined} · Not recorded: {sum.notRecorded}
        </p>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <input className={styles.searchInput} placeholder="Search name or class" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button className={`${styles.filterSelect} pressable`} style={{ cursor: 'pointer' }} onClick={() => setOnlyMissing(v => !v)}>
          {onlyMissing ? 'Showing: not recorded' : 'Showing: all'}
        </button>
        <button
          className={`${styles.filterSelect} pressable`}
          style={{ cursor: 'pointer' }}
          onClick={() => setSelected(selected.size === rows.length ? new Set() : new Set(rows.map((r: any) => r.id)))}
        >
          {selected.size === rows.length && rows.length > 0 ? 'Clear' : `Select all (${rows.length})`}
        </button>
      </div>

      <div className={styles.studentList}>
        {rows.length === 0 && <div className={styles.empty}><p>{onlyMissing ? 'Everyone has a record for this consent.' : 'No learners match.'}</p></div>}
        {rows.slice(0, 300).map((s: any) => {
          const v = data.consents[s.id]?.[type]
          return (
            <label key={s.id} className={styles.studentRow} style={{ gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={selected.has(s.id)}
                onChange={() => setSelected(prev => { const n = new Set(prev); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n })}
              />
              <div className={styles.studentInfo}>
                <p className={styles.studentName}>{s.full_name}</p>
                <div className={styles.studentMeta}><span>{s.class_level ?? 'Unassigned'}</span></div>
              </div>
              {v === true && <Badge text="Given" tone="ok" />}
              {v === false && <Badge text="Declined" tone="bad" />}
              {v === undefined && <Badge text="Not recorded" tone="muted" />}
            </label>
          )
        })}
        {rows.length > 300 && <p style={muted}>Showing the first 300. Search to narrow the list.</p>}
      </div>

      {selected.size > 0 && (
        <div className={styles.formCard}>
          <p className={styles.formTitle}>Record for {selected.size} learner{selected.size === 1 ? '' : 's'}</p>
          <div className={styles.formGrid}>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>How was it obtained?</label>
              <select className={styles.fieldInput} value={method} onChange={e => setMethod(e.target.value)}>
                {CONSENT_METHODS.map(m => <option key={m} value={m}>{cap(m)}</option>)}
              </select>
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Parent or guardian name (optional)</label>
              <input className={styles.fieldInput} value={guardian} onChange={e => setGuardian(e.target.value)} />
            </div>
          </div>
          <div className={styles.formActions}>
            <button className={`${styles.cancelFormBtn} pressable`} disabled={busy} onClick={() => record(false)}>Declined</button>
            <button className={`${styles.saveBtn} pressable`} style={{ background: sc }} disabled={busy} onClick={() => record(true)}>Consent given</button>
          </div>
        </div>
      )}
    </>
  )
}

// ── Requests ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

function RequestsPanel({ sc, setProblem, showToast }: PanelProps) {
  const [list, setList] = useState<any[] | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({ request_type: 'access' })
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { ok, json } = await api('requests')
    if (!ok) { setProblem(json.error ?? 'Could not load'); return }
    setProblem(null)
    setList(json.requests)
  }, [setProblem])
  useEffect(() => { load() }, [load])

  async function create() {
    setBusy(true)
    const { ok, json } = await api('requests', 'POST', form)
    setBusy(false)
    if (!ok) { showToast(json.error ?? 'Could not save', false); return }
    showToast('Request logged')
    setShowForm(false)
    setForm({ request_type: 'access' })
    load()
  }

  async function setStatus(id: string, status: string) {
    const { ok, json } = await api('requests', 'PATCH', { id, status })
    if (!ok) { showToast(json.error ?? 'Could not update', false); return }
    load()
  }

  const tone = (s: string) => (s === 'overdue' ? 'bad' : s === 'due_soon' ? 'warn' : s === 'closed' ? 'ok' : 'muted') as 'ok' | 'warn' | 'bad' | 'muted'

  return (
    <>
      <div className={styles.toolbar}>
        <button className={`${styles.addBtn} pressable`} style={{ background: sc }} onClick={() => setShowForm(v => !v)}>
          {showForm ? 'Close' : 'Log a request'}
        </button>
      </div>
      <p style={{ ...muted, margin: '0 0 8px' }}>Parents can ask to see, correct, delete or move their child's data. Due dates default to 30 days as an internal target; confirm the legal timeframe with your DPO.</p>

      {showForm && (
        <div className={styles.formCard}>
          <div className={styles.formGrid}>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Requester name</label>
              <input className={styles.fieldInput} value={form.requester_name ?? ''} onChange={e => setForm(f => ({ ...f, requester_name: e.target.value }))} />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Phone or email</label>
              <input className={styles.fieldInput} value={form.requester_contact ?? ''} onChange={e => setForm(f => ({ ...f, requester_contact: e.target.value }))} />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Request type</label>
              <select className={styles.fieldInput} value={form.request_type} onChange={e => setForm(f => ({ ...f, request_type: e.target.value }))}>
                {REQUEST_TYPES.map(t => <option key={t} value={t}>{cap(t)}</option>)}
              </select>
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Due date (optional)</label>
              <input className={styles.fieldInput} type="date" value={form.due_on ?? ''} onChange={e => setForm(f => ({ ...f, due_on: e.target.value }))} />
            </div>
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Details</label>
            <textarea className={styles.fieldInput} style={{ width: '100%', minHeight: 80 }} value={form.details ?? ''} onChange={e => setForm(f => ({ ...f, details: e.target.value }))} />
          </div>
          <div className={styles.formActions}>
            <button className={`${styles.saveBtn} pressable`} style={{ background: sc }} onClick={create} disabled={busy || !(form.requester_name ?? '').trim()}>
              {busy ? 'Saving…' : 'Log request'}
            </button>
          </div>
        </div>
      )}

      {!list ? (
        <div className={styles.loadingList}>{[1, 2, 3].map(i => <div key={i} className={styles.skeleton} />)}</div>
      ) : list.length === 0 ? (
        <div className={styles.empty}><p>No requests logged.</p></div>
      ) : (
        <div className={styles.studentList}>
          {list.map(r => (
            <div key={r.id} className={styles.studentRow} style={{ flexWrap: 'wrap', gap: 8 }}>
              <div className={styles.studentInfo} style={{ minWidth: 180 }}>
                <p className={styles.studentName}>{r.requester_name} · {cap(r.request_type)}</p>
                <div className={styles.studentMeta}>
                  {r.student_name && <span>Re: {r.student_name}</span>}
                  <span>Due {r.due_on}</span>
                </div>
              </div>
              <Badge
                tone={tone(r.clock.state)}
                text={r.clock.state === 'closed' ? cap(r.status) : r.clock.state === 'overdue' ? 'Overdue' : `${r.clock.daysRemaining} day${r.clock.daysRemaining === 1 ? '' : 's'} left`}
              />
              <select className={styles.fieldInput} style={{ width: 130 }} value={r.status} onChange={e => setStatus(r.id, e.target.value)}>
                {REQUEST_STATUSES.map(s => <option key={s} value={s}>{cap(s)}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// ── Breaches ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

function BreachesPanel({ sc, setProblem, showToast }: PanelProps) {
  const [list, setList] = useState<any[] | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({ risk_level: 'medium' })
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { ok, json } = await api('breaches')
    if (!ok) { setProblem(json.error ?? 'Could not load'); return }
    setProblem(null)
    setList(json.breaches)
  }, [setProblem])
  useEffect(() => { load() }, [load])

  async function create() {
    setBusy(true)
    const { ok, json } = await api('breaches', 'POST', form)
    setBusy(false)
    if (!ok) { showToast(json.error ?? 'Could not save', false); return }
    showToast('Breach logged. The 72-hour clock has started.')
    setShowForm(false)
    setForm({ risk_level: 'medium' })
    load()
  }

  async function patch(id: string, body: Record<string, unknown>) {
    const { ok, json } = await api('breaches', 'PATCH', { id, ...body })
    if (!ok) { showToast(json.error ?? 'Could not update', false); return }
    load()
  }

  return (
    <>
      <div className={styles.toolbar}>
        <button className={`${styles.addBtn} pressable`} style={{ background: sc }} onClick={() => setShowForm(v => !v)}>
          {showForm ? 'Close' : 'Log a breach'}
        </button>
      </div>
      <p style={{ ...muted, margin: '0 0 8px' }}>If a breach is likely to put people at risk, the NDPC must be notified within 72 hours of the school becoming aware of it, and every breach must be recorded here.</p>

      {showForm && (
        <div className={styles.formCard}>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>What happened?</label>
            <textarea className={styles.fieldInput} style={{ width: '100%', minHeight: 80 }} value={form.description ?? ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className={styles.formGrid}>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Data affected</label>
              <input className={styles.fieldInput} value={form.data_affected ?? ''} onChange={e => setForm(f => ({ ...f, data_affected: e.target.value }))} />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>People affected</label>
              <input className={styles.fieldInput} inputMode="numeric" value={form.people_affected ?? ''} onChange={e => setForm(f => ({ ...f, people_affected: e.target.value.replace(/\D/g, '') }))} />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Risk to people</label>
              <select className={styles.fieldInput} value={form.risk_level} onChange={e => setForm(f => ({ ...f, risk_level: e.target.value }))}>
                {RISK_LEVELS.map(r => <option key={r} value={r}>{cap(r)}</option>)}
              </select>
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>When you found out (blank = now)</label>
              <input className={styles.fieldInput} type="datetime-local" value={form.discovered_at ?? ''} onChange={e => setForm(f => ({ ...f, discovered_at: e.target.value }))} />
            </div>
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Actions taken so far</label>
            <textarea className={styles.fieldInput} style={{ width: '100%', minHeight: 60 }} value={form.actions_taken ?? ''} onChange={e => setForm(f => ({ ...f, actions_taken: e.target.value }))} />
          </div>
          <div className={styles.formActions}>
            <button className={`${styles.saveBtn} pressable`} style={{ background: sc }} onClick={create} disabled={busy || !(form.description ?? '').trim()}>
              {busy ? 'Saving…' : 'Log breach'}
            </button>
          </div>
        </div>
      )}

      {!list ? (
        <div className={styles.loadingList}>{[1, 2].map(i => <div key={i} className={styles.skeleton} />)}</div>
      ) : list.length === 0 ? (
        <div className={styles.empty}><p>No breaches logged.</p></div>
      ) : (
        <div className={styles.studentList}>
          {list.map(b => {
            const st: string = b.clock.state
            return (
              <div key={b.id} className={styles.studentRow} style={{ flexWrap: 'wrap', gap: 8 }}>
                <div className={styles.studentInfo} style={{ minWidth: 200, flex: 1 }}>
                  <p className={styles.studentName}>{b.description.length > 90 ? `${b.description.slice(0, 90)}…` : b.description}</p>
                  <div className={styles.studentMeta}>
                    <span>Found {new Date(b.discovered_at).toLocaleString()}</span>
                    <span>· {cap(b.risk_level)} risk</span>
                    {b.people_affected != null && <span>· {b.people_affected} people</span>}
                  </div>
                </div>
                {st === 'notified' && <Badge text="NDPC notified" tone="ok" />}
                {st === 'overdue' && <Badge text="72h passed, not notified" tone="bad" />}
                {st === 'due_soon' && <Badge text={`${b.clock.hoursRemaining}h left to notify`} tone="warn" />}
                {st === 'open' && <Badge text={`${b.clock.hoursRemaining}h left to notify`} tone="muted" />}
                {st !== 'notified' && (
                  <button className={`${styles.saveBtn} pressable`} style={{ background: sc }} onClick={() => patch(b.id, { ndpc_notified: true })}>Mark NDPC notified</button>
                )}
                {!b.individuals_notified_at && (
                  <button className={`${styles.cancelFormBtn} pressable`} onClick={() => patch(b.id, { individuals_notified: true })}>Mark people informed</button>
                )}
                <select className={styles.fieldInput} style={{ width: 120 }} value={b.status} onChange={e => patch(b.id, { status: e.target.value })}>
                  {BREACH_STATUSES.map(s => <option key={s} value={s}>{cap(s)}</option>)}
                </select>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
