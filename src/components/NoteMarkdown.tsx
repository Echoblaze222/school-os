'use client'
// src/components/NoteMarkdown.tsx
//
// Renders a note as real formatting instead of raw symbols: headings, bold,
// italic, lists, tables, quotes, code, and equations.
//
// Safe by construction: every piece of user text goes through React text nodes
// (auto-escaped). There is no HTML injection of note content. Links are limited
// to http(s)/mailto (see safeUrl). Equations render through KaTeX.
//
// Used by the book viewer (variant="book", paper look) and by the teacher's
// inline expanded view (variant="inline", follows the app theme).

import { Fragment, createElement, memo, useMemo, type CSSProperties, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import {
  parseBlocks,
  parseInline,
  type InlineNode,
  type NoteBlock,
  type ListBlock,
  type TableBlock,
} from '@/lib/utils/noteMarkdown'
import styles from './NoteMarkdown.module.css'

// KaTeX is heavy, so it only loads when a note contains an equation.
const KatexMath = dynamic(() => import('./KatexMath'), {
  ssr: false,
  loading: () => <span className={styles.mathLoading}>...</span>,
})

interface Props {
  /** Raw note text (what is stored in the database). */
  content?: string
  /** Or already-parsed blocks (the book passes these so pages are not re-parsed). */
  blocks?: NoteBlock[]
  variant?: 'book' | 'inline'
  accentColor?: string
}

function renderInline(nodes: InlineNode[], keyPrefix: string): ReactNode[] {
  return nodes.map((n, i) => {
    const key = `${keyPrefix}.${i}`
    switch (n.t) {
      case 'text': return <Fragment key={key}>{n.v}</Fragment>
      case 'br': return <br key={key} />
      case 'strong': return <strong key={key}>{renderInline(n.c, key)}</strong>
      case 'em': return <em key={key}>{renderInline(n.c, key)}</em>
      case 'del': return <del key={key}>{renderInline(n.c, key)}</del>
      case 'code': return <code key={key} className={styles.inlineCode}>{n.v}</code>
      case 'link':
        return (
          <a key={key} href={n.href} target="_blank" rel="noopener noreferrer" className={styles.link}>
            {renderInline(n.c, key)}
          </a>
        )
      case 'math': return <KatexMath key={key} expr={n.v} display={n.display} />
      case 'image':
        // eslint-disable-next-line @next/next/no-img-element
        return <img key={key} src={n.src} alt={n.alt} loading="lazy" referrerPolicy="no-referrer" className={styles.img} />
    }
  })
}

const Inline = memo(function Inline({ text, k }: { text: string; k: string }) {
  const nodes = useMemo(() => parseInline(text), [text])
  return <>{renderInline(nodes, k)}</>
})

function ListView({ list, k }: { list: ListBlock; k: string }) {
  const Tag = list.ordered ? 'ol' : 'ul'
  return (
    <Tag className={list.ordered ? styles.ol : styles.ul} {...(list.ordered ? { start: list.start } : {})}>
      {list.items.map((item, i) => (
        <li key={`${k}.${i}`} className={item.checked !== null ? styles.task : undefined}>
          {item.checked !== null && (
            <span className={styles.check} aria-hidden="true">{item.checked ? '\u2611' : '\u2610'}</span>
          )}
          <Inline text={item.text} k={`${k}.${i}`} />
          {item.children.map((child, ci) => (
            <BlockView key={`${k}.${i}.c${ci}`} block={child} k={`${k}.${i}.c${ci}`} />
          ))}
        </li>
      ))}
    </Tag>
  )
}

function TableView({ table, k }: { table: TableBlock; k: string }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            {table.header.map((h, i) => (
              <th key={i} style={table.align[i] ? ({ textAlign: table.align[i] } as CSSProperties) : undefined}>
                <Inline text={h} k={`${k}.h${i}`} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci} style={table.align[ci] ? ({ textAlign: table.align[ci] } as CSSProperties) : undefined}>
                  <Inline text={cell} k={`${k}.r${ri}.${ci}`} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function BlockView({ block, k }: { block: NoteBlock; k: string }) {
  switch (block.type) {
    case 'heading': {
      const level = Math.min(6, Math.max(1, block.level))
      return createElement(
        `h${level}`,
        { className: `${styles.heading} ${styles[`h${level}`]}` },
        <Inline text={block.text} k={k} />,
      )
    }
    case 'paragraph':
      return <p className={styles.p}><Inline text={block.text} k={k} /></p>
    case 'list':
      return <ListView list={block} k={k} />
    case 'table':
      return <TableView table={block} k={k} />
    case 'code':
      return <pre className={styles.code}><code>{block.text}</code></pre>
    case 'quote':
      return (
        <blockquote className={styles.quote}>
          {block.blocks.map((b, i) => <BlockView key={`${k}.q${i}`} block={b} k={`${k}.q${i}`} />)}
        </blockquote>
      )
    case 'math':
      return <KatexMath expr={block.text} display />
    case 'hr':
      return <hr className={styles.hr} />
  }
}

function NoteMarkdownImpl({ content, blocks, variant = 'inline', accentColor }: Props) {
  const parsed = useMemo(() => blocks ?? parseBlocks(content ?? ''), [blocks, content])
  const style = accentColor ? ({ ['--md-accent' as string]: accentColor } as CSSProperties) : undefined
  return (
    <div className={`${styles.md} ${variant === 'book' ? styles.book : styles.inline}`} style={style}>
      {parsed.map((b, i) => <BlockView key={i} block={b} k={`b${i}`} />)}
    </div>
  )
}

const NoteMarkdown = memo(NoteMarkdownImpl)
export default NoteMarkdown
