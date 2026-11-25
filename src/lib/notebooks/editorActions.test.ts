import { describe, it, expect } from 'vitest'
import { setHeading, toggleBullets, toggleNumbered, toggleChecklist, toggleQuote, toggleWrap, insertTable, insertPageBreak, insertDivider } from './editorActions'
import { parseBlocks } from '@/lib/utils/noteMarkdown'

describe('editor actions', () => {
  it('heading: applies to the line, replaces another heading, toggles off', () => {
    let r = setHeading('Hello world', 3, 3, 2)
    expect(r.value).toBe('## Hello world')
    r = setHeading(r.value, 3, 3, 3)
    expect(r.value).toBe('### Hello world')
    r = setHeading(r.value, 3, 3, 3)
    expect(r.value).toBe('Hello world')
  })
  it('heading works on every selected line and leaves blank lines alone', () => {
    const v = 'one\n\ntwo'
    expect(setHeading(v, 0, v.length, 1).value).toBe('# one\n\n# two')
  })
  it('bullets and numbers: add, convert between, remove', () => {
    const v = 'a\nb\nc'
    const b = toggleBullets(v, 0, v.length)
    expect(b.value).toBe('- a\n- b\n- c')
    const n = toggleNumbered(b.value, b.start, b.end)
    expect(n.value).toBe('1. a\n2. b\n3. c')
    expect(toggleNumbered(n.value, n.start, n.end).value).toBe('a\nb\nc')
  })
  it('checklist and quote', () => {
    expect(toggleChecklist('task', 0, 4).value).toBe('- [ ] task')
    expect(toggleQuote('wise words', 0, 10).value).toBe('> wise words')
  })
  it('bold: wraps a selection, unwraps again, and placeholders with no selection', () => {
    const v = 'make this bold now'
    const w = toggleWrap(v, 5, 9, '**', 'bold text')
    expect(w.value).toBe('make **this** bold now')
    expect(w.value.slice(w.start, w.end)).toBe('this')
    expect(toggleWrap(w.value, w.start, w.end, '**', 'x').value).toBe(v)
    const p = toggleWrap('', 0, 0, '**', 'bold text')
    expect(p.value).toBe('**bold text**')
    expect(p.value.slice(p.start, p.end)).toBe('bold text')
  })
  it('wrapping keeps markers off the spaces around the selection', () => {
    expect(toggleWrap('a b c', 1, 4, '*', 'x').value).toBe('a *b* c')
  })
  it('a page break never cuts a table or a line in half', () => {
    const table = '| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |'
    const mid = table.indexOf('1')
    const r = insertPageBreak(table + '\n\nafter', mid, mid)
    expect(parseBlocks(r.value).map(b => b.type)).toEqual(['table', 'pagebreak', 'paragraph'])
    expect((parseBlocks(r.value)[0] as any).rows).toHaveLength(2)
    // a selected word inside a table header must not be replaced or split either
    const sel = insertPageBreak(table, 2, 3)
    expect(parseBlocks(sel.value).map(b => b.type)).toEqual(['table', 'pagebreak'])
    const line = insertPageBreak('hello world', 5, 5)
    expect(parseBlocks(line.value).map(b => b.type)).toEqual(['paragraph', 'pagebreak'])
    expect((parseBlocks(line.value)[0] as any).text).toBe('hello world')
  })
  it('table / divider / page break go on their own paragraph and parse correctly', () => {
    const t = insertTable('Intro', 5, 5)
    const blocks = parseBlocks(t.value)
    expect(blocks.map(b => b.type)).toEqual(['paragraph', 'table'])
    expect((blocks[1] as any).header).toEqual(['Column 1', 'Column 2', 'Column 3'])
    expect((blocks[1] as any).rows).toHaveLength(2)
    expect(t.value.slice(t.start, t.end)).toBe('Column 1')
    expect(parseBlocks(insertPageBreak('a\n\nb', 1, 1).value).map(b => b.type)).toEqual(['paragraph', 'pagebreak', 'paragraph'])
    expect(parseBlocks(insertDivider('', 0, 0).value).map(b => b.type)).toEqual(['hr'])
  })
})
