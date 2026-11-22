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
//   - Each page scrolls inside itself if a very long cell or code line is
//     taller than the estimate, so text can never fall out of the page.
//
// Animation is pure CSS 3D transforms driven by requestAnimationFrame writing
// straight to the DOM (no React re-render per frame), so it stays smooth on
// low-end Android. Honors prefers-reduced-motion.
//
// Usage (unchanged):
//   <NoteBook title={note.title} content={note.description} accentColor={schoolColor} onClose={...} />

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { slideify, type BookPage } from '@/lib/utils/slideify'
import NoteMarkdown from './NoteMarkdown'
import styles from './NoteBook.module.css'

interface Props {
  title: string
  content: string
  accentColor?: string
  onClose?: () => void
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
  index: number // 0 = front cover, 1..N = pages, N+1 = back cover
  lastIndex: number
  title: string
  pages: BookPage[]
  onOpen: () => void
  onCloseBook?: () => void
}

const Face = memo(function Face({ index, lastIndex, title, pages, onOpen, onCloseBook }: FaceProps) {
  if (index === 0) {
    return (
      <div className={`${styles.face} ${styles.cover}`} onClick={onOpen}>
        <div className={styles.coverFrame}>
          <span className={styles.coverKicker}>Study Notes</span>
          <h2 className={styles.coverTitle}>{title}</h2>
          <span className={styles.coverRule} />
          <span className={styles.coverHint}>Swipe or tap to open</span>
        </div>
        <div className={styles.ribbon} />
        <div className={styles.spineEdge} />
      </div>
    )
  }

  if (index === lastIndex) {
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

  const page = pages[index - 1]
  return (
    <div className={`${styles.face} ${styles.paper}`}>
      <div className={styles.runningHead}>{title}</div>
      <div className={styles.pageScroll}>
        <NoteMarkdown blocks={page.blocks} variant="book" />
      </div>
      <div className={styles.folio}>{index}</div>
      <div className={styles.gutter} />
    </div>
  )
})

/* --------------------------- the book --------------------------- */

export default function NoteBook({ title, content, accentColor = '#7C3AED', onClose }: Props) {
  const pages = useMemo(() => slideify(content), [content])
  const total = pages.length
  const lastIndex = total + 1

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

  if (total === 0) return null

  const underIndex = flip ? (flip.dir === 'next' ? flip.to : flip.from) : current
  const leafIndex = flip ? (flip.dir === 'next' ? flip.from : flip.to) : null
  const shown = flip ? flip.to : current
  const label = shown === 0 ? 'Cover' : shown === lastIndex ? 'The End' : `Page ${shown} of ${total}`

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
          {onClose && (
            <button className={styles.closeBtn} onClick={onClose} aria-label="Close">{'\u2715'}</button>
          )}
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
            <div className={styles.stackRight} />
            <div className={styles.stackBottom} />

            <div className={styles.sheet}>
              <Face index={underIndex} lastIndex={lastIndex} title={title} pages={pages} onOpen={openBook} onCloseBook={onClose} />
              <div ref={shadowRef} className={styles.castShadow} />
            </div>

            {leafIndex !== null && (
              <div ref={leafRef} className={`${styles.sheet} ${styles.leaf}`}>
                <Face index={leafIndex} lastIndex={lastIndex} title={title} pages={pages} onOpen={openBook} onCloseBook={onClose} />
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
