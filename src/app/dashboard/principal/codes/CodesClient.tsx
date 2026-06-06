'use client'
// src/app/dashboard/principal/codes/CodesClient.tsx

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import styles from './codes.module.css'

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

const ROLE_META: Record<string, { color: string; icon: string; label: string }> = {
  student:   { color: '#10B981', icon: 'S', label: 'Student'   },
  teacher:   { color: '#3B82F6', icon: 'T', label: 'Teacher'   },
  bursar:    { color: '#F59E0B', icon: 'B', label: 'Bursar'    },
  secretary: { color: '#8B5CF6', icon: 'S', label: 'Secretary' },
  librarian: { color: '#EC4899', icon: 'L', label: 'Librarian' },
  nurse:     { color: '#EF4444', icon: 'N', label: 'Nurse'     },
  principal: { color: '#800020', icon: 'P', label: 'Principal' },
  parent:    { color: '#06B6D4', icon: 'P', label: 'Parent'    },
}
const ROLES_ASSIGNABLE = ['student','teacher','bursar','secretary','librarian','nurse','parent']

function roleMeta(role: string) {
  return ROLE_META[role] ?? { color: '#6B7280', icon: '?', label: role }
}

function makeCode(role: string) {
  const prefix = role.slice(0, 3).toUpperCase()
  const year   = new Date().getFullYear()
  const rand   = Math.floor(1000 + Math.random() * 9000)
  return `${prefix}-${year}-${rand}`
}

function makePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  const special = '@#$!'
  let pass = special[Math.floor(Math.random() * special.length)]
  for (let i = 0; i < 8; i++) pass += chars[Math.floor(Math.random() * chars.length)]
  return pass
}

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

interface GeneratedEntry extends BulkRow { code: string; password: string; saved: boolean; error: string | null }

export default function CodesClient({ entries: init, profile, school, userId, schoolId }: Props) {
  const supabase = createClient()
  const sc       = school?.primary_color ?? '#800020'

  const [entries,  setEntries]  = useState(init)
  const [search,   setSearch]   = useState('')
  const [roleTab,  setRoleTab]  = useState('all')
  const [copied,   setCopied]   = useState<string | null>(null)
  const [regen,    setRegen]    = useState<string | null>(null)
  const [tab,      setTab]      = useState<'existing' | 'single' | 'bulk'>('existing')

  const [sName,      setSName]      = useState('')
  const [sEmail,     setSEmail]     = useState('')
  const [sRole,      setSRole]      = useState('student')
  const [sResult,    setSResult]    = useState<GeneratedEntry | null>(null)
  const [sLoading,   setSLoading]   = useState(false)
  const [sError,     setSError]     = useState<string | null>(null)
  const [sCopiedPwd, setSCopiedPwd] = useState(false)

  const [bRaw,       setBRaw]      = useState('')
  const [bParsed,    setBParsed]   = useState<BulkRow[]>([])
  const [bResults,   setBResults]  = useState<GeneratedEntry[]>([])
  const [bLoading,   setBLoading]  = useState(false)
  const [bSaved,     setBSaved]    = useState(false)
  const [copiedAll,  setCopiedAll] = useState(false)
  const [copiedPwds, setCopiedPwds] = useState<Record<number, boolean>>({})

  const roles = useMemo(() => ['all', ...Array.from(new Set(entries.map(e => e.role))).sort()], [entries])

  const filtered = useMemo(() => entries.filter(e => {
    const q = search.toLowerCase()
    const matchSearch = (e.full_name ?? '').toLowerCase().includes(q)
      || (e.default_code ?? '').toLowerCase().includes(q)
      || (e.email ?? '').toLowerCase().includes(q)
    const matchRole = roleTab === 'all' || e.role === roleTab
    return matchSearch && matchRole
  }), [entries, search, roleTab])

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

  async function handleSingleGenerate() {
    if (!sName.trim() || !sEmail.trim()) { setSError('Name and email are required.'); return }
    setSError(null); setSLoading(true); setSResult(null)
    try {
      const res  = await fetch('/api/secretary/create-user', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          fullName: sName.trim(),
          email:    sEmail.trim().toLowerCase(),
          role:     sRole,
          schoolId,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to create user')
      // API returns the real code it generated — use that
      const code     = json.code     as string
      const password = json.password as string ?? ''   // returned from updated route
      setSResult({ full_name: sName, email: sEmail, role: sRole, code, password, saved: true, error: null })
      const { data: fresh } = await supabase
        .from('profiles').select('id,full_name,email,role,default_code,is_active,created_at')
        .eq('school_id', schoolId).order('role').order('full_name')
      if (fresh) setEntries(fresh)
      setSName(''); setSEmail(''); setSRole('student')
    } catch (err: any) {
      const msg = err.message ?? 'Failed to save'
      setSError(msg)
      setSResult({ full_name: sName, email: sEmail, role: sRole, code: '—', password: '—', saved: false, error: msg })
    }
    setSLoading(false)
  }

  function handleBulkParse() {
    const rows = parseBulk(bRaw)
    setBParsed(rows)
    setBResults(rows.map(r => ({ ...r, code: makeCode(r.role), password: makePassword(), saved: false, error: null })))
    setBSaved(false)
  }

  async function handleBulkSave() {
    if (!bResults.length) return
    setBLoading(true)
    // Call API for each row so auth users are created properly
    const updated = await Promise.all(
      bResults.map(async (r, i) => {
        try {
          const res  = await fetch('/api/secretary/create-user', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
              fullName: r.full_name,
              email:    r.email.toLowerCase(),
              role:     r.role,
              schoolId,
            }),
          })
          const json = await res.json()
          if (!res.ok) return { ...r, error: json.error ?? 'Failed', saved: false }
          return { ...r, code: json.code ?? r.code, password: json.password ?? r.password, saved: true, error: null }
        } catch (e: any) {
          return { ...r, error: e.message ?? 'Network error', saved: false }
        }
      })
    )
    setBResults(updated)
    const allSaved = updated.every(r => r.saved)
    if (allSaved) {
      setBSaved(true)
      const { data: fresh } = await supabase
        .from('profiles').select('id,full_name,email,role,default_code,is_active,created_at')
        .eq('school_id', schoolId).order('role').order('full_name')
      if (fresh) setEntries(fresh)
    }
    setBLoading(false)
  }

  async function copyAllCodes(list: GeneratedEntry[]) {
    const text = list.map(r => `${r.full_name} | ${roleMeta(r.role).label} | Code: ${r.code} | Password: ${r.password}`).join('\n')
    await navigator.clipboard.writeText(text).catch(() => {})
    setCopiedAll(true)
    setTimeout(() => setCopiedAll(false), 2500)
  }

  const RoleChip = ({ r }: { r: string }) => {
    const m = roleMeta(r)
    const isActive = roleTab === r
    const count = entries.filter(e => r === 'all' || e.role === r).length
    return (
      <button onClick={() => setRoleTab(r)} className={styles.roleChip}
        style={{
          background:  isActive ? m.color + '22' : 'var(--glass-bg)',
          borderColor: isActive ? m.color : 'var(--glass-border)',
          color:       isActive ? m.color : 'var(--text-muted)',
        }}>
        {r === 'all' ? 'All' : m.label} ({count})
      </button>
    )
  }

  return (
    <RolePageWrapper userId={userId} role="principal" profile={profile} school={school} title="Access Codes">

      <div className={styles.tabRow}>
        {(['existing','single','bulk'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`${styles.tabBtn} ${tab === t ? styles.tabActive : ''}`}>
            {t === 'existing' && 'Existing Codes'}
            {t === 'single'   && 'Generate Single'}
            {t === 'bulk'     && 'Bulk Generate'}
          </button>
        ))}
      </div>

      {tab === 'existing' && (
        <>
          <div className={styles.infoBanner}>
            <div>
              <p className={styles.infoBannerTitle}>Access Codes</p>
              <p className={styles.infoBannerSub}>Each user has a unique login code. Share it with them to access SchoolOS. You can regenerate a code if it has been compromised.</p>
            </div>
          </div>

          <div className={styles.searchWrap}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input className={styles.searchInput} placeholder="Search by name, email or code..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          <div className={styles.roleTabs}>
            {roles.map(r => <RoleChip key={r} r={r} />)}
          </div>

          {filtered.length === 0 ? (
            <div className={styles.empty}>
              <p className={styles.emptyIcon}>No users found</p>
            </div>
          ) : (
            <div className={styles.codeList}>
              {filtered.map(e => {
                const m = roleMeta(e.role)
                return (
                  <div key={e.id} className={styles.codeRow}>
                    <div className={styles.avatar} style={{ background: m.color + '22' }}>
                      <span style={{ fontSize: '1rem', fontWeight: 700, color: m.color }}>{m.icon}</span>
                    </div>
                    <div className={styles.codeRowInfo}>
                      <p className={styles.codeRowName}>{e.full_name}</p>
                      <p className={styles.codeRowEmail}>{e.email}</p>
                    </div>
                    <span className={styles.roleBadge} style={{ background: m.color + '18', color: m.color, borderColor: m.color + '44' }}>
                      {m.label}
                    </span>
                    <code className={styles.codeChip} style={{ background: sc + '15', color: sc }}>
                      {e.default_code}
                    </code>
                    <div className={styles.codeRowActions}>
                      <button onClick={() => copyCode(e.default_code, e.id)} className={styles.actionBtn}
                        style={copied === e.id ? { background: '#10B98122', borderColor: '#10B981', color: '#10B981' } : {}}>
                        {copied === e.id ? 'Copied' : 'Copy'}
                      </button>
                      <button onClick={() => regenerateCode(e)} disabled={regen === e.id} className={styles.actionBtn}
                        style={{ opacity: regen === e.id ? 0.5 : 1 }}>
                        {regen === e.id ? 'Wait...' : 'Regen'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {tab === 'single' && (
        <div className={styles.twoCol}>
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
                    <option key={r} value={r}>{roleMeta(r).label}</option>
                  ))}
                </select>
              </div>
              {sError && <p className={styles.errorMsg}>{sError}</p>}
              <button onClick={handleSingleGenerate} disabled={sLoading} className={styles.generateBtn}>
                {sLoading ? 'Generating...' : 'Generate and Save Code'}
              </button>
            </div>
          </div>

          {sResult && (
            <div className={`${styles.resultCard} ${sResult.saved ? styles.resultSuccess : styles.resultError}`}>
              <div className={styles.resultHeader}>
                <span className={styles.resultStatus}>
                  {sResult.saved ? 'Code Generated' : 'Failed to Save'}
                </span>
              </div>
              <div className={styles.bigCodeWrap}>
                <p className={styles.bigCodeLabel}>Access Code</p>
                <div className={styles.bigCode}>
                  <code className={styles.bigCodeText}>{sResult.code}</code>
                  <button onClick={() => copyCode(sResult.code, 'single')} className={styles.copyBtn}
                    style={copied === 'single' ? { background: '#10B98122', borderColor: '#10B981', color: '#10B981' } : {}}>
                    {copied === 'single' ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
              <div className={styles.bigCodeWrap} style={{ marginTop: 'var(--space-3)' }}>
                <p className={styles.bigCodeLabel}>Temporary Password</p>
                <div className={styles.bigCode} style={{ borderColor: '#F59E0B33', background: '#F59E0B0A' }}>
                  <code className={styles.bigCodeText} style={{ color: '#F59E0B' }}>{sResult.password}</code>
                  <button
                    onClick={async () => { await navigator.clipboard.writeText(sResult!.password).catch(() => {}); setSCopiedPwd(true); setTimeout(() => setSCopiedPwd(false), 2000) }}
                    className={styles.copyBtn}
                    style={sCopiedPwd ? { background: '#10B98122', borderColor: '#10B981', color: '#10B981' } : { borderColor: '#F59E0B55', color: '#F59E0B' }}>
                    {sCopiedPwd ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <p style={{ fontSize: '0.72rem', color: '#F59E0B', marginTop: 6, opacity: 0.85 }}>
                  ⚠️ Share this with the user. They must change it on first login.
                </p>
              </div>
              {(() => {
                const m = roleMeta(sResult.role)
                return (
                  <div className={styles.ownerCard}>
                    <div className={styles.ownerAvatar} style={{ background: m.color + '22', color: m.color }}>{m.icon}</div>
                    <div className={styles.ownerInfo}>
                      <p className={styles.ownerName}>{sResult.full_name}</p>
                      <p className={styles.ownerEmail}>{sResult.email}</p>
                      <span className={styles.roleBadge} style={{ background: m.color + '18', color: m.color, borderColor: m.color + '44' }}>
                        {m.label}
                      </span>
                    </div>
                  </div>
                )
              })()}
              <p className={styles.codeNote}>
                {sResult.saved
                  ? 'User profile created. Share the code above with them to use as their initial login password.'
                  : sResult.error}
              </p>
            </div>
          )}
        </div>
      )}

      {tab === 'bulk' && (
        <>
          <div className={styles.formCard} style={{ marginBottom: 'var(--space-5)' }}>
            <div className={styles.formHeader}>
              <p className={styles.formTitle}>Bulk Generate Codes</p>
              <p className={styles.formSub}>Paste one user per line: Full Name, Email, Role</p>
            </div>
            <div className={styles.formBody}>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>User Data (CSV format)</label>
                <textarea
                  className={`${styles.fieldInput} ${styles.textarea}`}
                  rows={8}
                  placeholder={'Amara Osei, amara@school.edu, student\nKwame Mensah, kwame@school.edu, teacher\nAfia Boateng, afia@school.edu, bursar'}
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
                        {m.label}
                      </span>
                    )
                  })}
                </div>
              </div>
              <button onClick={handleBulkParse} className={styles.previewBtn} disabled={!bRaw.trim()}>
                Preview Generated Codes
              </button>
            </div>
          </div>

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
                    {copiedAll ? 'All Copied' : 'Copy All'}
                  </button>
                  {!bSaved && (
                    <button onClick={handleBulkSave} disabled={bLoading} className={styles.generateBtn} style={{ width: 'auto', padding: '10px 24px' }}>
                      {bLoading ? 'Saving...' : `Save All ${bResults.length} Users`}
                    </button>
                  )}
                  {bSaved && (
                    <span className={styles.savedBadge}>All Saved</span>
                  )}
                </div>
              </div>
              <div className={styles.bulkTableHead}>
                <span>USER</span>
                <span>ROLE</span>
                <span>ACCESS CODE</span>
                <span>PASSWORD</span>
                <span>STATUS</span>
              </div>
              <div className={styles.bulkTableBody}>
                {bResults.map((r, i) => {
                  const m = roleMeta(r.role)
                  return (
                    <div key={i} className={styles.bulkRow}>
                      <div className={styles.bulkUser}>
                        <div className={styles.avatarSm} style={{ background: m.color + '22', color: m.color, fontWeight: 700, fontSize: '0.75rem' }}>{m.icon}</div>
                        <div>
                          <p className={styles.bulkName}>{r.full_name}</p>
                          <p className={styles.bulkEmail}>{r.email}</p>
                        </div>
                      </div>
                      <span className={styles.roleBadge} style={{ background: m.color + '18', color: m.color, borderColor: m.color + '44' }}>
                        {m.label}
                      </span>
                      <code className={styles.codeChip} style={{ background: sc + '15', color: sc }}>
                        {r.code}
                      </code>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <code className={styles.codeChip} style={{ background: '#F59E0B15', color: '#F59E0B' }}>
                          {r.password}
                        </code>
                        <button
                          onClick={async () => { await navigator.clipboard.writeText(r.password).catch(() => {}); setCopiedPwds(p => ({ ...p, [i]: true })); setTimeout(() => setCopiedPwds(p => ({ ...p, [i]: false })), 2000) }}
                          className={styles.actionBtn}
                          style={copiedPwds[i] ? { background: '#10B98122', borderColor: '#10B981', color: '#10B981' } : { borderColor: '#F59E0B55', color: '#F59E0B' }}>
                          {copiedPwds[i] ? '✓' : 'Copy'}
                        </button>
                      </div>
                      <span className={styles.statusDot}
                        style={{ color: r.error ? '#EF4444' : r.saved ? '#10B981' : 'var(--text-muted)' }}>
                        {r.error ? 'Error' : r.saved ? 'Saved' : 'Pending'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {bResults.length === 0 && bRaw.trim() && bParsed.length === 0 && (
            <div className={styles.empty}>
              <p className={styles.emptyIcon}>No valid rows found</p>
              <p className={styles.emptySub}>Check that roles are spelled correctly and each line has Name, Email, Role.</p>
            </div>
          )}
        </>
      )}

      <div style={{ height: 110 }} />
    </RolePageWrapper>
  )
                                                                        }
        
