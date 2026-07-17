'use client'
// src/components/NoteBook.tsx
//
// Cinematic 3D "flip book" reader for typed/pasted study notes.
// Pure CSS 3D transforms (perspective + rotateY) — no external animation
// library, so it stays light and fast on low-end Android devices.
//
// Usage:
//   <NoteBook title={note.title} content={note.description} accentColor={schoolColor} />
//
// If content is empty, renders nothing (caller should guard, but this is
// defensive too).

import { useState, useRef, useMemo, useEffect } from 'react'
import { slideify } from '@/lib/utils/slideify'
import styles from './NoteBook.module.css'

interface Props {
  title: string
  content: string
  accentColor?: string
  onClose?: () => void
}

export default function NoteBook({ title, content, accentColor = '#7C3AED', onClose }: Props) {
  const slides = useMemo(() => slideify(content), [content])
  const [page, setPage] = useState(0)
  const [flipping, setFlipping] = useState<'next' | 'prev' | null>(null)
  const [opened, setOpened] = useState(false)
  const touchStartX = useRef<number | null>(null)

  const total = slides.length
  const isFirst = page === 0
  const isLast = page === total - 1

  useEffect(() => {
    // Cinematic cover-open animation on mount
    const t = setTimeout(() => setOpened(true), 60)
    return () => clearTimeout(t)
  }, [])

  function goTo(next: number) {
    if (next < 0 || next >= total || flipping) return
    setFlipping(next > page ? 'next' : 'prev')
    setTimeout(() => {
      setPage(next)
      setFlipping(null)
    }, 380)
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
  }
  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(dx) > 50) {
      if (dx < 0) goTo(page + 1)
      else goTo(page - 1)
    }
    touchStartX.current = null
  }

  if (total === 0) return null

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={`${styles.stage} ${opened ? styles.stageOpen : ''}`}
        onClick={e => e.stopPropagation()}
        style={{ ['--accent' as any]: accentColor }}
      >
        <div className={styles.header}>
          <div>
            <p className={styles.bookTitle}>{title}</p>
            <p className={styles.pageCount}>Page {page + 1} of {total}</p>
          </div>
          {onClose && (
            <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
          )}
        </div>

        <div
          className={styles.book}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Left drop-shadow spine to sell the "book" feel */}
          <div className={styles.spineShadow} />

          <div className={styles.pageArea}>
            {/* Current page */}
            <div
              key={`page-${page}`}
              className={[
                styles.page,
                flipping === 'next' ? styles.flipOutNext : '',
                flipping === 'prev' ? styles.flipOutPrev : '',
              ].join(' ')}
            >
              <div className={styles.pageInner}>
                <p className={styles.slideTitle}>{slides[page].title}</p>
                <div className={styles.slideBody}>
                  {slides[page].body.split('\n').map((line, i) => (
                    line.trim() ? <p key={i}>{line}</p> : <br key={i} />
                  ))}
                </div>
              </div>
              <div className={styles.pageCurl} />
            </div>
          </div>
        </div>

        <div className={styles.progressDots}>
          {slides.map((_, i) => (
            <button
              key={i}
              className={`${styles.dot} ${i === page ? styles.dotActive : ''}`}
              onClick={() => goTo(i)}
              aria-label={`Go to page ${i + 1}`}
            />
          ))}
        </div>

        <div className={styles.controls}>
          <button
            className={styles.navBtn}
            onClick={() => goTo(page - 1)}
            disabled={isFirst}
          >
            ← Prev
          </button>
          <button
            className={styles.navBtn}
            onClick={() => goTo(page + 1)}
            disabled={isLast}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  )
}
