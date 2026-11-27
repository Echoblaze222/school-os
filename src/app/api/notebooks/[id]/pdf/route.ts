// src/app/api/notebooks/[id]/pdf/route.ts
//
// GET -> the whole book as a downloadable PDF (cover, contents, one topic per page).
//
// Same access rule as reading the book: a teacher's own book, or a published book
// shared with the student's current/earlier class. PDF rendering uses
// @sparticuz/chromium + puppeteer-core exactly like /api/receipts/generate.
// Uploaded PDF/Word topics are listed as attachments (their files are not merged in).

import { getCaller, loadBook, canRead, bad, fail } from '@/lib/notebooks/server'
import { checkRateLimit } from '@/lib/rateLimit'
import { bookToHtml } from '@/lib/notebooks/blocksToHtml'
import katexPkg from 'katex/package.json'

export const runtime = 'nodejs'
export const maxDuration = 60

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const got = await getCaller()
  if ('error' in got) return got.error
  const c = got.caller

  // Chromium is expensive per call; cap it per account.
  const rl = await checkRateLimit(c.admin, 'notebook_pdf', c.userId, 12, 600)
  if (!rl.allowed) return bad(rl.errorResponse!.error, rl.errorResponse!.status)

  const { book, error } = await loadBook(c, id)
  if (error) return fail(error)
  if (!book || !(await canRead(c, book))) return bad('Book not found', 404)

  const [{ data: entries, error: eErr }, { data: links }, { data: author }, { data: school }] = await Promise.all([
    c.admin.from('note_book_entries').select('title, content, file_url, file_name, position')
      .eq('book_id', id).order('position', { ascending: true }).order('created_at', { ascending: true }),
    c.admin.from('note_book_classes').select('class_id').eq('book_id', id),
    c.admin.from('profiles').select('full_name').eq('id', book.created_by).maybeSingle(),
    c.admin.from('schools').select('name').eq('id', c.schoolId).maybeSingle(),
  ])
  if (eErr) return fail(eErr)

  const classIds = (links ?? []).map((l: any) => l.class_id as string)
  const { data: classes } = classIds.length
    ? await c.admin.from('classes').select('id, name, section, class_level').in('id', classIds)
    : { data: [] as any[] }

  let subject: string | null = book.subject_name ?? null
  if (book.subject_id) {
    const { data: s } = await c.admin.from('subjects').select('name').eq('id', book.subject_id).maybeSingle()
    subject = (s as any)?.name ?? subject
  }

  const { html, usesMath } = bookToHtml({
    title: book.title,
    subject,
    author: (author as any)?.full_name ?? null,
    academicYear: book.academic_year ?? null,
    classNames: (classes ?? []).map((k: any) => k.name ?? `${k.class_level ?? ''}${k.section ?? ''}`).filter(Boolean),
    color: book.cover_color ?? '#800020',
    schoolName: (school as any)?.name ?? null,
    entries: (entries ?? []) as any[],
  }, (katexPkg as { version: string }).version)

  let browser: any = null
  try {
    const puppeteer: any = await import('puppeteer-core').catch(() => null)
    const chromium: any = await import('@sparticuz/chromium').catch(() => null)
    if (!puppeteer || !chromium) return bad('PDF download is not available right now.', 503)

    browser = await puppeteer.default.launch({
      args: chromium.default.args,
      defaultViewport: chromium.default.defaultViewport,
      executablePath: await chromium.default.executablePath(),
      headless: true,
    })
    const page = await browser.newPage()
    // The only outbound loads are the KaTeX stylesheet/fonts (when the book has equations) and https images.
    await page.setContent(html, { waitUntil: usesMath ? 'networkidle0' : 'load', timeout: 25000 })
    const pdf: Uint8Array = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' },
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: `<div style="width:100%;font:9px Georgia,serif;color:#8a8174;text-align:center"><span class="pageNumber"></span></div>`,
    })
    await browser.close()
    browser = null

    const filename = `${(book.title as string).replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'book'}.pdf`
    return new Response(Buffer.from(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (err) {
    console.error('notebook pdf error:', (err as Error)?.message)
    return bad('Could not create the PDF. Please try again.', 500)
  } finally {
    if (browser) { try { await browser.close() } catch { /* ignore */ } }
  }
}
