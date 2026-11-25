'use client'
// src/components/NoteEditor.tsx
//
// The note writing box with a formatting toolbar, like a word processor:
// headings, bold / italic / strike, bullets, numbering, checklist, quote, table,
// divider, page break, undo / redo and a live Preview.
//
// The note is still stored as plain text (with markdown markers), so existing notes
// and notes pasted from anywhere keep working. The toolbar just writes the markers
// for you; the book and the preview turn them into real formatting.
//
// Mobile: the toolbar scrolls sideways and its buttons never steal focus from the
// text box, so the keyboard stays open and the selection stays put.

import { useCallback, useEffect, useRef, useState } from 'react'
import NoteMarkdown from './NoteMarkdown'
import {
  setHeading, toggleBullets, toggleNumbered, toggleChecklist, toggleQuote, toggleWrap,
  insertTable, insertDivider, insertPageBreak, type Edit,
} from '@/lib/notebooks/editorActions'
import styles from './NoteEditor.module.css'

interface Props {
  value: string
  onChange: (v: string) => void
  accentColor?: string
  rows?: number
  placeholder?: string
}

type Action = (v: string, s: number, e: number) => Edit

const MAX_HISTORY = 100

export default function NoteEditor({ value, onChange, accentColor, rows = 10, placeholder = 'Start typing your note...' }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [preview, setPreview] = useState(false)

  // Undo / redo history (own stack, so toolbar edits and typing undo together).
  const hist = useRef<{ stack: string[]; i: number; lastTyped: number }>({ stack: [value], i: 0, lastTyped: 0 })
  const [, bump] = useState(0)

  // If the parent replaces the text (e.g. the form was cleared), start a fresh history.
  useEffect(() => {
    const h = hist.current
    if (value !== h.stack[h.i]) { h.stack = [value]; h.i = 0; h.lastTyped = 0; bump(n => n + 1) }
  }, [value])

  const record = useCallback((v: string, typing: boolean) => {
    const h = hist.current
    if (v === h.stack[h.i]) return
    const now = Date.now()
    if (typing && h.i === h.stack.length - 1 && now - h.lastTyped < 800 && h.i > 0) {
      h.stack[h.i] = v // keep fast typing as one undo step
    } else {
      h.stack = h.stack.slice(0, h.i + 1)
      h.stack.push(v)
      if (h.stack.length > MAX_HISTORY) h.stack.shift()
      h.i = h.stack.length - 1
    }
    h.lastTyped = typing ? now : 0
    bump(n => n + 1)
  }, [])

  const undo = useCallback(() => {
    const h = hist.current
    if (h.i > 0) { h.i--; h.lastTyped = 0; onChange(h.stack[h.i]); bump(n => n + 1) }
  }, [onChange])
  const redo = useCallback(() => {
    const h = hist.current
    if (h.i < h.stack.length - 1) { h.i++; h.lastTyped = 0; onChange(h.stack[h.i]); bump(n => n + 1) }
  }, [onChange])

  function apply(action: Action) {
    const ta = ref.current
    if (!ta) return
    const edit = action(value, ta.selectionStart, ta.selectionEnd)
    record(edit.value, false)
    onChange(edit.value)
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(edit.start, edit.end)
    })
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!(e.ctrlKey || e.metaKey)) return
    const k = e.key.toLowerCase()
    if (k === 'b') { e.preventDefault(); apply((v, s, en) => toggleWrap(v, s, en, '**', 'bold text')) }
    else if (k === 'i') { e.preventDefault(); apply((v, s, en) => toggleWrap(v, s, en, '*', 'italic text')) }
    else if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
    else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo() }
  }

  const h = hist.current
  const canUndo = h.i > 0
  const canRedo = h.i < h.stack.length - 1

  // Buttons must not take focus away from the text box.
  const keepFocus = (e: React.PointerEvent | React.MouseEvent) => e.preventDefault()

  const btn = (label: string, aria: string, onClick: () => void, opts: { disabled?: boolean; cls?: string } = {}) => (
    <button
      type="button" aria-label={aria} title={aria}
      className={`${styles.tool} ${opts.cls ?? ''}`}
      disabled={opts.disabled || preview}
      onPointerDown={keepFocus} onMouseDown={keepFocus}
      onClick={onClick}
    >
      {label}
    </button>
  )

  return (
    <div className={styles.editor} style={accentColor ? ({ ['--ed-accent' as string]: accentColor } as React.CSSProperties) : undefined}>
      <div className={styles.toolbar} role="toolbar" aria-label="Formatting">
        {btn('\u21B6', 'Undo', undo, { disabled: !canUndo })}
        {btn('\u21B7', 'Redo', redo, { disabled: !canRedo })}
        <span className={styles.sep} />
        {btn('H1', 'Title', () => apply((v, s, e) => setHeading(v, s, e, 1)), { cls: styles.bold })}
        {btn('H2', 'Heading', () => apply((v, s, e) => setHeading(v, s, e, 2)), { cls: styles.bold })}
        {btn('H3', 'Subheading', () => apply((v, s, e) => setHeading(v, s, e, 3)), { cls: styles.bold })}
        <span className={styles.sep} />
        {btn('B', 'Bold', () => apply((v, s, e) => toggleWrap(v, s, e, '**', 'bold text')), { cls: styles.bold })}
        {btn('I', 'Italic', () => apply((v, s, e) => toggleWrap(v, s, e, '*', 'italic text')), { cls: styles.italic })}
        {btn('S', 'Strikethrough', () => apply((v, s, e) => toggleWrap(v, s, e, '~~', 'text')), { cls: styles.strike })}
        <span className={styles.sep} />
        {btn('\u2022 List', 'Bullet list', () => apply(toggleBullets))}
        {btn('1. List', 'Numbered list', () => apply(toggleNumbered))}
        {btn('\u2610 Tasks', 'Checklist', () => apply(toggleChecklist))}
        {btn('\u275D Quote', 'Quote', () => apply(toggleQuote))}
        <span className={styles.sep} />
        {btn('Table', 'Insert table', () => apply((v, s, e) => insertTable(v, s, e, 3, 2)))}
        {btn('Line', 'Divider line', () => apply(insertDivider))}
        {btn('Page break', 'Start a new page here', () => apply(insertPageBreak))}
      </div>

      {preview ? (
        <div className={styles.preview} style={{ minHeight: rows * 22 }}>
          {value.trim() ? <NoteMarkdown content={value} variant="inline" accentColor={accentColor} /> : <p className={styles.empty}>Nothing to preview yet.</p>}
        </div>
      ) : (
        <textarea
          ref={ref}
          className={styles.area}
          rows={rows}
          value={value}
          placeholder={placeholder}
          onChange={e => { record(e.target.value, true); onChange(e.target.value) }}
          onKeyDown={onKeyDown}
        />
      )}

      <div className={styles.footer}>
        <p className={styles.hint}>Press Enter twice for a new paragraph. Select text, then tap a tool.</p>
        <button type="button" className={`${styles.previewBtn} ${preview ? styles.previewOn : ''}`} onClick={() => setPreview(p => !p)} disabled={!value.trim() && !preview}>
          {preview ? 'Back to editing' : 'Preview'}
        </button>
      </div>
    </div>
  )
}
