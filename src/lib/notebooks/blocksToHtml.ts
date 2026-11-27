// src/lib/notebooks/blocksToHtml.ts
//
// Server-side: note blocks -> a self-contained HTML string for PDF export.
// Every piece of user text is HTML-escaped. Equations go through KaTeX (trust off).
// Links are limited to http(s)/mailto and images to https (see noteMarkdown.ts).

import katex from 'katex'
import { parseBlocks, parseInline, type InlineNode, type NoteBlock } from '@/lib/utils/noteMarkdown'

export const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const SUB: Record<string, string> = { '\u2080': '0', '\u2081': '1', '\u2082': '2', '\u2083': '3', '\u2084': '4', '\u2085': '5', '\u2086': '6', '\u2087': '7', '\u2088': '8', '\u2089': '9' }
const SUP: Record<string, string> = { '\u2070': '0', '\u00b9': '1', '\u00b2': '2', '\u00b3': '3', '\u2074': '4', '\u2075': '5', '\u2076': '6', '\u2077': '7', '\u2078': '8', '\u2079': '9', '\u207a': '+', '\u207b': '-' }

/** Escapes text and turns unicode sub/superscripts into <sub>/<sup> (the server fonts may lack those glyphs). */
function text(s: string): string {
  let out = ''
  for (const ch of s) {
    if (SUB[ch]) out += `<sub>${SUB[ch]}</sub>`
    else if (SUP[ch]) out += `<sup>${SUP[ch]}</sup>`
    else out += esc(ch)
  }
  return out
}

let sawMath = false
export function resetMathFlag() { sawMath = false }
export function hadMath() { return sawMath }

function math(expr: string, display: boolean): string {
  sawMath = true
  try {
    return katex.renderToString(expr, { throwOnError: false, displayMode: display, output: 'html', strict: 'ignore', trust: false, maxExpand: 500 })
  } catch {
    return `<code>${esc(expr)}</code>`
  }
}

function inline(nodes: InlineNode[]): string {
  return nodes.map(n => {
    switch (n.t) {
      case 'text': return text(n.v)
      case 'br': return '<br>'
      case 'strong': return `<strong>${inline(n.c)}</strong>`
      case 'em': return `<em>${inline(n.c)}</em>`
      case 'del': return `<del>${inline(n.c)}</del>`
      case 'code': return `<code>${esc(n.v)}</code>`
      case 'link': return `<a href="${esc(n.href)}">${inline(n.c)}</a>`
      case 'math': return math(n.v, n.display)
      case 'image': return `<img src="${esc(n.src)}" alt="${esc(n.alt)}">`
    }
  }).join('')
}

const i = (s: string) => inline(parseInline(s))

function block(b: NoteBlock): string {
  switch (b.type) {
    case 'heading': return `<h${Math.min(6, b.level) + 1}>${i(b.text)}</h${Math.min(6, b.level) + 1}>`
    case 'paragraph': return `<p>${i(b.text)}</p>`
    case 'list': {
      const tag = b.ordered ? 'ol' : 'ul'
      const items = b.items.map(it =>
        `<li>${it.checked === null ? '' : `<span class="chk">${it.checked ? '\u2611' : '\u2610'}</span> `}${i(it.text)}${it.children.map(block).join('')}</li>`).join('')
      return `<${tag}${b.ordered && b.start !== 1 ? ` start="${b.start}"` : ''}>${items}</${tag}>`
    }
    case 'table': {
      const th = b.header.map((h, k) => `<th${b.align[k] ? ` style="text-align:${b.align[k]}"` : ''}>${i(h)}</th>`).join('')
      const rows = b.rows.map(r => `<tr>${r.map((cell, k) => `<td${b.align[k] ? ` style="text-align:${b.align[k]}"` : ''}>${i(cell)}</td>`).join('')}</tr>`).join('')
      return `<table><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table>`
    }
    case 'code': return `<pre>${esc(b.text)}</pre>`
    case 'quote': return `<blockquote>${b.blocks.map(block).join('')}</blockquote>`
    case 'math': return `<div class="math">${math(b.text, true)}</div>`
    case 'hr': return '<hr>'
    case 'pagebreak': return '<div style="break-after:page"></div>'
  }
}

export function noteToHtml(raw: string): string {
  return parseBlocks(raw).map(block).join('\n')
}

export interface PdfEntry { title: string; content: string | null; file_url: string | null; file_name: string | null }

export interface PdfBook {
  title: string
  subject: string | null
  author: string | null
  academicYear: string | null
  classNames: string[]
  color: string
  schoolName: string | null
  entries: PdfEntry[]
}

export function bookToHtml(b: PdfBook, katexVersion: string): { html: string; usesMath: boolean } {
  resetMathFlag()
  const body = b.entries.map((e, idx) => {
    const inner = e.content
      ? noteToHtml(e.content)
      : e.file_url
        ? `<div class="attach"><p><strong>Attached document:</strong> ${esc(e.file_name || 'file')}</p><p>This topic is an uploaded file. Open it in the SchoolOS app to read it page by page.</p></div>`
        : ''
    return `<section class="topic"><div class="kicker">Topic ${idx + 1}</div><h1>${text(e.title)}</h1>${inner}</section>`
  }).join('\n')

  const toc = b.entries.map((e, idx) => `<li><span>${idx + 1}.</span> ${text(e.title)}</li>`).join('')
  const usesMath = hadMath()
  const color = /^#[0-9a-fA-F]{6}$/.test(b.color) ? b.color : '#800020'

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
${usesMath ? `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@${esc(katexVersion)}/dist/katex.min.css">` : ''}
<style>
  :root { --c: ${color}; }
  * { box-sizing: border-box; }
  body { font-family: Georgia, 'Times New Roman', 'DejaVu Serif', serif; color: #231f1a; font-size: 12.5px; line-height: 1.65; margin: 0; }
  h1,h2,h3,h4,h5,h6 { color: var(--c); line-height: 1.25; margin: 16px 0 8px; break-after: avoid; }
  h1 { font-size: 22px; margin-top: 4px; border-bottom: 1.5px solid var(--c); padding-bottom: 6px; }
  h2 { font-size: 17px; } h3 { font-size: 14.5px; } h4,h5,h6,h7 { font-size: 13px; }
  p { margin: 0 0 9px; overflow-wrap: anywhere; }
  ul,ol { margin: 0 0 10px; padding-left: 22px; } li { margin-bottom: 3px; }
  table { border-collapse: collapse; width: 100%; margin: 6px 0 12px; font-size: 11.5px; break-inside: auto; }
  tr { break-inside: avoid; } thead { display: table-header-group; }
  th,td { border: 1px solid #c9c1b3; padding: 5px 8px; vertical-align: top; overflow-wrap: anywhere; }
  th { background: #f1ebe0; color: #231f1a; }
  blockquote { margin: 0 0 10px; padding: 4px 12px; border-left: 3px solid var(--c); background: #f7f2ea; font-style: italic; }
  pre { background: #f3efe8; padding: 8px 10px; border-radius: 6px; font: 11px/1.45 'DejaVu Sans Mono', monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
  code { background: #f3efe8; padding: 0 4px; border-radius: 4px; font: 0.9em 'DejaVu Sans Mono', monospace; }
  img { max-width: 100%; max-height: 280px; display: block; margin: 8px auto; }
  a { color: var(--c); }
  hr { border: 0; border-top: 1px solid #cfc7b8; margin: 14px 0; }
  .math { overflow-x: auto; margin-bottom: 10px; }
  .topic { break-before: page; }
  .kicker { font: 600 10px/1 Arial, sans-serif; letter-spacing: .18em; text-transform: uppercase; color: #8a8174; }
  .attach { border: 1px dashed #b9b0a0; border-radius: 8px; padding: 12px 14px; background: #faf7f1; }
  .cover { height: 245mm; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; background: var(--c); color: #fff; border-radius: 6px; padding: 30mm 18mm; }
  .cover .k { font: 700 11px/1 Arial, sans-serif; letter-spacing: .3em; text-transform: uppercase; opacity: .85; }
  .cover h1 { color: #fff; border: 0; font-size: 34px; margin: 18px 0 10px; }
  .cover .rule { width: 60px; height: 2px; background: rgba(255,255,255,.6); margin: 8px 0 14px; }
  .cover p { margin: 3px 0; opacity: .92; font-size: 13px; }
  .toc { break-before: page; } .toc h1 { margin-bottom: 14px; }
  .toc ol { list-style: none; padding: 0; } .toc li { padding: 7px 0; border-bottom: 1px dotted #c9c1b3; font-size: 14px; }
  .toc li span { color: var(--c); font-weight: 700; display: inline-block; width: 28px; }
</style></head><body>
<div class="cover">
  <div class="k">${text(b.subject || 'Study Notes')}</div>
  <h1>${text(b.title)}</h1><div class="rule"></div>
  ${b.classNames.length ? `<p>${text(b.classNames.join(', '))}</p>` : ''}
  ${b.academicYear ? `<p>${text(b.academicYear)}</p>` : ''}
  ${b.author ? `<p>${text(b.author)}</p>` : ''}
  ${b.schoolName ? `<p>${text(b.schoolName)}</p>` : ''}
</div>
${b.entries.length ? `<section class="toc"><h1>Contents</h1><ol>${toc}</ol></section>` : ''}
${body}
</body></html>`
  return { html, usesMath }
}
