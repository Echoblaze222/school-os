'use client'
// components/CommandPalette.tsx
// Cmd/Ctrl+K palette for the desktop shell. Instantly filters the role's own
// navigation (the same featureGroups the sidebar renders), then adds live
// record results from /api/search once the query is 2+ characters.
//
// Visibility of records is decided server-side by /api/search, exactly as for
// GlobalSearchOverlay. This component only renders what that route returns
// and never decides what a role is allowed to see.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { FeatureGroup } from './AllFeaturesSheet'
import { SearchIcon, GridIcon, SparklesIcon, UserIcon, SunIcon, MoonIcon, FileTextIcon } from './Icons'
import styles from './CommandPalette.module.css'

type IconType = React.ComponentType<{ size?: number }>

interface Command {
  id:        string
  section:   string
  label:     string
  subtitle?: string
  href?:     string
  run?:      () => void
  Icon:      IconType
}

interface RecordResult { type: string; id: string; title: string; subtitle: string; href: string }

interface Props {
  groups:        FeatureGroup[]
  homeHref:      string
  aiHref:        string
  profileHref:   string
  theme:         string
  onToggleTheme: () => void
  onClose:       () => void
}

export default function CommandPalette({
  groups, homeHref, aiHref, profileHref, theme, onToggleTheme, onClose,
}: Props) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [records, setRecords] = useState<RecordResult[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = [
      { id: 'home',    section: 'Go to', label: 'Overview',           href: homeHref,    Icon: GridIcon },
      { id: 'ai',      section: 'Go to', label: 'AI Insights',        href: aiHref,      Icon: SparklesIcon },
      { id: 'profile', section: 'Go to', label: 'Account and profile', href: profileHref, Icon: UserIcon },
    ]
    for (const g of groups) {
      for (const item of g.items) {
        list.push({ id: `f-${item.id}`, section: g.name, label: item.label, href: item.href, Icon: item.Icon })
      }
    }
    list.push({
      id: 'theme',
      section: 'Actions',
      label: theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
      run: onToggleTheme,
      Icon: theme === 'dark' ? SunIcon : MoonIcon,
    })
    return list
  }, [groups, homeHref, aiHref, profileHref, theme, onToggleTheme])

  const q = query.trim().toLowerCase()

  const matches = useMemo(() => {
    if (!q) return commands
    return commands
      .map(c => {
        const label = c.label.toLowerCase()
        const section = c.section.toLowerCase()
        const score = label.startsWith(q) ? 0 : label.includes(q) ? 1 : section.includes(q) ? 2 : -1
        return { c, score }
      })
      .filter(x => x.score >= 0)
      .sort((a, b) => a.score - b.score)
      .map(x => x.c)
  }, [commands, q])

  // Live record search, debounced and cancellable.
  useEffect(() => {
    if (q.length < 2) { setRecords([]); setLoading(false); return }
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal })
        if (!res.ok) throw new Error('search failed')
        const data = await res.json()
        setRecords(data.results ?? [])
      } catch (e: any) {
        if (e?.name === 'AbortError') return
        setRecords([])
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 250)
    return () => { clearTimeout(timer); controller.abort() }
  }, [q, query])

  const items = useMemo<Command[]>(() => {
    const recs: Command[] = records.map(r => ({
      id: `r-${r.type}-${r.id}`,
      section: 'Records',
      label: r.title,
      subtitle: r.subtitle,
      href: r.href,
      Icon: FileTextIcon,
    }))
    return [...matches, ...recs]
  }, [matches, records])

  useEffect(() => { setActive(0) }, [q])

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  function activate(c?: Command) {
    if (!c) return
    onClose()
    if (c.run) c.run()
    else if (c.href) router.push(c.href)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, Math.max(items.length - 1, 0))) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); activate(items[active]) }
    else if (e.key === 'Escape') { e.preventDefault(); onClose() }
  }

  let lastSection = ''

  return (
    <div
      className={styles.overlay}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className={styles.panel} role="dialog" aria-modal="true" aria-label="Command palette">
        <div className={styles.inputRow}>
          <SearchIcon size={18} />
          <input
            ref={inputRef}
            className={styles.input}
            placeholder="Jump to a page, or search students, fees, assignments"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            aria-label="Search"
          />
          {loading && <span className={styles.spinner} aria-hidden="true" />}
        </div>

        <div className={styles.list} ref={listRef} role="listbox">
          {items.length === 0 && (
            <p className={styles.empty}>{loading ? 'Searching' : `Nothing found for "${query.trim()}".`}</p>
          )}
          {items.map((c, i) => {
            const header = c.section !== lastSection
            lastSection = c.section
            const isActive = i === active
            return (
              <div key={c.id}>
                {header && <div className={styles.section}>{c.section}</div>}
                <button
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  data-active={isActive ? 'true' : 'false'}
                  className={`${styles.row} ${isActive ? styles.rowActive : ''}`}
                  onMouseMove={() => { if (!isActive) setActive(i) }}
                  onClick={() => activate(c)}
                >
                  <span className={styles.rowIcon}><c.Icon size={16} /></span>
                  <span className={styles.rowText}>
                    <span className={styles.rowLabel}>{c.label}</span>
                    {c.subtitle && <span className={styles.rowSub}>{c.subtitle}</span>}
                  </span>
                </button>
              </div>
            )
          })}
        </div>

        <div className={styles.footer}>
          <span><kbd className={styles.kbd}>Up</kbd> <kbd className={styles.kbd}>Down</kbd> to move</span>
          <span><kbd className={styles.kbd}>Enter</kbd> to open</span>
          <span><kbd className={styles.kbd}>Esc</kbd> to close</span>
        </div>
      </div>
    </div>
  )
}
