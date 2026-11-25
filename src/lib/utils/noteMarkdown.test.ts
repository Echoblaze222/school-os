import { describe, it, expect } from 'vitest'
import { parseBlocks, parseInline, safeUrl, plainText, type NoteBlock } from './noteMarkdown'
import { slideify, blockCost, LINES_PER_PAGE } from './slideify'

const CHATGPT_NOTE = `## Photosynthesis

**Photosynthesis** is the process by which plants make food using *sunlight*.

### Key Terms
- **Chlorophyll**: the green pigment
- **Stomata**: tiny pores
  - Found on the underside of leaves
- Water (H~2~O)

| Stage | Location | Product |
|:------|:--------:|--------:|
| Light reactions | Thylakoid | ATP, NADPH |
| Calvin cycle | Stroma | Glucose |

The equation is $6CO_2 + 6H_2O \\rightarrow C_6H_{12}O_6 + 6O_2$ and it costs $5 and $10.

\\[ E = mc^2 \\]

1. First step
2. Second step
   - detail a
   - detail b
3. Third step

> Remember: light is needed.

\`\`\`python
print("hello | world")
\`\`\`

---
`

function types(bs: NoteBlock[]) { return bs.map(b => b.type) }

describe('parseBlocks', () => {
  const blocks = parseBlocks(CHATGPT_NOTE)

  it('recognises every block kind', () => {
    expect(types(blocks)).toEqual([
      'heading', 'paragraph', 'heading', 'list', 'table', 'paragraph', 'math', 'list', 'quote', 'code', 'hr',
    ])
  })
  it('parses the table with alignment and no stray pipes', () => {
    const t = blocks[4] as Extract<NoteBlock, { type: 'table' }>
    expect(t.header).toEqual(['Stage', 'Location', 'Product'])
    expect(t.align).toEqual(['left', 'center', 'right'])
    expect(t.rows).toEqual([['Light reactions', 'Thylakoid', 'ATP, NADPH'], ['Calvin cycle', 'Stroma', 'Glucose']])
  })
  it('nests lists', () => {
    const l = blocks[3] as Extract<NoteBlock, { type: 'list' }>
    expect(l.items).toHaveLength(3)
    expect(l.items[1].children).toHaveLength(1)
    const o = blocks[7] as Extract<NoteBlock, { type: 'list' }>
    expect(o.ordered).toBe(true)
    expect(o.items).toHaveLength(3)
    expect((o.items[1].children[0] as any).items).toHaveLength(2)
  })
  it('keeps code verbatim (pipes and all)', () => {
    expect((blocks[9] as any).text).toBe('print("hello | world")')
  })
  it('does not eat the whole note on an unclosed $$', () => {
    const b = parseBlocks('$$ x\n\nnormal paragraph\n\nanother')
    expect(types(b)).toEqual(['paragraph', 'paragraph', 'paragraph'])
  })
  it('turns tab-separated rows into a table', () => {
    const b = parseBlocks('Name\tAge\nAda\t30\nBob\t25')
    expect(types(b)).toEqual(['table'])
  })
  it('handles bullet glyphs and task items', () => {
    const b = parseBlocks('\u2022 one\n\u2022 two\n\n- [x] done\n- [ ] todo')
    // A blank line between same-indent items keeps one (loose) list.
    expect(types(b)).toEqual(['list'])
    expect((b[0] as any).items.map((i: any) => i.checked)).toEqual([null, null, true, false])
  })
  it('empty and whitespace input gives no blocks', () => {
    expect(parseBlocks('')).toEqual([])
    expect(parseBlocks('  \n \n')).toEqual([])
  })
})

function flat(nodes: ReturnType<typeof parseInline>): string {
  return nodes.map(n => {
    switch (n.t) {
      case 'text': return n.v
      case 'br': return '\n'
      case 'code': return n.v
      case 'math': return `[M:${n.v}]`
      case 'link': return flat(n.c)
      case 'image': return n.alt
      default: return flat(n.c)
    }
  }).join('')
}

describe('parseInline', () => {
  it('bold / italic / code / strike leave no markers behind', () => {
    const out = flat(parseInline('**bold** and *it* and `x` and ~~gone~~ and ***both***'))
    expect(out).toBe('bold and it and x and gone and both')
  })
  it('does not treat snake_case or 5 * 3 * 2 as emphasis', () => {
    expect(flat(parseInline('use snake_case_name here'))).toBe('use snake_case_name here')
    expect(flat(parseInline('5 * 3 * 2'))).toBe('5 * 3 * 2')
  })
  it('math: $..$, \\(..\\), but not prices', () => {
    expect(flat(parseInline('a $x^2$ b'))).toBe('a [M:x^2] b')
    expect(flat(parseInline('a \\(y\\) b'))).toBe('a [M:y] b')
    expect(flat(parseInline('costs $5 and $10 today'))).toBe('costs $5 and $10 today')
  })
  it('backslash escapes print the symbol', () => {
    expect(flat(parseInline('1\\. not a list \\*star\\*'))).toBe('1. not a list *star*')
  })
  it('<br> becomes a line break', () => {
    expect(flat(parseInline('a<br>b'))).toBe('a\nb')
  })
  it('links: only safe protocols become links', () => {
    expect(parseInline('[ok](https://example.com)')[0].t).toBe('link')
    const bad = parseInline('[evil](javascript:alert(1))')
    expect(bad.some(n => n.t === 'link')).toBe(false)
    expect(safeUrl('javascript:alert(1)')).toBeNull()
    expect(safeUrl('data:text/html,<script>')).toBeNull()
    expect(safeUrl('/relative')).toBeNull()
  })
  it('images: https becomes an image node, other schemes become alt text', () => {
    const ok = parseInline('![A river](https://example.com/a.jpg)')
    expect(ok).toEqual([{ t: 'image', src: 'https://example.com/a.jpg', alt: 'A river' }])
    const bad = parseInline('![x](javascript:alert(1))')
    expect(bad.some(n => n.t === 'image')).toBe(false)
    expect(flat(parseInline('![alt](http://insecure.example/x.png)'))).toBe('alt')
  })
  it('a long image url does not leak into plain text sizes', () => {
    expect(plainText('![A river](https://example.com/' + 'x'.repeat(300) + ')')).toBe('A river')
  })
  it('raw html is just text', () => {
    const n = parseInline('<img src=x onerror=alert(1)>')
    expect(n.every(x => x.t === 'text')).toBe(true)
  })
  it('plainText strips markers', () => {
    expect(plainText('**Bold** [a](http://x.y) `c`')).toBe('Bold a c')
  })
})

describe('slideify (pagination)', () => {
  it('returns nothing for empty notes', () => {
    expect(slideify('')).toEqual([])
  })
  it('headings do not force a new page: short sections share a page', () => {
    const pages = slideify('# One\ntext a\n\n# Two\ntext b')
    expect(pages).toHaveLength(1)
    expect(pages[0].title).toBe('One')
  })
  it('a manual \\pagebreak starts a new page and titles come from the headings', () => {
    const pages = slideify('# One\ntext a\n\n\\pagebreak\n\n# Two\ntext b')
    expect(pages.map(p => p.title)).toEqual(['One', 'Two'])
  })
  it('does not create empty pages for repeated or leading page breaks', () => {
    const pages = slideify('\\pagebreak\n\\pagebreak\n\ntext\n\n\\pagebreak\n\\pagebreak')
    expect(pages).toHaveLength(1)
  })
  it('fills every page (except the last) nearly full instead of leaving gaps', () => {
    const para = (n: number) => `Paragraph ${n}. ` + 'Plants convert light into chemical energy. '.repeat(3)
    const text = Array.from({ length: 40 }, (_, i) => para(i)).join('\n\n')
    const pages = slideify(text)
    expect(pages.length).toBeGreaterThan(2)
    for (const p of pages.slice(0, -1)) {
      const cost = p.blocks.reduce((s, b) => s + blockCost(b), 0)
      expect(cost).toBeGreaterThan(LINES_PER_PAGE * 0.75)
    }
  })
  it('splits a table that straddles a page so the page is filled, header repeated', () => {
    const intro = Array.from({ length: 4 }, (_, i) => `Intro paragraph ${i} with some words to take space on the page.`).join('\n\n')
    const rows = Array.from({ length: 8 }, (_, i) => `| Item ${i} | Value ${i} |`).join('\n')
    const pages = slideify(`${intro}\n\n| A | B |\n|---|---|\n${rows}`)
    const tables = pages.flatMap(p => p.blocks.filter(b => b.type === 'table')) as any[]
    expect(tables.length).toBeGreaterThan(1)
    expect(tables.every(t => t.header.join() === 'A,B')).toBe(true)
    expect(tables.reduce((s, t) => s + t.rows.length, 0)).toBe(8)
  })
  it('keeps a short table (under 4 rows) whole instead of splitting it', () => {
    const intro = Array.from({ length: 6 }, (_, i) => `Intro paragraph ${i} with some words to take space on the page.`).join('\n\n')
    const pages = slideify(`${intro}\n\n| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n| 5 | 6 |`)
    const tables = pages.flatMap(p => p.blocks.filter(b => b.type === 'table')) as any[]
    expect(tables).toHaveLength(1)
    expect(tables[0].rows).toHaveLength(3)
  })
  it('splits a long table by rows and repeats the header', () => {
    const rows = Array.from({ length: 40 }, (_, i) => `| Item ${i} | Value ${i} |`).join('\n')
    const pages = slideify(`| A | B |\n|---|---|\n${rows}`)
    expect(pages.length).toBeGreaterThan(1)
    const tables = pages.flatMap(p => p.blocks.filter(b => b.type === 'table')) as any[]
    expect(tables.every(t => t.header.join() === 'A,B')).toBe(true)
    expect(tables.reduce((s, t) => s + t.rows.length, 0)).toBe(40)
  })
  it('numbering continues when a long ordered list splits', () => {
    const items = Array.from({ length: 40 }, (_, i) => `${i + 1}. step number ${i + 1} of the experiment`).join('\n')
    const pages = slideify(items)
    const lists = pages.flatMap(p => p.blocks) as any[]
    expect(lists[0].start).toBe(1)
    expect(lists[1].start).toBe(lists[0].items.length + 1)
  })
  it('splits one giant paragraph with no blank lines and loses no text', () => {
    const sentence = 'Plants convert light energy into chemical energy. '
    const text = sentence.repeat(60).trim()
    const pages = slideify(text)
    expect(pages.length).toBeGreaterThan(2)
    const joined = pages.flatMap(p => p.blocks).map((b: any) => b.text).join(' ')
    expect(joined.replace(/\s+/g, ' ')).toBe(text.replace(/\s+/g, ' '))
  })
  it('keeps bold balanced when a paragraph is cut', () => {
    const text = '**' + 'word '.repeat(200).trim() + '**'
    const pages = slideify(text)
    for (const p of pages) for (const b of p.blocks as any[]) {
      expect((b.text.split('**').length - 1) % 2).toBe(0)
    }
  })
  it('no page is wildly over budget (except unsplittable atoms)', () => {
    const pages = slideify(CHATGPT_NOTE.repeat(6))
    for (const p of pages) {
      const cost = p.blocks.reduce((s, b) => s + blockCost(b), 0)
      expect(cost).toBeLessThanOrEqual(LINES_PER_PAGE + 0.01)
    }
  })
  it('never leaves a heading alone at the bottom of a page', () => {
    const body = Array.from({ length: 9 }, (_, i) => `line ${i} of text that is fairly long to take space ok`).join('\n\n')
    const pages = slideify(`${body}\n\n### Orphan?\nthe content that follows`)
    for (const p of pages) {
      const last = p.blocks[p.blocks.length - 1]
      if (p.blocks.length > 1) expect(last.type).not.toBe('heading')
    }
  })
  it('terminates on pathological input', () => {
    const nasty = ('| a | b |\n|---|---|\n' + '| x | y |\n'.repeat(500) + '\n' + '- item\n'.repeat(500) + '\n```\n' + 'code\n'.repeat(500))
    const pages = slideify(nasty)
    expect(pages.length).toBeGreaterThan(5)
  })
})
