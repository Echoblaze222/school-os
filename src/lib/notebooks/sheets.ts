// src/lib/notebooks/sheets.ts
//
// Pure: turns a book's topics into the SHEETS the book reader turns.
//   cover | contents | text pages | pdf pages | document card | end cover
// Typed/pasted topics are paginated by slideify; an uploaded PDF becomes one
// sheet per PDF page (page counts arrive asynchronously from pdf.js); Word /
// PowerPoint files become a single "document" sheet (they cannot be paginated
// in the browser).

import { slideify, type Paginator } from '@/lib/utils/slideify'
import type { NoteBlock } from '@/lib/utils/noteMarkdown'

export interface BookEntry {
  id?: string
  title: string
  content?: string | null
  file_url?: string | null
  file_name?: string | null
}

export type Sheet =
  | { kind: 'cover' }
  | { kind: 'contents'; items: { title: string; sheet: number }[] }
  | { kind: 'page'; blocks: NoteBlock[]; chapter: string; folio: number }
  | { kind: 'pdf'; url: string; pageNo: number; chapter: string; folio: number }
  | { kind: 'doc'; url: string; name: string; chapter: string; folio: number }
  | { kind: 'empty' }
  | { kind: 'end' }

export function fileExt(url: string): string {
  const clean = url.split('?')[0].split('#')[0]
  const dot = clean.lastIndexOf('.')
  return dot === -1 ? '' : clean.slice(dot + 1).toLowerCase()
}

export const isPdfUrl = (url: string) => fileExt(url) === 'pdf'

/** pdfCounts: known page count per PDF url (undefined while still loading, which shows one placeholder page). */
export function buildSheets(
  entries: BookEntry[],
  pdfCounts: Record<string, number | undefined> = {},
  opts: { contents: boolean } = { contents: false },
  /** Measured pagination from the browser. Defaults to the estimate. */
  paginate?: Paginator,
): Sheet[] {
  const sheets: Sheet[] = [{ kind: 'cover' }]
  const contentsIndex = opts.contents ? sheets.push({ kind: 'contents', items: [] }) - 1 : -1
  const firstSheetOf: { title: string; sheet: number }[] = []
  let folio = 0

  for (const e of entries) {
    const startedAt = sheets.length
    const hasText = !!e.content && e.content.trim().length > 0

    if (hasText) {
      for (const p of slideify(e.content as string, paginate)) {
        sheets.push({ kind: 'page', blocks: p.blocks, chapter: e.title, folio: ++folio })
      }
    }
    if (e.file_url) {
      if (isPdfUrl(e.file_url)) {
        const n = Math.max(1, Math.min(pdfCounts[e.file_url] ?? 1, 300))
        for (let i = 1; i <= n; i++) sheets.push({ kind: 'pdf', url: e.file_url, pageNo: i, chapter: e.title, folio: ++folio })
      } else {
        sheets.push({ kind: 'doc', url: e.file_url, name: e.file_name || e.title, chapter: e.title, folio: ++folio })
      }
    }
    if (sheets.length > startedAt) firstSheetOf.push({ title: e.title, sheet: startedAt })
  }

  if (sheets.length === (contentsIndex === -1 ? 1 : 2)) sheets.push({ kind: 'empty' })
  sheets.push({ kind: 'end' })

  if (contentsIndex !== -1) sheets[contentsIndex] = { kind: 'contents', items: firstSheetOf }
  return sheets
}
