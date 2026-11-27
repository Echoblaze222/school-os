// src/lib/notebooks/editorActions.ts
//
// Pure text transforms behind the note editor toolbar (headings, bold, lists,
// table, page break...). Each takes the text and the selection and returns the
// new text and selection, so they are easy to test and have no DOM in them.
// The note is stored as plain text with markdown markers; the book and the
// preview turn those markers into real formatting.

export interface Edit { value: string; start: number; end: number }

const BULLET_RE = /^[ \t]*[-*+\u2022][ \t]+/
const NUMBER_RE = /^[ \t]*\d{1,4}[.)][ \t]+/
const HEADING_RE = /^[ ]{0,3}#{1,6}[ \t]+/
const QUOTE_RE = /^[ ]{0,3}>[ ]?/
const TASK_RE = /^[ \t]*[-*+][ \t]+\[[ xX]\][ \t]+/

/** Start/end offsets of the whole lines touched by the selection. */
function lineRange(v: string, s: number, e: number): [number, number] {
  const start = v.lastIndexOf('\n', s - 1) + 1
  const endProbe = e > s && v[e - 1] === '\n' ? e - 1 : e
  const nl = v.indexOf('\n', endProbe)
  return [start, nl === -1 ? v.length : nl]
}

function mapLines(v: string, s: number, e: number, fn: (line: string, index: number) => string): Edit {
  const [a, b] = lineRange(v, s, e)
  const lines = v.slice(a, b).split('\n')
  const out = lines.map(fn).join('\n')
  return { value: v.slice(0, a) + out + v.slice(b), start: a, end: a + out.length }
}

const stripMarkers = (line: string) =>
  line.replace(HEADING_RE, '').replace(TASK_RE, '').replace(BULLET_RE, '').replace(NUMBER_RE, '').replace(QUOTE_RE, '')

/** level 0 = normal text. Pressing the same heading again turns it back into normal text. */
export function setHeading(v: string, s: number, e: number, level: 0 | 1 | 2 | 3): Edit {
  const [a, b] = lineRange(v, s, e)
  const allSame = level > 0 && v.slice(a, b).split('\n').filter(l => l.trim()).every(l => new RegExp(`^[ ]{0,3}#{${level}}[ \\t]+`).test(l))
  return mapLines(v, s, e, line => {
    if (!line.trim()) return line
    const plain = stripMarkers(line)
    return allSame || level === 0 ? plain : `${'#'.repeat(level)} ${plain}`
  })
}

function toggleList(v: string, s: number, e: number, test: RegExp, make: (n: number) => string): Edit {
  const [a, b] = lineRange(v, s, e)
  const filled = v.slice(a, b).split('\n').filter(l => l.trim())
  const allOn = filled.length > 0 && filled.every(l => test.test(l))
  let n = 0
  return mapLines(v, s, e, line => {
    if (!line.trim()) return line
    const plain = stripMarkers(line)
    if (allOn) return plain
    n++
    return make(n) + plain
  })
}

export const toggleBullets = (v: string, s: number, e: number) => toggleList(v, s, e, BULLET_RE, () => '- ')
export const toggleNumbered = (v: string, s: number, e: number) => toggleList(v, s, e, NUMBER_RE, n => `${n}. `)
export const toggleChecklist = (v: string, s: number, e: number) => toggleList(v, s, e, TASK_RE, () => '- [ ] ')
export const toggleQuote = (v: string, s: number, e: number) => toggleList(v, s, e, QUOTE_RE, () => '> ')

/** Wraps the selection in a marker (**bold**, *italic*, ~~strike~~, `code`). Again = unwrap. No selection inserts a placeholder. */
export function toggleWrap(v: string, s: number, e: number, mark: string, placeholder: string): Edit {
  const m = mark.length
  if (s === e) {
    const text = mark + placeholder + mark
    return { value: v.slice(0, s) + text + v.slice(e), start: s + m, end: s + m + placeholder.length }
  }
  const before = v.slice(s - m, s)
  const after = v.slice(e, e + m)
  const extra = mark === '*' && (v[s - m - 1] === '*' || v[e + m] === '*') // part of **bold**, not italic
  if (before === mark && after === mark && !extra) {
    return { value: v.slice(0, s - m) + v.slice(s, e) + v.slice(e + m), start: s - m, end: e - m }
  }
  const inner = v.slice(s, e)
  // Keep markers hugging the words, not the spaces around them.
  const lead = inner.match(/^\s*/)![0]
  const trail = inner.match(/\s*$/)![0]
  const core = inner.slice(lead.length, inner.length - trail.length) || inner
  const wrapped = lead + mark + core + mark + trail
  return { value: v.slice(0, s) + wrapped + v.slice(e), start: s + lead.length + m, end: s + lead.length + m + core.length }
}

/**
 * Inserts a block on its own paragraph (blank line before and after).
 * If the cursor is in the middle of a line, the block goes AFTER that line, and after
 * the whole table when the line is a table row, so it never cuts text or a table in two.
 */
export function insertBlock(v: string, s: number, e: number, text: string, selectFrom = 0, selectLen = 0): Edit {
  let at = e
  const lineStart = v.lastIndexOf('\n', s - 1) + 1
  const nl = v.indexOf('\n', e)
  const lineEnd = nl === -1 ? v.length : nl
  const hasTextBefore = v.slice(lineStart, s).trim().length > 0
  const hasTextAfter = v.slice(e, lineEnd).trim().length > 0
  const inTable = /^\s*\|/.test(v.slice(lineStart, lineEnd))
  if (inTable || (hasTextBefore && hasTextAfter)) {
    at = lineEnd
    if (inTable) {
      // jump to the end of the table: keep going while the next lines are table rows
      let pos = lineEnd
      while (pos < v.length) {
        const next = v.indexOf('\n', pos + 1)
        const end = next === -1 ? v.length : next
        if (/^\s*\|/.test(v.slice(pos + 1, end))) pos = end
        else break
      }
      at = pos
    }
  }
  const before = v.slice(0, at)
  const after = v.slice(at)
  const pre = before.length === 0 || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n'
  const post = after.length === 0 ? '\n' : after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n'
  const value = before + pre + text + post + after
  const base = before.length + pre.length
  return { value, start: base + selectFrom, end: base + selectFrom + selectLen }
}

export function insertTable(v: string, s: number, e: number, cols = 3, rows = 2): Edit {
  const header = '| ' + Array.from({ length: cols }, (_, i) => `Column ${i + 1}`).join(' | ') + ' |'
  const sep = '|' + Array.from({ length: cols }, () => ' --- ').join('|') + '|'
  const row = '|' + Array.from({ length: cols }, () => '  ').join('|') + '|'
  const text = [header, sep, ...Array.from({ length: rows }, () => row)].join('\n')
  return insertBlock(v, s, e, text, 2, 'Column 1'.length)
}

export const insertDivider = (v: string, s: number, e: number) => insertBlock(v, s, e, '---')
export const insertPageBreak = (v: string, s: number, e: number) => insertBlock(v, s, e, '\\pagebreak')

/** Adds an image on its own line. Brackets in the caption are removed so the markdown stays valid. */
export const insertImage = (v: string, s: number, e: number, url: string, alt: string) =>
  insertBlock(v, s, e, `![${alt.replace(/[\[\]]/g, '').trim() || 'Image'}](${url})`)
