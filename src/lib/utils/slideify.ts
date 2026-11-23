// src/lib/utils/slideify.ts
//
// Turns a typed/pasted note into the PAGES of the book viewer (NoteBook).
// (File name kept from the old slide-style version so imports do not change.)
//
// The old version cut raw text every ~420 characters, which sliced tables and
// lists in half and left markdown symbols on the page. This one parses the note
// into blocks first (noteMarkdown.ts) and then fills pages block by block:
//
//   - A chapter heading (# or ##) always starts a new page.
//   - A block that fits the room left stays whole; otherwise it moves to the
//     next page. Only blocks bigger than a page are split: a table splits by
//     rows (header repeated on the next page), a list by items (numbering
//     continues), a paragraph at a sentence, code by lines.
//   - A heading is never left stranded at the bottom of a page.
//
// KNOWN LIMIT (by design): page fill is ESTIMATED from character counts, not
// measured in the browser, so it stays a pure function that is cheap and
// testable. The book page scrolls inside itself as a safety net, so an
// under-estimate can never push text outside the page.

import { parseBlocks, plainText, type NoteBlock, type ListBlock, type ListItemNode, type TableBlock } from './noteMarkdown'

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
/** Estimated lines an inline image takes (it is capped at ~200px tall). */
const IMAGE_LINES = 7

type Piece = NoteBlock | null

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
  }
}

/* ------------------------------------------------------------------ */
/* Splitting oversized blocks                                            */
/* ------------------------------------------------------------------ */

/** Keeps **bold**, ~~strike~~ and `code` balanced when text is cut in two. */
function rebalance(a: string, b: string): [string, string] {
  for (const mark of ['**', '__', '~~', '`']) {
    const count = a.split(mark).length - 1
    if (count % 2 === 1) { a += mark; b = mark + b }
  }
  return [a, b]
}

function splitText(s: string, maxChars: number): [string, string] {
  if (s.length <= maxChars) return [s, '']
  const head = s.slice(0, maxChars)
  let cut = -1
  const re = /[.!?]["')\]]?\s/g
  let m: RegExpExecArray | null
  while ((m = re.exec(head)) !== null) cut = m.index + m[0].length
  if (cut < maxChars * 0.4) {
    const sp = head.lastIndexOf(' ')
    cut = sp >= maxChars * 0.3 ? sp + 1 : maxChars
  }
  return rebalance(s.slice(0, cut).trim(), s.slice(cut).trim())
}

function takeParagraph(text: string, lines: number, fresh: boolean): [Piece, Piece] {
  const rows = text.split('\n')
  const head: string[] = []
  let used = 0
  let idx = 0
  for (; idx < rows.length; idx++) {
    const c = wrap(plainText(rows[idx]).length, CPL)
    if (used + c > lines) break
    head.push(rows[idx])
    used += c
  }
  if (idx >= rows.length) return [{ type: 'paragraph', text: head.join('\n') }, null]

  const remaining = lines - used
  const [a, b] = remaining >= 1 ? splitText(rows[idx], remaining * CPL) : ['', rows[idx]]
  if (a) head.push(a)
  const tailRows = [b, ...rows.slice(idx + 1)].filter(r => r !== '')
  if (head.length === 0) {
    if (!fresh) return [null, { type: 'paragraph', text }]
    // A fresh page must always make progress.
    const [h2, t2] = splitText(rows[idx], Math.max(CPL, lines * CPL))
    const rest = [t2, ...rows.slice(idx + 1)].filter(r => r !== '')
    return [{ type: 'paragraph', text: h2 }, rest.length ? { type: 'paragraph', text: rest.join('\n') } : null]
  }
  return [
    { type: 'paragraph', text: head.join('\n') },
    tailRows.length ? { type: 'paragraph', text: tailRows.join('\n') } : null,
  ]
}

function takeList(list: ListBlock, lines: number, fresh: boolean): [Piece, Piece] {
  const head: ListItemNode[] = []
  let used = 0.5
  for (const item of list.items) {
    const c = itemCost(item, 0)
    if (used + c > lines && head.length > 0) break
    if (used + c > lines && head.length === 0 && !fresh) return [null, list]
    head.push(item)
    used += c
  }
  if (head.length >= list.items.length) return [list, null]
  return [
    { ...list, items: head },
    { ...list, start: list.ordered ? list.start + head.length : 1, items: list.items.slice(head.length) },
  ]
}

function takeTable(t: TableBlock, lines: number, fresh: boolean): [Piece, Piece] {
  const cols = t.header.length
  let used = rowCost(t.header, cols) + 0.6
  const head: string[][] = []
  for (const row of t.rows) {
    const c = rowCost(row, cols)
    if (used + c > lines && head.length > 0) break
    if (used + c > lines && head.length === 0 && !fresh) return [null, t]
    head.push(row)
    used += c
  }
  if (head.length >= t.rows.length) return [t, null]
  return [
    { ...t, rows: head },
    { ...t, rows: t.rows.slice(head.length) }, // header repeats on the next page
  ]
}

function takeCode(b: Extract<NoteBlock, { type: 'code' }>, lines: number, fresh: boolean): [Piece, Piece] {
  const rows = b.text.split('\n')
  const head: string[] = []
  let used = 1.2
  for (const r of rows) {
    const c = wrap(r.length, CPL + 4)
    if (used + c > lines && head.length > 0) break
    if (used + c > lines && head.length === 0 && !fresh) return [null, b]
    head.push(r)
    used += c
  }
  if (head.length >= rows.length) return [b, null]
  return [
    { ...b, text: head.join('\n') },
    { ...b, text: rows.slice(head.length).join('\n') },
  ]
}

function takeQuote(b: Extract<NoteBlock, { type: 'quote' }>, lines: number, fresh: boolean): [Piece, Piece] {
  const head: NoteBlock[] = []
  let used = 0.8
  for (const inner of b.blocks) {
    const c = blockCost(inner)
    if (used + c > lines && head.length > 0) break
    if (used + c > lines && head.length === 0 && !fresh) return [null, b]
    head.push(inner)
    used += c
  }
  if (head.length >= b.blocks.length) return [b, null]
  return [
    { type: 'quote', blocks: head },
    { type: 'quote', blocks: b.blocks.slice(head.length) },
  ]
}

/** Splits `b` into [what fits in `lines`, the rest]. `[null, b]` means "does not fit here". */
function takeBlock(b: NoteBlock, lines: number, fresh: boolean): [Piece, Piece] {
  switch (b.type) {
    case 'paragraph': return takeParagraph(b.text, lines, fresh)
    case 'list': return takeList(b, lines, fresh)
    case 'table': return takeTable(b, lines, fresh)
    case 'code': return takeCode(b, lines, fresh)
    case 'quote': return takeQuote(b, lines, fresh)
    default:
      // heading, math, hr: cannot be split
      return blockCost(b) <= lines || fresh ? [b, null] : [null, b]
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
  }
}

function clip(s: string, max = 48): string {
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + '\u2026'
}

/* ------------------------------------------------------------------ */
/* Paginator                                                             */
/* ------------------------------------------------------------------ */

export function paginateBlocks(blocks: NoteBlock[], linesPerPage = LINES_PER_PAGE): NoteBlock[][] {
  const pages: NoteBlock[][] = []
  let cur: NoteBlock[] = []
  let used = 0

  // Closes the current page. A heading left alone at the bottom moves to the next page.
  const flush = () => {
    if (!cur.length) return
    const last = cur[cur.length - 1]
    if (cur.length > 1 && last.type === 'heading') {
      cur.pop()
      pages.push(cur)
      cur = [last]
      used = blockCost(last)
    } else {
      pages.push(cur)
      cur = []
      used = 0
    }
  }

  const queue = [...blocks]
  let guard = 0
  const MAX_STEPS = 20000

  while (queue.length && guard++ < MAX_STEPS) {
    const b = queue.shift()!

    if (b.type === 'heading' && b.level <= 2 && cur.length) flush()

    const c = blockCost(b)
    if (used + c <= linesPerPage) {
      cur.push(b)
      used += c
      continue
    }

    const room = linesPerPage - used

    // Fresh page and still too big: split it across pages.
    if (cur.length === 0) {
      const [head, tail] = takeBlock(b, linesPerPage, true)
      const piece = head ?? b
      cur.push(piece)
      used += blockCost(piece)
      flush()
      if (tail && tail !== b) queue.unshift(tail)
      continue
    }

    // Whole block fits on a fresh page: move it there intact.
    if (c <= linesPerPage) {
      flush()
      queue.unshift(b)
      continue
    }

    // Bigger than a page: fill the room left, if there is enough to be worth it.
    if (room >= 5) {
      const [head, tail] = takeBlock(b, room, false)
      if (head) {
        cur.push(head)
        flush()
        if (tail) queue.unshift(tail)
        continue
      }
    }
    flush()
    queue.unshift(b)
  }

  flush()
  return pages
}

export function slideify(raw: string): BookPage[] {
  const blocks = parseBlocks(raw)
  if (blocks.length === 0) return []
  const pages = paginateBlocks(blocks)

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
