'use client'

import { useState, useTransition, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'

// ─── Types ────────────────────────────────────────────────────────────────────

type Entry = {
  id: string
  full_name: string | null
  email: string | null
  role: string | null
  default_code: string | null
  is_active: boolean
  created_at: string
}

type Props = {
  entries: Entry[]
  profile: any
  school: any
  userId: string
}

type GeneratedCode = {
  userId: string
  full_name: string
  email: string
  role: string
  code: string
  generatedAt: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ROLE_META: Record<string, { label: string; color: string; dot: string }> = {
  principal:  { label: 'Principal',  color: 'bg-violet-500/15 text-violet-300 border-violet-500/30',  dot: 'bg-violet-400' },
  teacher:    { label: 'Teacher',    color: 'bg-blue-500/15 text-blue-300 border-blue-500/30',        dot: 'bg-blue-400'   },
  secretary:  { label: 'Secretary',  color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', dot: 'bg-emerald-400' },
  student:    { label: 'Student',    color: 'bg-amber-500/15 text-amber-300 border-amber-500/30',     dot: 'bg-amber-400'  },
  parent:     { label: 'Parent',     color: 'bg-rose-500/15 text-rose-300 border-rose-500/30',        dot: 'bg-rose-400'   },
}

function getRoleMeta(role: string | null) {
  return ROLE_META[role ?? ''] ?? { label: role ?? 'Unknown', color: 'bg-zinc-700/50 text-zinc-400 border-zinc-600', dot: 'bg-zinc-500' }
}

function generateCode(length = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

function formatCode(code: string): string {
  // Format as XXXX-XXXX for 8-char codes
  if (code.length === 8) return `${code.slice(0, 4)}-${code.slice(4)}`
  return code
}

function timestamp(): string {
  return new Date().toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string | null }) {
  const meta = getRoleMeta(role)
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium border ${meta.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  )
}

function CodeBadge({ code, onClick }: { code: string; onClick: () => void }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
    onClick()
  }

  return (
    <button
      onClick={handleCopy}
      title="Click to copy"
      className="group flex items-center gap-2 font-mono text-sm font-bold tracking-widest text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 rounded-lg hover:bg-emerald-500/20 transition-all duration-150"
    >
      {formatCode(code)}
      <span className="text-[10px] text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity">
        {copied ? '✓' : 'COPY'}
      </span>
    </button>
  )
}

function GeneratedCodeCard({ item }: { item: GeneratedCode }) {
  const [copied, setCopied] = useState(false)
  const meta = getRoleMeta(item.role)

  const handleCopy = () => {
    navigator.clipboard.writeText(item.code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="group relative bg-[#141416] border border-zinc-800 hover:border-zinc-600 rounded-xl p-4 transition-all duration-200">
      {/* Top: name + role */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">{item.full_name}</p>
          <p className="text-xs text-zinc-500 truncate mt-0.5">{item.email}</p>
        </div>
        <RoleBadge role={item.role} />
      </div>

      {/* Code display */}
      <div className="flex items-center justify-between bg-zinc-900 border border-zinc-700/50 rounded-lg px-4 py-3">
        <span className="font-mono text-base font-black tracking-[0.25em] text-white">
          {formatCode(item.code)}
        </span>
        <button
          onClick={handleCopy}
          className="text-xs font-medium text-zinc-400 hover:text-white transition-colors ml-3"
        >
          {copied ? (
            <span className="text-emerald-400">✓ Copied</span>
          ) : (
            'Copy'
          )}
        </button>
      </div>

      {/* Footer */}
      <p className="text-[10px] text-zinc-600 mt-2">Generated {item.generatedAt}</p>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CodesClient({ entries, profile, school, userId }: Props) {
  const supabase = createClient()
  const [isPending, startTransition] = useTransition()

  // UI state
  const [search, setSearch]             = useState('')
  const [roleFilter, setRoleFilter]     = useState<string>('all')
  const [activeTab, setActiveTab]       = useState<'roster' | 'generated'>('roster')
  const [generatedCodes, setGeneratedCodes] = useState<GeneratedCode[]>([])
  const [savingIds, setSavingIds]       = useState<Set<string>>(new Set())
  const [savedIds, setSavedIds]         = useState<Set<string>>(new Set())
  const [bulkGenerating, setBulkGenerating] = useState(false)
  const [toast, setToast]               = useState<string | null>(null)
  const [localCodes, setLocalCodes]     = useState<Record<string, string>>({}) // userId → new code (not yet saved)

  // Derived
  const allRoles = useMemo(() => {
    const set = new Set(entries.map(e => e.role ?? '').filter(Boolean))
    return Array.from(set).sort()
  }, [entries])

  const filtered = useMemo(() => {
    return entries.filter(e => {
      const matchRole = roleFilter === 'all' || e.role === roleFilter
      const q = search.toLowerCase()
      const matchSearch =
        !q ||
        (e.full_name ?? '').toLowerCase().includes(q) ||
        (e.email ?? '').toLowerCase().includes(q) ||
        (e.role ?? '').toLowerCase().includes(q)
      return matchRole && matchSearch
    })
  }, [entries, search, roleFilter])

  // Stats
  const stats = useMemo(() => ({
    total: entries.length,
    withCode: entries.filter(e => e.default_code).length,
    withoutCode: entries.filter(e => !e.default_code).length,
    roles: allRoles.length,
  }), [entries, allRoles])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  // ── Single generate ──────────────────────────────────────────────────────
  function handleGenerateSingle(entry: Entry) {
    const code = generateCode()
    setLocalCodes(prev => ({ ...prev, [entry.id]: code }))

    const newEntry: GeneratedCode = {
      userId:      entry.id,
      full_name:   entry.full_name ?? '—',
      email:       entry.email ?? '',
      role:        entry.role ?? '',
      code,
      generatedAt: timestamp(),
    }

    setGeneratedCodes(prev => {
      // Replace if already exists for this user
      const without = prev.filter(g => g.userId !== entry.id)
      return [newEntry, ...without]
    })
  }

  // ── Save single code to DB ───────────────────────────────────────────────
  async function handleSaveCode(userId: string) {
    const code = localCodes[userId]
    if (!code) return

    setSavingIds(prev => new Set(prev).add(userId))
    const { error } = await supabase
      .from('profiles')
      .update({ default_code: code })
      .eq('id', userId)

    setSavingIds(prev => { const s = new Set(prev); s.delete(userId); return s })

    if (!error) {
      setSavedIds(prev => new Set(prev).add(userId))
      setTimeout(() => setSavedIds(prev => { const s = new Set(prev); s.delete(userId); return s }), 2500)
      setLocalCodes(prev => { const n = { ...prev }; delete n[userId]; return n })
      showToast('Code saved to profile')
    } else {
      showToast('Failed to save — please retry')
    }
  }

  // ── Bulk generate + save ─────────────────────────────────────────────────
  async function handleBulkGenerate() {
    if (filtered.length === 0) return
    setBulkGenerating(true)

    const batch: GeneratedCode[] = filtered.map(entry => ({
      userId:      entry.id,
      full_name:   entry.full_name ?? '—',
      email:       entry.email ?? '',
      role:        entry.role ?? '',
      code:        generateCode(),
      generatedAt: timestamp(),
    }))

    // Upsert all codes
    const updates = batch.map(b => ({
      id:           b.userId,
      default_code: b.code,
    }))

    const { error } = await supabase
      .from('profiles')
      .upsert(updates, { onConflict: 'id' })

    setBulkGenerating(false)

    if (!error) {
      setGeneratedCodes(prev => {
        const existingIds = new Set(batch.map(b => b.userId))
        const without = prev.filter(g => !existingIds.has(g.userId))
        return [...batch, ...without]
      })
      setActiveTab('generated')
      showToast(`${batch.length} codes generated & saved`)
    } else {
      showToast('Bulk generation failed — please retry')
    }
  }

  // ── Export CSV ────────────────────────────────────────────────────────────
  function handleExport() {
    if (generatedCodes.length === 0) return
    const header = 'Name,Email,Role,Code,Generated At'
    const rows = generatedCodes.map(g =>
      `"${g.full_name}","${g.email}","${g.role}","${g.code}","${g.generatedAt}"`
    )
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `access-codes-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
    showToast('CSV exported')
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0c0c0e] text-white font-sans">
      {/* ── Toast ── */}
      {toast && (
        <div className="fixed top-5 right-5 z-50 bg-zinc-800 border border-zinc-600 text-sm text-white px-4 py-2.5 rounded-xl shadow-xl animate-fade-in">
          {toast}
        </div>
      )}

      <div className="max-w-6xl mx-auto px-6 py-10 space-y-8">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium tracking-widest text-zinc-500 uppercase mb-1">
              {school?.name ?? 'School'} · Principal
            </p>
            <h1 className="text-2xl font-black tracking-tight text-white">Access Codes</h1>
            <p className="text-sm text-zinc-500 mt-1">Generate and manage login codes for your school</p>
          </div>

          <div className="flex items-center gap-2">
            {generatedCodes.length > 0 && (
              <button
                onClick={handleExport}
                className="text-xs font-semibold text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 px-3 py-2 rounded-lg transition-all"
              >
                ↓ Export CSV
              </button>
            )}
            <button
              onClick={handleBulkGenerate}
              disabled={bulkGenerating || filtered.length === 0}
              className="relative text-xs font-bold tracking-wide bg-white text-black px-4 py-2 rounded-lg hover:bg-zinc-200 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {bulkGenerating ? (
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  Generating…
                </span>
              ) : (
                `⚡ Bulk Generate (${filtered.length})`
              )}
            </button>
          </div>
        </div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total Users',    value: stats.total },
            { label: 'Have Code',      value: stats.withCode },
            { label: 'Missing Code',   value: stats.withoutCode },
            { label: 'Roles',          value: stats.roles },
          ].map(s => (
            <div key={s.label} className="bg-[#141416] border border-zinc-800 rounded-xl px-4 py-3">
              <p className="text-2xl font-black text-white">{s.value}</p>
              <p className="text-xs text-zinc-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* ── Tabs ── */}
        <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 w-fit">
          {(['roster', 'generated'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                activeTab === tab
                  ? 'bg-white text-black'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              {tab === 'roster' ? 'User Roster' : `Generated (${generatedCodes.length})`}
            </button>
          ))}
        </div>

        {/* ══════════════════ TAB: ROSTER ══════════════════ */}
        {activeTab === 'roster' && (
          <div className="space-y-4">

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                placeholder="Search name, email, role…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="flex-1 bg-[#141416] border border-zinc-800 focus:border-zinc-600 text-sm text-white placeholder:text-zinc-600 px-4 py-2.5 rounded-xl outline-none transition-colors"
              />
              <div className="flex gap-2 flex-wrap">
                {['all', ...allRoles].map(r => (
                  <button
                    key={r}
                    onClick={() => setRoleFilter(r)}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${
                      roleFilter === r
                        ? 'bg-white text-black border-white'
                        : 'text-zinc-400 border-zinc-800 hover:border-zinc-600 hover:text-white'
                    }`}
                  >
                    {r === 'all' ? 'All Roles' : getRoleMeta(r).label}
                  </button>
                ))}
              </div>
            </div>

            {/* Count */}
            <p className="text-xs text-zinc-600">
              Showing {filtered.length} of {entries.length} users
            </p>

            {/* Table */}
            <div className="bg-[#141416] border border-zinc-800 rounded-2xl overflow-hidden">
              {/* Head */}
              <div className="grid grid-cols-[1fr_1fr_140px_160px_100px] gap-4 px-5 py-3 border-b border-zinc-800 text-[11px] font-semibold tracking-widest text-zinc-600 uppercase">
                <span>Name</span>
                <span>Email</span>
                <span>Role</span>
                <span>Current Code</span>
                <span className="text-right">Action</span>
              </div>

              {/* Rows */}
              <div className="divide-y divide-zinc-800/60">
                {filtered.length === 0 ? (
                  <div className="py-16 text-center text-zinc-600 text-sm">No users match your filters</div>
                ) : (
                  filtered.map(entry => {
                    const pendingCode = localCodes[entry.id]
                    const displayCode = pendingCode ?? entry.default_code
                    const isSaving   = savingIds.has(entry.id)
                    const isSaved    = savedIds.has(entry.id)

                    return (
                      <div
                        key={entry.id}
                        className="grid grid-cols-[1fr_1fr_140px_160px_100px] gap-4 px-5 py-3.5 items-center hover:bg-zinc-800/20 transition-colors group"
                      >
                        {/* Name */}
                        <div>
                          <p className="text-sm font-semibold text-white truncate">
                            {entry.full_name ?? '—'}
                          </p>
                        </div>

                        {/* Email */}
                        <p className="text-xs text-zinc-500 truncate">{entry.email ?? '—'}</p>

                        {/* Role */}
                        <div>
                          <RoleBadge role={entry.role} />
                        </div>

                        {/* Code */}
                        <div className="flex items-center gap-2">
                          {displayCode ? (
                            <>
                              <CodeBadge code={displayCode} onClick={() => {}} />
                              {pendingCode && (
                                <span className="text-[10px] text-amber-400 font-medium">unsaved</span>
                              )}
                            </>
                          ) : (
                            <span className="text-xs text-zinc-600 italic">No code</span>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Generate button */}
                          <button
                            onClick={() => handleGenerateSingle(entry)}
                            title="Generate new code"
                            className="text-xs font-semibold text-zinc-400 hover:text-white bg-zinc-800/50 hover:bg-zinc-700 border border-zinc-700/50 hover:border-zinc-600 px-2.5 py-1.5 rounded-lg transition-all"
                          >
                            ↺ Gen
                          </button>

                          {/* Save button — only when there's a pending code */}
                          {pendingCode && (
                            <button
                              onClick={() => handleSaveCode(entry.id)}
                              disabled={isSaving}
                              className="text-xs font-bold text-black bg-white hover:bg-zinc-200 px-2.5 py-1.5 rounded-lg transition-all disabled:opacity-50"
                            >
                              {isSaving ? '…' : isSaved ? '✓' : 'Save'}
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════ TAB: GENERATED ══════════════════ */}
        {activeTab === 'generated' && (
          <div className="space-y-4">
            {generatedCodes.length === 0 ? (
              <div className="py-24 text-center space-y-3">
                <p className="text-4xl">🔑</p>
                <p className="text-zinc-500 text-sm">No codes generated yet.</p>
                <p className="text-zinc-600 text-xs">
                  Use the roster tab to generate individual codes, or use ⚡ Bulk Generate above.
                </p>
              </div>
            ) : (
              <>
                {/* Role breakdown */}
                <div className="flex flex-wrap gap-2">
                  {allRoles.map(role => {
                    const count = generatedCodes.filter(g => g.role === role).length
                    if (!count) return null
                    return (
                      <div key={role} className={`flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border ${getRoleMeta(role).color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${getRoleMeta(role).dot}`} />
                        {getRoleMeta(role).label} · {count}
                      </div>
                    )
                  })}
                </div>

                {/* Cards grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {generatedCodes.map(item => (
                    <GeneratedCodeCard key={item.userId} item={item} />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

      </div>

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in { animation: fade-in 0.2s ease-out; }
      `}</style>
    </div>
  )
}
