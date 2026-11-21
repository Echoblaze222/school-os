// src/lib/utils/noteMarkdown.ts
//
// Pure (no React, no DOM) markdown parser for study notes. Teachers paste
// lesson notes straight from ChatGPT, which arrive as raw markdown:
//   ## headings, **bold**, *italic*, `code`, - bullets, 1. steps,
//   | tables |, > quotes, ``` code ```, $math$ and \( math \).
// Before this file existed the notes viewer printed those symbols literally.
//
// Output is a small AST of plain data. NoteMarkdown.tsx turns it into React
// elements, so user text is NEVER injected as HTML (stored-XSS safe). The only
// HTML in the viewer is KaTeX output for equations.
//
// Also tolerates what a rich-text copy produces: "•" bullets, non-breaking
// spaces, and tab-separated tables (rows copied from a rendered table).

export type Align = 'left' | 'center' | 'right' | null

export type InlineNode =
  | { t: 'text'; v: string }
  | { t: 'strong'; c: InlineNode[] }
  | { t: 'em'; c: InlineNode[] }
  | { t: 'del'; c: InlineNode[] }
  | { t: 'code'; v: string }
  | { t: 'link'; href: string; c: InlineNode[] }
  | { t: 'math'; v: string; display: boolean }
  | { t: 'br' }

export interface ListItemNode {
  text: string
  checked: boolean | null
  children: NoteBlock[] // nested lists
}

export interface ListBlock {
  type: 'list'
  ordered: boolean
  start: number
  items: ListItemNode[]
}

export interface TableBlock {
  type: 'table'
  header: string[]
  align: Align[]
  rows: string[][]
}

export type NoteBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | ListBlock
  | TableBlock
  | { type: 'code'; lang: string; text: string }
  | { type: 'quote'; blocks: NoteBlock[] }
  | { type: 'math'; text: string }
  | { type: 'hr' }

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

const TAB_WIDTH = 4
const MAX_MATH_LOOKAHEAD = 30

function indentOf(ws: string): number {
  let w = 0
  for (const ch of ws) {
    if (ch === ' ') w++
    else if (ch === '\t') w += TAB_WIDTH
    else break
  }
  return w
}

const LIST_RE = /^([ \t]*)([-*+\u2022\u25CF\u25AA\u25E6]|\d{1,4}[.)])[ \t]+(.*)$/
const HR_RE = /^[ ]{0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/
const HEADING_RE = /^[ ]{0,3}(#{1,6})[ \t]+(.+?)[ \t]*$/
const FENCE_OPEN_RE = /^[ ]{0,3}(`{3,}|~{3,})[ \t]*([^\s`]*)/
const QUOTE_RE = /^[ ]{0,3}>/
const SEP_CELL_RE = /^:?-+:?$/

function isHr(line: string): boolean {
  return HR_RE.test(line)
}

function isListLine(line: string): boolean {
  return LIST_RE.test(line) && !isHr(line)
}

function isFenceClose(line: string, marker: string): boolean {
  const t = line.trim()
  return t.length >= marker.length && t[0] === marker[0] && /^(`+|~+)$/.test(t)
}

/** Splits one markdown table row into trimmed cells. Honors "\|" escapes. */
function splitRow(line: string): string[] {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1)
  const cells: string[] = []
  let cur = ''
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === '\\' && s[i + 1] === '|') {
      cur += '|'
      i++
      continue
    }
    if (ch === '|') {
      cells.push(cur.trim())
      cur = ''
      continue
    }
    cur += ch
  }
  cells.push(cur.trim())
  return cells.map(c => c.replace(/<br\s*\/?>/gi, '\n'))
}

function isSeparatorRow(line: string): boolean {
  if (!line.includes('|')) return false
  const cells = splitRow(line)
  return cells.length >= 1 && cells.every(c => SEP_CELL_RE.test(c))
}

function alignOf(cell: string): Align {
  const left = cell.startsWith(':')
  const right = cell.endsWith(':')
  if (left && right) return 'center'
  if (right) return 'right'
  if (left) return 'left'
  return null
}

function normalizeRow(cells: string[], width: number): string[] {
  const out = cells.slice(0, width)
  while (out.length < width) out.push('')
  return out
}

function splitTabs(line: string): string[] {
  return line.replace(/\s+$/, '').split('\t').map(c => c.trim())
}

/* ------------------------------------------------------------------ */
/* Block parser                                                         */
/* ------------------------------------------------------------------ */

/** Display math: $$ ... $$ or \[ ... \] on its own line(s). */
function tryDisplayMath(lines: string[], i: number): { text: string; next: number } | null {
  const t = lines[i].trim()
  const pairs: [string, string][] = [['$$', '$$'], ['\\[', '\\]']]
  for (const [open, close] of pairs) {
    if (!t.startsWith(open)) continue
    const rest = t.slice(open.length)
    // Whole thing on one line: $$ x $$
    if (rest.endsWith(close) && rest.length > close.length) {
      const inner = rest.slice(0, rest.length - close.length)
      if (!inner.includes(close)) return { text: inner.trim(), next: i + 1 }
      return null // "$$a$$ and $$b$$" is a paragraph with inline math
    }
    if (rest.includes(close)) return null // text follows the closing token
    // Multi-line: look for the closing token a few lines down.
    const body: string[] = [rest]
    for (let j = i + 1; j < lines.length && j <= i + MAX_MATH_LOOKAHEAD; j++) {
      const idx = lines[j].indexOf(close)
      if (idx !== -1) {
        if (lines[j].slice(idx + close.length).trim()) return null
        body.push(lines[j].slice(0, idx))
        return { text: body.join('\n').trim(), next: j + 1 }
      }
      body.push(lines[j])
    }
    return null // never closed: do not swallow the rest of the note
  }
  return null
}

function makeItem(text: string): ListItemNode {
  const task = /^\[( |x|X)\][ \t]+(.*)$/.exec(text)
  if (task) return { text: task[2], checked: task[1] !== ' ', children: [] }
  return { text, checked: null, children: [] }
}

interface ListLevel {
  indent: number
  list: ListBlock
  last: ListItemNode | null
}

function parseList(lines: string[], start: number): { block: ListBlock; next: number } {
  const first = LIST_RE.exec(lines[start])!
  const baseIndent = indentOf(first[1])
  const rootOrdered = /\d/.test(first[2])
  const root: ListBlock = {
    type: 'list',
    ordered: rootOrdered,
    start: rootOrdered ? parseInt(first[2], 10) : 1,
    items: [],
  }
  const stack: ListLevel[] = [{ indent: baseIndent, list: root, last: null }]
  let i = start

  while (i < lines.length) {
    const line = lines[i]

    if (!line.trim()) {
      // A blank line only ends the list if what follows is not part of it.
      let k = i + 1
      while (k < lines.length && !lines[k].trim()) k++
      if (k >= lines.length) break
      const nxt = lines[k]
      const nm = LIST_RE.exec(nxt)
      if (nm && !isHr(nxt) && indentOf(nm[1]) >= baseIndent) { i = k; continue }
      if (!nm && indentOf(/^[ \t]*/.exec(nxt)![0]) > baseIndent && stack[stack.length - 1].last) { i = k; continue }
      break
    }

    const m = LIST_RE.exec(line)
    if (m && !isHr(line)) {
      const ind = indentOf(m[1])
      if (ind < baseIndent) break
      const ordered = /\d/.test(m[2])
      while (stack.length > 1 && ind < stack[stack.length - 1].indent) stack.pop()
      let top = stack[stack.length - 1]
      if (ind > top.indent && top.last) {
        const child: ListBlock = {
          type: 'list',
          ordered,
          start: ordered ? parseInt(m[2], 10) : 1,
          items: [],
        }
        top.last.children.push(child)
        top = { indent: ind, list: child, last: null }
        stack.push(top)
      }
      const item = makeItem(m[3])
      top.list.items.push(item)
      top.last = item
      i++
      continue
    }

    // Indented non-item line: continuation of the previous item.
    const lead = /^[ \t]*/.exec(line)![0]
    const top = stack[stack.length - 1]
    if (indentOf(lead) > baseIndent && top.last) {
      top.last.text += '\n' + line.trim()
      i++
      continue
    }
    break
  }

  return { block: root, next: i }
}

function tryTabTable(lines: string[], i: number): { block: TableBlock; next: number } | null {
  const first = splitTabs(lines[i])
  if (first.length < 2) return null
  const rows: string[][] = [first]
  let j = i + 1
  while (j < lines.length && lines[j].includes('\t')) {
    const cells = splitTabs(lines[j])
    if (cells.length !== first.length) break
    rows.push(cells)
    j++
  }
  if (rows.length < 2) return null
  return {
    block: {
      type: 'table',
      header: rows[0],
      align: rows[0].map(() => null),
      rows: rows.slice(1),
    },
    next: j,
  }
}

function parseLines(lines: string[]): NoteBlock[] {
  const blocks: NoteBlock[] = []
  let para: string[] = []
  let i = 0

  const flushPara = () => {
    if (para.length) {
      blocks.push({ type: 'paragraph', text: para.join('\n') })
      para = []
    }
  }

  while (i < lines.length) {
    const line = lines[i]

    if (!line.trim()) { flushPara(); i++; continue }

    // Fenced code block
    const fence = FENCE_OPEN_RE.exec(line)
    if (fence) {
      flushPara()
      const marker = fence[1]
      const body: string[] = []
      i++
      while (i < lines.length && !isFenceClose(lines[i], marker)) { body.push(lines[i]); i++ }
      i++ // closing fence (or end of input)
      blocks.push({ type: 'code', lang: fence[2] || '', text: body.join('\n') })
      continue
    }

    // Display math
    const math = tryDisplayMath(lines, i)
    if (math) {
      flushPara()
      blocks.push({ type: 'math', text: math.text })
      i = math.next
      continue
    }

    // Heading
    const h = HEADING_RE.exec(line)
    if (h) {
      const text = h[2].replace(/[ \t]+#+[ \t]*$/, '').trim()
      if (text) {
        flushPara()
        blocks.push({ type: 'heading', level: h[1].length, text })
        i++
        continue
      }
    }

    // Horizontal rule
    if (isHr(line)) { flushPara(); blocks.push({ type: 'hr' }); i++; continue }

    // Pipe table
    if (line.includes('|') && i + 1 < lines.length && isSeparatorRow(lines[i + 1])) {
      const header = splitRow(line)
      const sep = splitRow(lines[i + 1])
      if (header.length === sep.length) {
        flushPara()
        const rows: string[][] = []
        let j = i + 2
        while (j < lines.length && lines[j].trim() && lines[j].includes('|')) {
          rows.push(normalizeRow(splitRow(lines[j]), header.length))
          j++
        }
        blocks.push({ type: 'table', header, align: sep.map(alignOf), rows })
        i = j
        continue
      }
    }

    // Blockquote
    if (QUOTE_RE.test(line)) {
      flushPara()
      const inner: string[] = []
      while (i < lines.length && QUOTE_RE.test(lines[i])) {
        inner.push(lines[i].replace(/^[ ]{0,3}>[ ]?/, ''))
        i++
      }
      blocks.push({ type: 'quote', blocks: parseLines(inner) })
      continue
    }

    // List
    if (isListLine(line)) {
      flushPara()
      const res = parseList(lines, i)
      blocks.push(res.block)
      i = res.next
      continue
    }

    // Tab-separated table (rows copied from a rendered table)
    if (line.includes('\t')) {
      const tt = tryTabTable(lines, i)
      if (tt) {
        flushPara()
        blocks.push(tt.block)
        i = tt.next
        continue
      }
    }

    para.push(line.trim())
    i++
  }

  flushPara()
  return blocks
}

export function parseBlocks(raw: string): NoteBlock[] {
  const text = (raw ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b\u200c\u200d\ufeff]/g, '')
  return parseLines(text.split('\n'))
}

/* ------------------------------------------------------------------ */
/* Inline parser                                                        */
/* ------------------------------------------------------------------ */

const ESCAPABLE = '\\`*_{}[]()#+-.!|~$<>"\'&%'
const PROSE_WORD_RE = /\b(and|or|the|is|are|was|were|in|on|at|to|of|for|with|this|that|have|has|will|can|not|but|my|your|his|her)\b/i

/** Decides whether a single-dollar span is really math, not "$5 and $10". */
function looksLikeMath(expr: string): boolean {
  if (!expr || /^\s|\s$/.test(expr)) return false
  if (/^[\d.,]+$/.test(expr)) return false
  if (/\\/.test(expr)) return true
  if (PROSE_WORD_RE.test(expr)) return false
  return /[a-zA-Z^_]/.test(expr)
}

/** Only http(s) and mailto links are allowed. Anything else renders as text. */
export function safeUrl(url: string): string | null {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'mailto:' ? u.href : null
  } catch {
    return null
  }
}

function isWordChar(ch: string | undefined): boolean {
  return !!ch && /[A-Za-z0-9]/.test(ch)
}

/** Finds the start index of the closing run for an emphasis opener. */
function findClose(src: string, from: number, ch: string, len: number): number {
  let j = from
  while (j < src.length) {
    const c = src[j]
    if (c === '\\') { j += 2; continue }
    if (c === '`') {
      let run = 1
      while (src[j + run] === '`') run++
      const end = src.indexOf('`'.repeat(run), j + run)
      j = end === -1 ? j + run : end + run
      continue
    }
    if (c === ch) {
      let run = 1
      while (src[j + run] === ch) run++
      const prev = src[j - 1]
      const after = src[j + run]
      const closes =
        run >= len &&
        j > from &&
        !!prev && !/\s/.test(prev) &&
        (ch === '*' || !isWordChar(after))
      if (closes) return j
      j += run
      continue
    }
    j++
  }
  return -1
}

function findClosingDollar(src: string, from: number): number {
  for (let j = from; j < src.length; j++) {
    const c = src[j]
    if (c === '\\') { j++; continue }
    if (c === '\n') return -1
    if (c === '$') return j
  }
  return -1
}

export function parseInline(src: string): InlineNode[] {
  const out: InlineNode[] = []
  let buf = ''
  let i = 0
  const n = src.length

  const flush = () => {
    if (buf) { out.push({ t: 'text', v: buf }); buf = '' }
  }

  while (i < n) {
    const ch = src[i]

    if (ch === '\n') { flush(); out.push({ t: 'br' }); i++; continue }

    if (ch === '<') {
      const m = /^<br\s*\/?>/i.exec(src.slice(i, i + 8))
      if (m) { flush(); out.push({ t: 'br' }); i += m[0].length; continue }
    }

    if (ch === '\\') {
      const nx = src[i + 1]
      if (nx === '(') {
        const end = src.indexOf('\\)', i + 2)
        if (end > i + 2) {
          flush()
          out.push({ t: 'math', v: src.slice(i + 2, end).trim(), display: false })
          i = end + 2
          continue
        }
      }
      if (nx === '[') {
        const end = src.indexOf('\\]', i + 2)
        if (end > i + 2) {
          flush()
          out.push({ t: 'math', v: src.slice(i + 2, end).trim(), display: true })
          i = end + 2
          continue
        }
      }
      if (nx && ESCAPABLE.includes(nx)) { buf += nx; i += 2; continue }
      buf += ch
      i++
      continue
    }

    if (ch === '`') {
      let run = 1
      while (src[i + run] === '`') run++
      const fence = '`'.repeat(run)
      const end = src.indexOf(fence, i + run)
      if (end !== -1) {
        flush()
        out.push({ t: 'code', v: src.slice(i + run, end).trim() })
        i = end + run
        continue
      }
      buf += fence
      i += run
      continue
    }

    if (ch === '$') {
      if (src[i + 1] === '$') {
        const end = src.indexOf('$$', i + 2)
        if (end > i + 2) {
          flush()
          out.push({ t: 'math', v: src.slice(i + 2, end).trim(), display: true })
          i = end + 2
          continue
        }
      }
      const end = findClosingDollar(src, i + 1)
      if (end !== -1) {
        const expr = src.slice(i + 1, end)
        if (looksLikeMath(expr)) {
          flush()
          out.push({ t: 'math', v: expr.trim(), display: false })
          i = end + 1
          continue
        }
      }
      buf += ch
      i++
      continue
    }

    if (ch === '*' || ch === '_') {
      let run = 1
      while (src[i + run] === ch) run++
      const prev = src[i - 1]
      const next = src[i + run]
      const canOpen =
        run <= 3 &&
        next !== undefined && !/\s/.test(next) &&
        (ch === '*' || !isWordChar(prev))
      if (canOpen) {
        const close = findClose(src, i + run, ch, run)
        if (close !== -1) {
          const inner = parseInline(src.slice(i + run, close))
          flush()
          if (run === 3) out.push({ t: 'strong', c: [{ t: 'em', c: inner }] })
          else out.push({ t: run === 2 ? 'strong' : 'em', c: inner })
          i = close + run
          continue
        }
      }
      buf += ch.repeat(run)
      i += run
      continue
    }

    if (ch === '~' && src[i + 1] === '~') {
      const next = src[i + 2]
      if (next !== undefined && !/\s/.test(next)) {
        const end = src.indexOf('~~', i + 2)
        if (end > i + 2) {
          flush()
          out.push({ t: 'del', c: parseInline(src.slice(i + 2, end)) })
          i = end + 2
          continue
        }
      }
    }

    if (ch === '[') {
      const m = /^\[([^\]\n]+)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/.exec(src.slice(i))
      if (m) {
        flush()
        const label = parseInline(m[1])
        const href = safeUrl(m[2])
        if (href) out.push({ t: 'link', href, c: label })
        else out.push(...label)
        i += m[0].length
        continue
      }
    }

    if ((ch === 'h' || ch === 'H') && !isWordChar(src[i - 1])) {
      const m = /^https?:\/\/[^\s<>]+/i.exec(src.slice(i))
      if (m) {
        const url = m[0].replace(/[.,;:!?)\]"']+$/, '')
        const href = safeUrl(url)
        if (href) {
          flush()
          out.push({ t: 'link', href, c: [{ t: 'text', v: url }] })
          i += url.length
          continue
        }
      }
    }

    buf += ch
    i++
  }

  flush()
  return out
}

/** Plain text of an inline source string (markers stripped). Used for titles and size estimates. */
export function plainText(src: string): string {
  return src
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\\([\\`*_{}[\]()#+\-.!|~$<>])/g, '$1')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
