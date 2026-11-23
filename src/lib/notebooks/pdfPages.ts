// src/lib/notebooks/pdfPages.ts
//
// Browser-only. Loads uploaded PDFs with pdf.js (same setup as DocumentViewer:
// static worker + fonts in /public) and renders single pages to images so the book
// can show a PDF as real pages. Documents and rendered pages are cached for the
// session, so turning back to a page is instant.

type PdfDoc = { numPages: number; getPage: (n: number) => Promise<any>; destroy?: () => void }

const docs = new Map<string, Promise<PdfDoc>>()
const images = new Map<string, Promise<string>>()

export function loadPdf(url: string): Promise<PdfDoc> {
  let p = docs.get(url)
  if (!p) {
    p = (async () => {
      const pdfjs: any = await import('pdfjs-dist')
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
      const task = pdfjs.getDocument({
        url,
        standardFontDataUrl: '/pdf-standard-fonts/',
        cMapUrl: '/pdf-cmaps/',
        cMapPacked: true,
      })
      return (await task.promise) as PdfDoc
    })()
    docs.set(url, p)
    p.catch(() => docs.delete(url))
  }
  return p
}

export async function getPdfPageCount(url: string): Promise<number> {
  return (await loadPdf(url)).numPages
}

/** Renders one PDF page to a JPEG data URL, fitted to `cssWidth` CSS pixels. */
export function renderPdfPage(url: string, pageNo: number, cssWidth: number): Promise<string> {
  const key = `${url}#${pageNo}#${cssWidth}`
  let p = images.get(key)
  if (!p) {
    p = (async () => {
      const doc = await loadPdf(url)
      const page = await doc.getPage(pageNo)
      const base = page.getViewport({ scale: 1 })
      const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)
      const viewport = page.getViewport({ scale: (cssWidth / base.width) * dpr })
      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas not available')
      await page.render({ canvasContext: ctx, viewport }).promise
      const out = canvas.toDataURL('image/jpeg', 0.85)
      canvas.width = 0
      canvas.height = 0
      return out
    })()
    images.set(key, p)
    p.catch(() => images.delete(key))
  }
  return p
}
