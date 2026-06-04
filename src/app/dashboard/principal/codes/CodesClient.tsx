'use client'
// src/app/dashboard/principal/codes/CodesClient.tsx

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import styles from './codes.module.css'

/* ─── Types ──────────────────────────────────────────────── */
interface CodeEntry {
  id: string
  full_name: string
  email: string
  role: string
  default_code: string
  is_active: boolean
  created_at: string
}

interface Props {
  entries: CodeEntry[]
  profile: any
  school: any
  userId: string
  schoolId: string
}

/* ─── Constants ──────────────────────────────────────────── */
const ROLE_META: Record<string, { color: string; icon: string; label: string }> = {
  student:   { color: '#10B981', icon: '🎓', label: 'Student'   },
  teacher:   { color: '#3B82F6', icon: '📚', label: 'Teacher'   },
  bursar:    { color: '#F59E0B', icon: '💰', label: 'Bursar'    },
  secretary: { color: '#8B5CF6', icon: '🗂️',  label: 'Secretary' },
  librarian: { color: '#EC4899', icon: '📖', label: 'Librarian' },
  nurse:     { color: '#EF4444', icon: '🏥', label: 'Nurse'     },
  principal: { color: '#800020', icon: '🏫', label: 'Principal' },
  parent:    { color: '#06B6D4', icon: '👨‍👩‍👧', label: 'Parent'    },
}
const ROLES_ASSIGNABLE = ['student','teacher','bursar','secretary','librarian','nurse','parent']

function roleMeta(role: string) {
  return ROLE_META[role] ?? { color: '#6B7280', icon: '👤', label: role }
}

/* ─── Code generator ─────────────────────────────────────── */
function makeCode(role: string) {
  const prefix = role.slice(0, 3).toUpperCase()
  const year   = new Date().getFullYear()
  const rand   = Math.floor(1000 + Math.random() * 9000)
  return `${prefix}-${year}-${rand}`
}

/* ─── Bulk CSV parser ────────────────────────────────────── */
interface BulkRow { full_name: string; email: string; role: string }
function parseBulk(raw: string): BulkRow[] {
  return raw
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(line => {
      const [full_name, email, role] = line.split(',').map(s => s.trim())
      return { full_name: full_name ?? '', email: email ?? '', role: (role ?? '').toLowerCase() }
    })
    .filter(r => r.full_name && r.email && ROLES_ASSIGNABLE.includes(r.role))
}

/* ─── Generated preview row ──────────────────────────────── */
interface GeneratedEntry extends BulkRow { code: string; saved: boolean; error: string | null }

/* ═══════════════════════════════════════════════════════════
   Component
═══════════════════════════════════════════════════════════ */
export default function CodesClient({ entries: init, profile, school, userId, schoolId }: Props) {
  const supabase = createClient()
  const sc       = school?.primary_color ?? '#800020'

  /* ── Existing entries state ── */
  const [entries,  setEntries]  = useState(init)
  const [search,   setSearch]   = useState('')
  const [roleTab,  setRoleTab]  = useState('all')
  const [copied,   setCopied]   = useState<string | null>(null)
  const [regen,    setRegen]    = useState<string | null>(null)

  /* ── Tab ── */
  const [tab, setTab] = useState<'existing' | 'single' | 'bulk'>('existing')

  /* ── Single-generate form ── */
  const [sName,    setSName]    = useState('')
  const [sEmail,   setSEmail]   = useState('')
  const [sRole,    setSRole]    = useState('student')
  const [sResult,  setSResult]  = useState<GeneratedEntry | null>(null)
  const [sLoading, setSLoading] = useState(false)
  const [sError,   setSError]   = useState<string | null>(null)

  /* ── Bulk-generate form ── */
  const [bRaw,      setBRaw]     = useState('')
  const [bParsed,   setBParsed]  = useState<BulkRow[]>([])
  const [bResults,  setBResults] = useState<GeneratedEntry[]>([])
  const [bLoading,  setBLoading] = useState(false)
  const [bSaved,    setBSaved]   = useState(false)

  /* ── Copied-all ── */
  const [copiedAll, setCopiedAll] = useState(false)

  /* ─── Filtered existing list ─── */
  const roles = useMemo(() => ['all', ...Array.from(new Set(entries.map(e => e.role))).sort()], [entries])

  const filtered = useMemo(() => entries.filter(e => {
    const q = search.toLowerCase()
    const matchSearch = (e.full_name ?? '').toLowerCase().includes(q)
      || (e.default_code ?? '').toLowerCase().includes(q)
      || (e.email ?? '').toLowerCase().includes(q)
    const matchRole = roleTab === 'all' || e.role === roleTab
    return matchSearch && matchRole
  }), [entries, search, roleTab])

  /* ─── Regen existing ─── */
  async function regenerateCode(entry: CodeEntry) {
    setRegen(entry.id)
    const newCode = makeCode(entry.role)
    const { error } = await supabase.from('profiles').update({ default_code: newCode }).eq('id', entry.id)
    if (!error) setEntries(p => p.map(e => e.id === entry.id ? { ...e, default_code: newCode } : e))
    setRegen(null)
  }

  async function copyCode(code: string, id: string) {
    await navigator.clipboard.writeText(code).catch(() => {})
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  /* ─── Single generate & save ─── */
  async function handleSingleGenerate() {
    if (!sName.trim() || !sEmail.trim()) { setSError('Name and email are required.'); return }
    setSError(null); setSLoading(true); setSResult(null)

    const code = makeCode(sRole)
    // Upsert a new profile row
    const { error } = await supabase.from('profiles').insert({
      full_name:    sName.trim(),
      email:        sEmail.trim().toLowerCase(),
      role:         sRole,
      default_code: code,
      school_id:    schoolId,
      is_active:    true,
    })

    if (error) {
      setSError(error.message)
      setSResult({ full_name: sName, email: sEmail, role: sRole, code, saved: false, error: error.message })
    } else {
      setSResult({ full_name: sName, email: sEmail, role: sRole, code, saved: true, error: null })
      // refresh local list
      const { data: fresh } = await supabase
        .from('profiles').select('id,full_name,email,role,default_code,is_active,created_at')
        .eq('school_id', schoolId).order('role').order('full_name')
      if (fresh) setEntries(fresh)
      setSName(''); setSEmail(''); setSRole('student')
    }
    setSLoading(false)
  }

  /* ─── Bulk parse preview ─── */
  function handleBulkParse() {
    const rows = parseBulk(bRaw)
    setBParsed(rows)
    setBResults(rows.map(r => ({ ...r, code: makeCode(r.role), saved: false, error: null })))
    setBSaved(false)
  }

  /* ─── Bulk save all ─── */
  async function handleBulkSave() {
    if (!bResults.length) return
    setBLoading(true)
    const rows = bResults.map(r => ({
      full_name:    r.full_name,
      email:        r.email.toLowerCase(),
      role:         r.role,
      default_code: r.code,
      school_id:    schoolId,
      is_active:    true,
    }))
    const { error } = await supabase.from('profiles').insert(rows)
    if (error) {
      setBResults(p => p.map(r => ({ ...r, error: error.message })))
    } else {
      setBResults(p => p.map(r => ({ ...r, saved: true, error: null })))
      setBSaved(true)
      const { data: fresh } = await supabase
        .from('profiles').select('id,full_name,email,role,default_code,is_active,created_at')
        .eq('school_id', schoolId).order('role').order('full_name')
      if (fresh) setEntries(fresh)
    }
    setBLoading(false)
  }

  /* ─── Copy all generated codes ─── */
  async function copyAllCodes(list: GeneratedEntry[]) {
    const text = list.map(r => `${r.full_name} | ${roleMeta(r.role).label} | ${r.code}`).join('\n')
    await navigator.clipboard.writeText(text).catch(() => {})
    setCopiedAll(true)
    setTimeout(() => setCopiedAll(false), 2500)
  }

  /* ═══ RENDER ═══════════════════════════════════════════ */
  return (
    <RolePageWrapper userId={userId} role="principal" profile={profile} school={school} title="Access Codes">

      {/* ── Tab switcher ── */}
      <div className={styles.tabRow}>
        {(['existing','single','bulk'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`${styles.tabBtn} ${tab === t ? styles.tabActive : ''}`}>
            {t === 'existing' && '🔑 Existing Codes'}
            {t === 'single'   && '✨ Generate Single'}
            {t === 'bulk'     && '📦 Bulk Generate'}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════
          TAB 1 — EXISTING CODES
      ════════════════════════════════════ */}
      {tab === 'existing' && (
        <>
          {/* Info banner */}
          <div className={styles.infoBanner}>
            <span className={styles.infoBannerIcon}>🔐</span>
            <div>
              <p className={styles.infoBannerTitle}>Access Codes</p>
              <p className={styles.infoBannerSub}>Each user has a unique login code. Share it with them to access SchoolOS. You can regenerate a code if it's been compromised.</p>
            </div>
          </div>

          {/* Search */}
          <div className={styles.searchWrap}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input className={styles.searchInput} placeholder="Search by name, email or code…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          {/* Role tabs */}
          <div className={styles.roleTabs}>
            {roles.map(r => {
              const m = roleMeta(r)
              const isActive = roleTab === r
              const count = entries.filter(e => r === 'all' || e.role === r).length
              return (
                <button key={r} onClick={() => setRoleTab(r)} className={styles.roleChip}
                  style={{
                    background:   isActive ? m.color + '22' : 'var(--glass-bg)',
                    borderColor:  isActive ? m.color : 'var(--glass-border)',
                    color:        isActive ? m.color : 'var(--text-muted)',
                  }}>
                  {r === 'all' ? 'All' : m.label} ({count})
                </button>
              )
            })}
          </div>

          {/* Code table */}
          {filtered.length === 0 ? (
            <div className={styles.empty}><p className={styles.emptyIcon}>🔑</p><p className={styles.emptyTitle}>No users found</p></div>
          ) : (
            <div className={styles.codeList}>
              {filtered.map(e => {
                const m = roleMeta(e.role)
                return (
                  <div key={e.id} className={styles.codeRow}>
                    {/* Avatar */}
                    <div className={styles.avatar} style={{ background: m.color + '22' }}>
                      <span>{m.icon}</span>
                    </div>

                    {/* Info */}
                    <div className={styles.codeRowInfo}>
                      <p className={styles.codeRowName}>{e.full_name}</p>
                      <p className={styles.codeRowEmail}>{e.email}</p>
                    </div>

                    {/* Role badge */}
                    <span className={styles.roleBadge} style={{ background: m.color + '18', color: m.color, borderColor: m.color + '44' }}>
                      {m.icon} {m.label}
                    </span>

                    {/* Code chip */}
                    <code className={styles.codeChip} style={{ background: sc + '15', color: sc }}>
                      {e.default_code}
                    </code>

                    {/* Actions */}
                    <div className={styles.codeRowActions}>
                      <button onClick={() => copyCode(e.default_code, e.id)} className={styles.actionBtn}
                        style={copied === e.id ? { background: '#10B98122', borderColor: '#10B981', color: '#10B981' } : {}}>
                        {copied === e.id ? '✓ Copied' : '📋 Copy'}
                      </button>
                      <button onClick={() => regenerateCode(e)} disabled={regen === e.id} className={styles.actionBtn}
                        style={{ opacity: regen === e.id ? 0.5 : 1 }}>
                        {regen === e.id ? '⏳' : '🔄 Regen'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ════════════════════════════════════
          TAB 2 — SINGLE GENERATE
      ════════════════════════════════════ */}
      {tab === 'single' && (
        <div className={styles.twoCol}>
          {/* Form */}
          <div className={styles.formCard}>
            <div className={styles.formHeader}>
              <p className={styles.formTitle}>Generate Single Code</p>
              <p className={styles.formSub}>Create a login code for one user and save them to the system.</p>
            </div>
            <div className={styles.formBody}>

              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Full Name</label>
                <input className={styles.fieldInput} placeholder="e.g. Amara Osei" value={sName} onChange={e => setSName(e.target.value)} />
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Email Address</label>
                <input className={styles.fieldInput} type="email" placeholder="e.g. amara@school.edu" value={sEmail} onChange={e => setSEmail(e.target.value)} />
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Role</label>
                <select className={`${styles.fieldInput} ${styles.fieldSelect}`} value={sRole} onChange={e => setSRole(e.target.value)}>
                  {ROLES_ASSIGNABLE.map(r => (
                    <option key={r} value={r}>{roleMeta(r).icon} {roleMeta(r).label}</option>
                  ))}
                </select>
              </div>

              {sError && <p className={styles.errorMsg}>{sError}</p>}

              <button onClick={handleSingleGenerate} disabled={sLoading} className={styles.generateBtn}>
                {sLoading ? '⏳ Generating…' : '✨ Generate & Save Code'}
              </button>
            </div>
          </div>

          {/* Result */}
          {sResult && (
            <div className={`${styles.resultCard} ${sResult.saved ? styles.resultSuccess : styles.resultError}`}>
              <div className={styles.resultHeader}>
                <span className={styles.resultStatus}>
                  {sResult.saved ? '✅ Code Generated' : '❌ Failed to Save'}
                </span>
              </div>

              {/* Big code display */}
              <div className={styles.bigCodeWrap}>
                <p className={styles.bigCodeLabel}>Access Code</p>
                <div className={styles.bigCode}>
                  <code className={styles.bigCodeText}>{sResult.code}</code>
                  <button onClick={() => copyCode(sResult.code, 'single')} className={styles.copyBtn}
                    style={copied === 'single' ? { background: '#10B98122', borderColor: '#10B981', color: '#10B981' } : {}}>
                    {copied === 'single' ? '✓ Copied' : '📋 Copy'}
                  </button>
                </div>
              </div>

              {/* Owner info */}
              <div className={styles.ownerCard}>
                {(() => { const m = roleMeta(sResult.role); return (
                  <>
                    <div className={styles.ownerAvatar} style={{ background: m.color + '22' }}>{m.icon}</div>
                    <div className={styles.ownerInfo}>
                      <p className={styles.ownerName}>{sResult.full_name}</p>
                      <p className={styles.ownerEmail}>{sResult.email}</p>
                      <span className={styles.roleBadge} style={{ background: m.color + '18', color: m.color, borderColor: m.color + '44' }}>
                        {m.label}
                      </span>
                    </div>
                  </>
                )})()}
              </div>

              <p className={styles.codeNote}>
                {sResult.saved
                  ? 'User profile created. Share the code above with them — they'll use it as their initial login password.'
                  : sResult.error}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════
          TAB 3 — BULK GENERATE
      ════════════════════════════════════ */}
      {tab === 'bulk' && (
        <>
          <div className={styles.formCard} style={{ marginBottom: 'var(--space-5)' }}>
            <div className={styles.formHeader}>
              <p className={styles.formTitle}>Bulk Generate Codes</p>
              <p className={styles.formSub}>Paste one user per line in the format: <code className={styles.inlineCode}>Full Name, Email, Role</code></p>
            </div>
            <div className={styles.formBody}>

              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>User Data (CSV format)</label>
                <textarea
                  className={`${styles.fieldInput} ${styles.textarea}`}
                  rows={8}
                  placeholder={`Amara Osei, amara@school.edu, student\nKwame Mensah, kwame@school.edu, teacher\nAfia Boateng, afia@school.edu, bursar`}
                  value={bRaw}
                  onChange={e => { setBRaw(e.target.value); setBParsed([]); setBResults([]) }}
                />
              </div>

              <div className={styles.bulkRoleHints}>
                <p className={styles.fieldLabel}>Valid roles:</p>
                <div className={styles.roleTags}>
                  {ROLES_ASSIGNABLE.map(r => {
                    const m = roleMeta(r)
                    return (
                      <span key={r} className={styles.roleTag} style={{ background: m.color + '18', color: m.color, borderColor: m.color + '33' }}>
                        {m.icon} {m.label}
                      </span>
                    )
                  })}
                </div>
              </div>

              <button onClick={handleBulkParse} className={styles.previewBtn} disabled={!bRaw.trim()}>
                🔍 Preview Generated Codes
              </button>
            </div>
          </div>

          {/* Preview table */}
          {bResults.length > 0 && (
            <div className={styles.bulkPreviewCard}>
              <div className={styles.bulkPreviewHeader}>
                <div>
                  <p className={styles.formTitle}>{bResults.length} Code{bResults.length !== 1 ? 's' : ''} Ready</p>
                  <p className={styles.formSub}>Review before saving. Each code is unique and tied to the user below.</p>
                </div>
                <div className={styles.bulkActions}>
                  <button onClick={() => copyAllCodes(bResults)} className={styles.copyAllBtn}
                    style={copiedAll ? { borderColor: '#10B981', color: '#10B981' } : {}}>
                    {copiedAll ? '✓ All Copied' : '📋 Copy All'}
                  </button>
                  {!bSaved && (
                    <button onClick={handleBulkSave} disabled={bLoading} className={styles.generateBtn} style={{ width: 'auto', padding: '10px 24px' }}>
                      {bLoading ? '⏳ Saving…' : `💾 Save All ${bResults.length} Users`}
                    </button>
                  )}
                  {bSaved && (
                    <span className={styles.savedBadge}>✅ All Saved</span>
                  )}
                </div>
              </div>

              {/* Column headers */}
              <div className={styles.bulkTableHead}>
                <span>USER</span>
                <span>ROLE</span>
                <span>ACCESS CODE</span>
                <span>STATUS</span>
    
