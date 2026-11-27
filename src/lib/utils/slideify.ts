// src/lib/utils/slideify.ts
//
// Turns a typed/pasted note into the PAGES of the book viewer (NoteBook).
// (File name kept from the old slide-style version so imports do not change.)
//
// The note is parsed into blocks (noteMarkdown.ts) and the pages are filled
// completely, one after another (fill.ts): a page ends only when it is full or at
// a manual \pagebreak, and big blocks are split to fill the room left.
//
// In the browser NoteBook measures real block heights (measureBlocks.tsx) so pages
// are exactly full. The estimate below (character counts) is the fallback used on
// the server, in tests, and until the first measurement. Either way the page also
// scrolls inside itself, so an under-estimate can never push text out of the page.

import { parseBlocks, plainText, type NoteBlock, type ListItemNode, type TableBlock } from './noteMarkdown'
import { paginateByHeight } from './fill'

export interface BookPage {
  title: string
  blocks: NoteBlock[]
}
/** Backwards-compatible alias (the old API called pages "slides"). */
export type Slide = BookPage

/** Characters that fit on one line of a phone-width page. Conservative on purpose. */
export const CPL = 38
/** Estimated lines that fit on one page. */
export const LINES_PER_PAGE = 13
/** Estimated lines an inline image takes (it is a fixed ~150px box). */
const IMAGE_LINES = 8

/* ------------------------------------------------------------------ */
/* Cost model (in estimated lines)                                       */
/* ------------------------------------------------------------------ */

const wrap = (len: number, cpl: number) => Math.max(1, Math.ceil(len / Math.max(8, cpl)))

function itemCost(item: ListItemNode, depth: number): number {
  const cpl = CPL - 4 - depth * 3
  let c = item.text.split('\n').reduce((s, l) => s + wrap(plainText(l).length, cpl), 0) + 0.2
  for (const child of item.children) c += blockCost(child, depth + 1)
  return c
}

function rowCost(cells: string[], cols: number): number {
  const perCell = Math.max(6, Math.floor((CPL - 2) / Math.max(1, cols)))
  let lines = 1
  for (const cell of cells) {
    const l = cell.split('\n').reduce((s, part) => s + wrap(plainText(part).length, perCell), 0)
    if (l > lines) lines = l
  }
  return lines + 0.7
}

function tableCost(t: TableBlock): number {
  const cols = t.header.length
  return rowCost(t.header, cols) + t.rows.reduce((s, r) => s + rowCost(r, cols), 0) + 0.6
}

export function blockCost(b: NoteBlock, depth = 0): number {
  switch (b.type) {
    case 'heading': {
      const base = b.level === 1 ? 2.6 : b.level === 2 ? 2.2 : 1.8
      return base + (wrap(plainText(b.text).length, CPL - 8) - 1) * 1.3
    }
    case 'paragraph':
      return (
        b.text.split('\n').reduce((s, l) => s + wrap(plainText(l).length, CPL), 0) +
        0.5 +
        (b.text.match(/!\[[^\]]*\]\(/g)?.length ?? 0) * IMAGE_LINES
      )
    case 'list':
      return b.items.reduce((s, it) => s + itemCost(it, depth), 0) + 0.5
    case 'table':
      return tableCost(b)
    case 'code':
      return b.text.split('\n').reduce((s, l) => s + wrap(l.length, CPL + 4), 0) + 1.2
    case 'math':
      return 3
    case 'quote':
      return b.blocks.reduce((s, x) => s + blockCost(x, depth), 0) + 0.8
    case 'hr':
      return 1.2
    case 'pagebreak':
      return 0
  }
}

/* ------------------------------------------------------------------ */
/* Titles                                                                */
/* ------------------------------------------------------------------ */

function firstText(b: NoteBlock): string {
  switch (b.type) {
    case 'heading': return plainText(b.text)
    case 'paragraph': return plainText(b.text.split('\n')[0] ?? '')
    case 'list': return plainText(b.items[0]?.text.split('\n')[0] ?? '')
    case 'table': return plainText(b.header.join(' / '))
    case 'quote': return b.blocks[0] ? firstText(b.blocks[0]) : ''
    case 'code': return 'Code'
    case 'math': return 'Equation'
    case 'hr': return ''
    case 'pagebreak': return ''
  }
}

function clip(s: string, max = 48): string {
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + '\u2026'
}

/* ------------------------------------------------------------------ */
/* Paginator                                                             */
/* ------------------------------------------------------------------ */

/** Estimated pagination (cost model). The browser passes measured heights instead. */
export function paginateBlocks(blocks: NoteBlock[], linesPerPage = LINES_PER_PAGE): NoteBlock[][] {
  return paginateByHeight(blocks, b => blockCost(b), linesPerPage)
}

export type Paginator = (blocks: NoteBlock[]) => NoteBlock[][]

export function slideify(raw: string, paginate: Paginator = paginateBlocks): BookPage[] {
  const blocks = parseBlocks(raw)
  if (blocks.length === 0) return []
  const pages = paginate(blocks)

  let section = ''
  return pages.map((pageBlocks, i) => {
    const heading = pageBlocks.find(b => b.type === 'heading')
    if (heading && heading.type === 'heading') section = plainText(heading.text)
    const title =
      heading && heading.type === 'heading'
        ? clip(plainText(heading.text))
        : section
          ? clip(section)
          : clip(firstText(pageBlocks[0]) || `Page ${i + 1}`)
    return { title, blocks: pageBlocks }
  })
}
