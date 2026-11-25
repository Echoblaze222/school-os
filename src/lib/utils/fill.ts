// src/lib/utils/fill.ts
//
// Fills book pages COMPLETELY before starting the next one, like a word processor.
//
// It is pure: you give it a way to measure a block (`heightOf`) and the height of a
// page (`capacity`). The browser passes real measured pixel heights (see
// measureBlocks.tsx) so pages are exactly full; the server/tests pass an estimate.
//
// Rules:
//   - Blocks are packed one after another. A page only ends when it is full or the
//     writer inserted a page break (\pagebreak). Headings do NOT force a new page.
//   - A block that does not fit in the room left is SPLIT to fill that room: a
//     paragraph at a word (preferring a sentence end), a list by items (numbering
//     continues), a table by rows (header repeated), code by lines.
//   - No orphans: a paragraph never leaves fewer than a few words behind, a table
//     keeps at least 2 rows on each side, and a heading is never left alone at the
//     bottom of a page.

import type { NoteBlock, ListBlock, TableBlock } from './noteMarkdown'

export type HeightOf = (b: NoteBlock) => number

const MIN_HEAD_WORDS = 8
const MIN_TAIL_WORDS = 4

/** Keeps **bold**, ~~strike~~ and `code` balanced when text is cut in two. */
export function rebalance(a: string, b: string): [string, string] {
  for (const mark of ['**', '__', '~~', '`']) {
    const count = a.split(mark).length - 1
    if (count % 2 === 1) { a += mark; b = mark + b }
  }
  return [a, b]
}

/** Word-like tokens; links, images and $math$ stay in one piece so they are never cut. */
function tokens(text: string): string[] {
  return text.match(/!?\[[^\]\n]*\]\([^)\n]*\)\s*|\$[^$\n]+\$\s*|\S+\s*/g) ?? []
}

interface Units {
  count: number
  min: number
  max: number
  take: (n: number) => NoteBlock
  rest: (n: number) => NoteBlock
}

function unitsOf(b: NoteBlock): Units | null {
  switch (b.type) {
    case 'paragraph': {
      if (b.text.includes('![')) return null // an image paragraph is never cut
      const toks = tokens(b.text)
      if (toks.length < MIN_HEAD_WORDS + MIN_TAIL_WORDS) return null
      const cut = (n: number): [string, string] => rebalance(toks.slice(0, n).join('').trim(), toks.slice(n).join('').trim())
      return {
        count: toks.length, min: MIN_HEAD_WORDS, max: toks.length - MIN_TAIL_WORDS,
        take: n => ({ type: 'paragraph', text: cut(n)[0] }),
        rest: n => ({ type: 'paragraph', text: cut(n)[1] }),
      }
    }
    case 'list': {
      if (b.items.length < 2) return null
      const l: ListBlock = b
      return {
        count: l.items.length, min: 1, max: l.items.length - 1,
        take: n => ({ ...l, items: l.items.slice(0, n) }),
        rest: n => ({ ...l, start: l.ordered ? l.start + n : 1, items: l.items.slice(n) }),
      }
    }
    case 'table': {
      if (b.rows.length < 4) return null
      const t: TableBlock = b
      return {
        count: t.rows.length, min: 2, max: t.rows.length - 2,
        take: n => ({ ...t, rows: t.rows.slice(0, n) }),
        rest: n => ({ ...t, rows: t.rows.slice(n) }), // header repeats on the next page
      }
    }
    case 'code': {
      const rows = b.text.split('\n')
      if (rows.length < 6) return null
      return {
        count: rows.length, min: 3, max: rows.length - 3,
        take: n => ({ ...b, text: rows.slice(0, n).join('\n') }),
        rest: n => ({ ...b, text: rows.slice(n).join('\n') }),
      }
    }
    case 'quote': {
      if (b.blocks.length < 2) return null
      return {
        count: b.blocks.length, min: 1, max: b.blocks.length - 1,
        take: n => ({ type: 'quote', blocks: b.blocks.slice(0, n) }),
        rest: n => ({ type: 'quote', blocks: b.blocks.slice(n) }),
      }
    }
    default:
      return null
  }
}

/** Largest head of `b` that satisfies `fits`, plus the remainder. [null, b] = cannot be split to fit here. */
export function bestHead(b: NoteBlock, fits: (piece: NoteBlock) => boolean): [NoteBlock | null, NoteBlock | null] {
  const u = unitsOf(b)
  if (!u || u.max < u.min) return [null, b]
  if (!fits(u.take(u.min))) return [null, b]
  let lo = u.min
  let hi = u.max
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (fits(u.take(mid))) lo = mid
    else hi = mid - 1
  }
  let n = lo
  if (b.type === 'paragraph') {
    // Prefer ending the page at a sentence end if one is close to the cut.
    const toks = tokens(b.text)
    for (let k = n; k >= Math.max(u.min, Math.floor(n * 0.75)); k--) {
      if (/[.!?]["')\]]?\s*$/.test(toks[k - 1])) { n = k; break }
    }
  }
  return [u.take(n), u.rest(n)]
}

export function paginateByHeight(blocks: NoteBlock[], heightOf: HeightOf, capacity: number): NoteBlock[][] {
  const pages: NoteBlock[][] = []
  let cur: NoteBlock[] = []
  let used = 0

  const cache = new Map<NoteBlock, number>()
  const h = (b: NoteBlock) => {
    let v = cache.get(b)
    if (v === undefined) { v = heightOf(b); cache.set(b, v) }
    return v
  }

  // Closes the page. A heading left alone at the bottom moves to the next page.
  const flush = () => {
    if (!cur.length) return
    const last = cur[cur.length - 1]
    if (cur.length > 1 && last.type === 'heading') {
      cur.pop()
      pages.push(cur)
      cur = [last]
      used = h(last)
    } else {
      pages.push(cur)
      cur = []
      used = 0
    }
  }

  const queue = [...blocks]
  let guard = 0
  while (queue.length && guard++ < 50000) {
    const b = queue.shift()!

    if (b.type === 'pagebreak') {
      // Never carry a lone heading across a manual break; just close the page.
      if (cur.length) { pages.push(cur); cur = []; used = 0 }
      continue
    }

    const bh = h(b)
    if (used + bh <= capacity) { cur.push(b); used += bh; continue }

    const [head, tail] = bestHead(b, piece => used + h(piece) <= capacity)
    if (head) {
      cur.push(head)
      used += h(head)
      flush()
      if (tail) queue.unshift(tail)
      continue
    }
    if (cur.length === 0) { cur.push(b); flush(); continue } // taller than a page and cannot be split: place it (the page scrolls)
    flush()
    queue.unshift(b)
  }

  flush()
  return pages
}
