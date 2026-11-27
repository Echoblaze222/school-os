import { describe, it, expect } from 'vitest'
import { buildSheets } from './sheets'
import { noteToHtml, bookToHtml } from './blocksToHtml'

describe('buildSheets', () => {
  it('cover, contents, pages, end; contents lists each topic at its first sheet', () => {
    const s = buildSheets(
      [{ title: 'Acids', content: '## Acids\nsome text' }, { title: 'Bases', content: 'base text' }],
      {}, { contents: true },
    )
    expect(s.map(x => x.kind)).toEqual(['cover', 'contents', 'page', 'page', 'end'])
    const toc = s[1] as any
    expect(toc.items).toEqual([{ title: 'Acids', sheet: 2 }, { title: 'Bases', sheet: 3 }])
    expect((s[2] as any).folio).toBe(1)
    expect((s[3] as any).folio).toBe(2)
  })
  it('a pdf topic becomes one sheet per pdf page once the count is known', () => {
    const e = [{ title: 'Past paper', file_url: 'https://x.supabase.co/a/b.pdf' }]
    expect(buildSheets(e, {}).filter(x => x.kind === 'pdf')).toHaveLength(1)
    expect(buildSheets(e, { 'https://x.supabase.co/a/b.pdf': 7 }).filter(x => x.kind === 'pdf')).toHaveLength(7)
  })
  it('word/ppt topics become one document sheet', () => {
    const s = buildSheets([{ title: 'Slides', file_url: 'https://x.supabase.co/a/b.pptx', file_name: 'b.pptx' }])
    expect(s.map(x => x.kind)).toEqual(['cover', 'doc', 'end'])
  })
  it('an empty book gets a friendly empty page', () => {
    expect(buildSheets([]).map(x => x.kind)).toEqual(['cover', 'empty', 'end'])
  })
})

describe('pdf html export', () => {
  it('escapes user text so a note cannot inject markup', () => {
    const html = noteToHtml('<script>alert(1)</script> **bold** [x](javascript:alert(1))')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).not.toContain('href="javascript')
  })
  it('turns unicode subscripts into <sub> for fonts that lack them', () => {
    expect(noteToHtml('H\u2082O')).toContain('H<sub>2</sub>O')
  })
  it('book html has cover, contents and one section per topic, and flags math', () => {
    const { html, usesMath } = bookToHtml({
      title: 'Chem', subject: 'Chemistry', author: 'Mr A', academicYear: '2026/2027', classNames: ['JSS3'], color: '#123456', schoolName: 'Test School',
      entries: [{ title: 'Acids', content: 'pH is $x^2$', file_url: null, file_name: null }, { title: 'File', content: null, file_url: 'https://a.supabase.co/x.pdf', file_name: 'x.pdf' }],
    }, '0.18.7')
    expect(usesMath).toBe(true)
    expect(html).toContain('class="cover"')
    expect(html.match(/class="topic"/g)).toHaveLength(2)
    expect(html).toContain('Attached document')
  })
})
