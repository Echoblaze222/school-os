'use client'
// src/components/NoteBook.tsx
//
// A real-book reader for typed/pasted study notes (teacher preview + student
// reading). Replaces the old slide-style viewer.
//
//   - Closed hardcover with the note title; tap or swipe to open it.
//   - Cream paper pages, spine shading, stacked page edges, page numbers,
//     and a folded corner you can tap.
//   - Pages TURN like paper: the page hinges on the spine and lifts away,
//     casting a shadow on the page underneath. You can drag it with your
//     finger (it follows your thumb and snaps shut or open on release) or
//     use the Prev/Next buttons, the corner, the slider, or arrow keys.
//   - Notes are formatted (headings, bold, tables, lists, equations) by
//     NoteMarkdown. Nothing is shown as raw symbols.
//   - Pages are filled completely before the next one starts: after the book
//     opens, real block heights are measured (measureBlocks.tsx) and the pages
//     are re-filled to fit exactly.
//   - Each page scrolls inside itself if a very long cell or code line is
//     taller than expected, so text can never fall out of the page.
//
// Animation is pure CSS 3D transforms driven by requestAnimationFrame writing
// straight to the DOM (no React re-render per frame), so it stays smooth on
// low-end Android. Honors prefers-reduced-motion.
//
// Usage:
//   Single note (unchanged):
//     <NoteBook title={note.title} content={note.description} accentColor={schoolColor} onClose={...} />
//   A whole book of topics (adds a contents page, PDF topics shown as real pages):
//     <NoteBook title={book.title} subtitle="Chemistry" entries={entries} onDownload={...} onClose={...} />

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { buildSheets, isPdfUrl, type BookEntry, type Sheet } from '@/lib/notebooks/sheets'
import { getPdfPageCount, renderPdfPage } from '@/lib/notebooks/pdfPages'
import { createPageMeasurer } from './measureBlocks'
import NoteMarkdown from './NoteMarkdown'
import styles from './NoteBook.module.css'

interface Props {
  title: string
  /** A single note's text. Ignored when `entries` is given. */
  content?: string
  /** The topics of a book. Adds a contents page. */
  entries?: BookEntry[]
  /** Small line on the cover, e.g. the subject. */
  subtitle?: string
  accentColor?: string
  onClose?: () => void
  /** When set, a Download PDF button is shown. */
  onDownload?: () => void
  downloading?: boolean
}

interface Flip { dir: 'next' | 'prev'; from: number; to: number }

interface DragState {
  id: number
  x0: number
  y0: number
  width: number
  active: boolean
  dir: 'next' | 'prev'
  lastX: number
  lastT: number
  v: number // px per ms, signed
}

const FLIP_MAX_DEG = 118
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

/* ---------------------------- faces ---------------------------- */

interface FaceProps {
  sheet: Sheet
  title: string
  subtitle?: string
  onOpen: () => void
  onJump: (sheetIndex: number) => void
  onCloseBook?: () => void
}

function PdfPageImage({ url, pageNo }: { url: string; pageNo: number }) {
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let cancelled = false
    setSrc(null)
    setFailed(false)
    renderPdfPage(url, pageNo, 420)
      .then(img => { if (!cancelled) setSrc(img) })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [url, pageNo])

  if (failed) {
    return (
      <div className={styles.docCard}>
        <p>This page could not be shown here.</p>
        <a href={url} target="_blank" rel="noopener noreferrer" className={styles.docBtn}>Open the file</a>
      </div>
    )
  }
  if (!src) return <div className={styles.pdfLoading}>Loading page {pageNo}...</div>
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={`Page ${pageNo}`} className={styles.pdfImg} draggable={false} />
}

const Face = memo(function Face({ sheet, title, subtitle, onOpen, onJump, onCloseBook }: FaceProps) {
  if (sheet.kind === 'cover') {
    return (
      <div className={`${styles.face} ${styles.cover}`} onClick={onOpen}>
        <div className={styles.coverFrame}>
          <span className={styles.coverKicker}>{subtitle || 'Study Notes'}</span>
          <h2 className={styles.coverTitle}>{title}</h2>
          <span className={styles.coverRule} />
          <span className={styles.coverHint}>Swipe or tap to open</span>
        </div>
        <div className={styles.ribbon} />
        <div className={styles.spineEdge} />
      </div>
    )
  }

  if (sheet.kind === 'end') {
    return (
      <div className={`${styles.face} ${styles.cover} ${styles.backCover}`}>
        <div className={styles.coverFrame}>
          <span className={styles.coverKicker}>The End</span>
          <span className={styles.coverRule} />
          {onCloseBook && (
            <button type="button" className={styles.closeBook} onClick={onCloseBook}>Close book</button>
          )}
        </div>
        <div className={styles.spineEdge} />
      </div>
    )
  }

  if (sheet.kind === 'contents') {
    return (
      <div className={`${styles.face} ${styles.paper}`}>
        <div className={styles.runningHead}>{title}</div>
        <div className={styles.pageScroll}>
          <h3 className={styles.tocTitle}>Contents</h3>
          <ol className={styles.tocList}>
            {sheet.items.map((it, i) => (
              <li key={i}>
                <button type="button" className={styles.tocItem} onClick={() => onJump(it.sheet)}>
                  <span className={styles.tocNum}>{i + 1}</span>
                  <span className={styles.tocText}>{it.title}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
        <div className={styles.gutter} />
      </div>
    )
  }

  if (sheet.kind === 'empty') {
    return (
      <div className={`${styles.face} ${styles.paper}`}>
        <div className={styles.runningHead}>{title}</div>
        <div className={styles.pageScroll}>
          <div className={styles.docCard}><p>No topics in this book yet.</p></div>
        </div>
        <div className={styles.gutter} />
      </div>
    )
  }

  const chapter = sheet.chapter || title
  return (
    <div className={`${styles.face} ${styles.paper}`}>
      <div className={styles.runningHead}>{chapter}</div>
      {sheet.kind === 'page' && (
        <div className={styles.pageScroll}>
          <NoteMarkdown blocks={sheet.blocks} variant="book" />
        </div>
      )}
      {sheet.kind === 'pdf' && (
        <div className={`${styles.pageScroll} ${styles.pdfScroll}`}>
          <PdfPageImage url={sheet.url} pageNo={sheet.pageNo} />
        </div>
      )}
      {sheet.kind === 'doc' && (
        <div className={styles.pageScroll}>
          <div className={styles.docCard}>
            <p className={styles.docName}>{sheet.name}</p>
            <p>Word and PowerPoint files cannot be turned into pages here. Open it to read.</p>
            <a href={sheet.url} target="_blank" rel="noopener noreferrer" className={styles.docBtn}>Open the file</a>
          </div>
        </div>
      )}
      <div className={styles.folio}>{sheet.folio}</div>
      <div className={styles.gutter} />
    </div>
  )
})

/* --------------------------- the book --------------------------- */

export default function NoteBook({
  title, content = '', entries, subtitle, accentColor = '#7C3AED', onClose, onDownload, downloading,
}: Props) {
  const isBook = !!entries
  const topics = useMemo<BookEntry[]>(
    () => entries ?? (content.trim() ? [{ title, content }] : []),
    [entries, content, title],
  )

  // Page counts of uploaded PDFs arrive after the book opens; until then a PDF shows one placeholder page.
  const [pdfCounts, setPdfCounts] = useState<Record<string, number | undefined>>({})
  useEffect(() => {
    let cancelled = false
    for (const e of topics) {
      const url = e.file_url
      if (url && isPdfUrl(url)) {
        getPdfPageCount(url)
          .then(n => { if (!cancelled) setPdfCounts(prev => (prev[url] === n ? prev : { ...prev, [url]: n })) })
          .catch(() => { if (!cancelled) setPdfCounts(prev => (prev[url] === 1 ? prev : { ...prev, [url]: 1 })) })
      }
    }
    return () => { cancelled = true }
  }, [topics])

  const withContents = isBook && topics.length > 1

  // 1) Instant estimate so the book opens immediately.
  const estimatedSheets = useMemo(
    () => buildSheets(topics, pdfCounts, { contents: withContents }),
    [topics, pdfCounts, withContents],
  )

  // 2) Once the real page size is known, re-fill the pages from MEASURED heights so every page is full.
  const probeRef = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState<{ w: number; h: number } | null>(null)
  const [measuredSheets, setMeasuredSheets] = useState<Sheet[] | null>(null)

  useEffect(() => {
    const read = () => {
      const el = probeRef.current
      if (!el || el.clientWidth < 80 || el.clientHeight < 80) return
      const w = el.clientWidth
      const h = el.clientHeight
      setLayout(prev => (prev && prev.w === w && prev.h === h ? prev : { w, h }))
    }
    read()
    let t: ReturnType<typeof setTimeout> | undefined
    const onResize = () => { clearTimeout(t); t = setTimeout(read, 150) }
    window.addEventListener('resize', onResize)
    return () => { clearTimeout(t); window.removeEventListener('resize', onResize) }
  }, [])

  useEffect(() => {
    if (!layout) return
    let cancelled = false
    // flushSync (used for measuring) must run outside React's own render/effect phase.
    const timer = setTimeout(() => {
      if (cancelled) return
      let measurer: ReturnType<typeof createPageMeasurer> | null = null
      try {
        measurer = createPageMeasurer(layout.w, layout.h)
        const m = measurer
        const out = buildSheets(topics, pdfCounts, { contents: withContents }, blocks => m.paginate(blocks))
        if (!cancelled) setMeasuredSheets(out)
      } catch {
        if (!cancelled) setMeasuredSheets(null) // fall back to the estimate
      } finally {
        measurer?.destroy()
      }
    }, 0)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [layout, topics, pdfCounts, withContents])

  const sheets = measuredSheets ?? estimatedSheets
  const lastIndex = sheets.length - 1
  const lastContent = sheets.reduce((n, sh) => ('folio' in sh ? Math.max(n, sh.folio) : n), 0)

  const [current, setCurrent] = useState(0)
  const [flip, setFlip] = useState<Flip | null>(null)
  const [opened, setOpened] = useState(false)

  const currentRef = useRef(0)
  const flipRef = useRef<Flip | null>(null)
  const progressRef = useRef(0)
  const autoRef = useRef(false)
  const rafRef = useRef<number | null>(null)
  const reducedRef = useRef(false)
  const dragRef = useRef<DragState | null>(null)

  const wrapRef = useRef<HTMLDivElement>(null)
  const leafRef = useRef<HTMLDivElement>(null)
  const shadowRef = useRef<HTMLDivElement>(null)
  const shineRef = useRef<HTMLDivElement>(null)

  currentRef.current = current

  useEffect(() => {
    reducedRef.current =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const t = setTimeout(() => setOpened(true), 60)
    return () => {
      clearTimeout(t)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  // Lock the page behind the book so swiping does not scroll the app.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  /** Writes the turning state straight to the DOM. p: 0 = at rest, 1 = fully turned. */
  const applyProgress = useCallback((p: number) => {
    const f = flipRef.current
    const leaf = leafRef.current
    if (!f || !leaf) return
    const angle = f.dir === 'next' ? -p * FLIP_MAX_DEG : -(1 - p) * FLIP_MAX_DEG
    leaf.style.transform = `rotateY(${angle}deg)`
    if (shadowRef.current) shadowRef.current.style.opacity = String(0.55 * Math.sin(p * Math.PI))
    const dark = f.dir === 'next' ? p : 1 - p
    if (shineRef.current) shineRef.current.style.opacity = String(Math.min(0.75, dark * 1.1))
  }, [])

  const animateTo = useCallback((target: 0 | 1, done: () => void) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    const startP = progressRef.current
    const dist = Math.abs(target - startP)
    const dur = reducedRef.current ? 0 : 140 + 380 * dist
    if (dur === 0) {
      progressRef.current = target
      applyProgress(target)
      done()
      return
    }
    const t0 = performance.now()
    const step = (now: number) => {
      const t = clamp((now - t0) / dur, 0, 1)
      const p = startP + (target - startP) * easeInOut(t)
      progressRef.current = p
      applyProgress(p)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step)
      } else {
        rafRef.current = null
        done()
      }
    }
    rafRef.current = requestAnimationFrame(step)
  }, [applyProgress])

  const commit = useCallback(() => {
    const f = flipRef.current
    if (!f) return
    flipRef.current = null
    progressRef.current = 0
    setCurrent(f.to)
    setFlip(null)
  }, [])

  const cancel = useCallback(() => {
    flipRef.current = null
    progressRef.current = 0
    setFlip(null)
  }, [])

  const beginFlip = useCallback((to: number, auto: boolean): boolean => {
    if (flipRef.current) return false
    const from = currentRef.current
    if (to === from || to < 0 || to > lastIndex) return false
    const f: Flip = { dir: to > from ? 'next' : 'prev', from, to }
    flipRef.current = f
    progressRef.current = 0
    autoRef.current = auto
    setFlip(f)
    return true
  }, [lastIndex])

  // The leaf element exists only after React renders the flip. Apply its first
  // frame before paint, and start the tween for button/keyboard turns.
  useLayoutEffect(() => {
    if (!flip) return
    applyProgress(progressRef.current)
    if (autoRef.current) {
      autoRef.current = false
      animateTo(1, commit)
    }
  }, [flip, applyProgress, animateTo, commit])

  const goTo = useCallback((to: number) => { beginFlip(to, true) }, [beginFlip])
  const openBook = useCallback(() => { beginFlip(1, true) }, [beginFlip])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.()
      else if (e.key === 'ArrowRight') goTo(currentRef.current + 1)
      else if (e.key === 'ArrowLeft') goTo(currentRef.current - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goTo, onClose])

  /* ------------------------ drag to turn ------------------------ */

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (flipRef.current) return
    const rect = e.currentTarget.getBoundingClientRect()
    dragRef.current = {
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      width: Math.max(1, rect.width),
      active: false,
      dir: 'next',
      lastX: e.clientX,
      lastT: performance.now(),
      v: 0,
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = dragRef.current
    if (!d || d.id !== e.pointerId) return
    const dx = e.clientX - d.x0
    const dy = e.clientY - d.y0

    if (!d.active) {
      // Only a mostly-horizontal drag turns the page; vertical drags scroll it.
      if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.2) return
      const dir: 'next' | 'prev' = dx < 0 ? 'next' : 'prev'
      const to = dir === 'next' ? currentRef.current + 1 : currentRef.current - 1
      if (to < 0 || to > lastIndex) { dragRef.current = null; return }
      if (!beginFlip(to, false)) { dragRef.current = null; return }
      d.active = true
      d.dir = dir
      wrapRef.current?.setPointerCapture(e.pointerId)
      wrapRef.current?.classList.add(styles.dragging)
    }

    const now = performance.now()
    const dt = Math.max(1, now - d.lastT)
    d.v = (e.clientX - d.lastX) / dt
    d.lastX = e.clientX
    d.lastT = now

    const raw = d.dir === 'next' ? -dx : dx
    const p = clamp(raw / (d.width * 0.75), 0, 1)
    progressRef.current = p
    applyProgress(p)
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    const d = dragRef.current
    if (!d || d.id !== e.pointerId) return
    dragRef.current = null
    wrapRef.current?.classList.remove(styles.dragging)
    if (!d.active) return
    const flicked = d.dir === 'next' ? d.v < -0.5 : d.v > 0.5
    if (progressRef.current > 0.32 || flicked) animateTo(1, commit)
    else animateTo(0, cancel)
  }

  /* --------------------------- render --------------------------- */

  if (topics.length === 0 && !isBook) return null

  const underIndex = flip ? (flip.dir === 'next' ? flip.to : flip.from) : current
  const leafIndex = flip ? (flip.dir === 'next' ? flip.from : flip.to) : null
  const shown = flip ? flip.to : current
  const shownSheet = sheets[Math.min(shown, lastIndex)]
  const label =
    shownSheet.kind === 'cover' ? 'Cover'
    : shownSheet.kind === 'end' ? 'The End'
    : shownSheet.kind === 'contents' ? 'Contents'
    : shownSheet.kind === 'empty' ? 'Empty'
    : `Page ${shownSheet.folio} of ${lastContent}`

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true" aria-label={`${title}, notes book`}>
      <div
        className={`${styles.stage} ${opened ? styles.stageOpen : ''}`}
        onClick={e => e.stopPropagation()}
        style={{ ['--accent' as string]: accentColor }}
      >
        <div className={styles.header}>
          <div className={styles.headerText}>
            <p className={styles.bookTitle}>{title}</p>
            <p className={styles.pageCount}>{label}</p>
          </div>
          <div className={styles.headerActions}>
            {onDownload && (
              <button className={styles.downloadBtn} onClick={onDownload} disabled={downloading} aria-label="Download as PDF">
                {downloading ? 'Preparing...' : 'PDF'}
              </button>
            )}
            {onClose && (
              <button className={styles.closeBtn} onClick={onClose} aria-label="Close">{'\u2715'}</button>
            )}
          </div>
        </div>

        <div
          ref={wrapRef}
          className={styles.bookWrap}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div className={styles.book}>
            {/* Invisible page-sized box: lets us read the real text area size for measuring. */}
            <div ref={probeRef} className={styles.pageScroll} aria-hidden="true" style={{ visibility: 'hidden', pointerEvents: 'none' }} />
            <div className={styles.stackRight} />
            <div className={styles.stackBottom} />

            <div className={styles.sheet}>
              <Face sheet={sheets[Math.min(underIndex, lastIndex)]} title={title} subtitle={subtitle} onOpen={openBook} onJump={goTo} onCloseBook={onClose} />
              <div ref={shadowRef} className={styles.castShadow} />
            </div>

            {leafIndex !== null && (
              <div ref={leafRef} className={`${styles.sheet} ${styles.leaf}`}>
                <Face sheet={sheets[Math.min(leafIndex, lastIndex)]} title={title} subtitle={subtitle} onOpen={openBook} onJump={goTo} onCloseBook={onClose} />
                <div ref={shineRef} className={styles.shine} />
              </div>
            )}

            {shown > 0 && shown < lastIndex && !flip && (
              <button
                type="button"
                className={styles.dogEar}
                onClick={() => goTo(current + 1)}
                aria-label="Next page"
              />
            )}
          </div>
        </div>

        <div className={styles.scrubRow}>
          <input
            className={styles.scrub}
            type="range"
            min={0}
            max={lastIndex}
            value={shown}
            onChange={e => goTo(Number(e.target.value))}
            aria-label="Jump to page"
          />
        </div>

        <div className={styles.controls}>
          <button className={styles.navBtn} onClick={() => goTo(current - 1)} disabled={shown === 0 || !!flip}>
            {'\u2190'} Prev
          </button>
          <button className={styles.navBtn} onClick={() => goTo(current + 1)} disabled={shown === lastIndex || !!flip}>
            Next {'\u2192'}
          </button>
        </div>
      </div>
    </div>
  )
}
