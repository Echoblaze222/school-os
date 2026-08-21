'use client'
// src/components/DocumentViewer.tsx
//
// In-portal document reader for uploaded note files (PDF / Word / PPT).
//
// PDF rendering strategy - IMPORTANT:
// We do NOT rely on <iframe src="the.pdf"> and the browser's native PDF
// engine. Mobile Chrome (and several other mobile browsers) frequently
// refuses to render a PDF inline inside an iframe - especially when the
// file is on a different origin, as it is here (Supabase Storage) - and
// instead shows its own "can't preview this file, tap Open" chrome, which
// defeats the whole point of an in-app reader.
//
// Instead we render the PDF ourselves using pdfjs-dist: fetch the bytes,
// decode with PDF.js, and paint each page to a <canvas>. This is what
// Google Drive's and most other in-app PDF viewers do under the hood, and
// it behaves identically across iOS Safari, mobile Chrome, and desktop - // no dependency on the host browser's built-in PDF plugin at all.
//
// For Office formats (.doc/.docx/.ppt/.pptx/.xls/.xlsx) we still use
// Microsoft's public Office Online embed viewer, which requires the file
// to be publicly reachable - true here since Supabase Storage URLs
// already are.

import { useState, useEffect, useRef, useCallback } from 'react'
import styles from './DocumentViewer.module.css'

interface Props {
  fileUrl: string
  title: string
  accentColor?: string
  onClose?: () => void
}

function getExtension(url: string): string {
  const clean = url.split('?')[0]
  const parts = clean.split('.')
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : ''
}

export default function DocumentViewer({ fileUrl, title, accentColor = '#7C3AED', onClose }: Props) {
  const ext = getExtension(fileUrl)
  const isPdf = ext === 'pdf'
  const isOffice = ['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx'].includes(ext)

  if (isPdf) {
    return (
      <PdfShell title={title} fileUrl={fileUrl} accentColor={accentColor} onClose={onClose} />
    )
  }

  if (isOffice) {
    return (
      <OfficeShell title={title} fileUrl={fileUrl} accentColor={accentColor} onClose={onClose} />
    )
  }

  return (
    <Shell title={title} accentColor={accentColor} onClose={onClose} fileUrl={fileUrl}>
      <div className={styles.unsupported}>
        <p>This file type can't be previewed in-app yet.</p>
        <a href={fileUrl} target="_blank" rel="noreferrer" className={styles.downloadLink}>
          Open file
        </a>
      </div>
    </Shell>
  )
}

// ---------------------------------------------------------------------
// Shared chrome: header (title, open-in-tab, close) + full-bleed body.
// ---------------------------------------------------------------------
function Shell({
  title, accentColor, onClose, fileUrl, children,
}: { title: string; accentColor?: string; onClose?: () => void; fileUrl: string; children: React.ReactNode }) {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.stage} onClick={e => e.stopPropagation()} style={{ ['--accent' as any]: accentColor }}>
        <div className={styles.header}>
          <p className={styles.title}>{title}</p>
          <div className={styles.headerActions}>
            <a href={fileUrl} target="_blank" rel="noreferrer" className={styles.openTab} title="Open in new tab">⤢</a>
            {onClose && <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>}
          </div>
        </div>
        <div className={styles.viewerWrap}>{children}</div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// PDF: fetched + decoded + canvas-rendered via pdfjs-dist.
// ---------------------------------------------------------------------
function PdfShell({ title, fileUrl, accentColor, onClose }: Props) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [numPages, setNumPages] = useState(0)
  const [page, setPage] = useState(1)
  const [scale, setScale] = useState(1)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const pdfDocRef = useRef<any>(null)
  const renderTaskRef = useRef<any>(null)

  // Load the PDF document once.
  useEffect(() => {
    let cancelled = false

    async function load() {
      setStatus('loading')
      try {
        const pdfjs: any = await import('pdfjs-dist')
        // Served as a static file from /public/pdf.worker.min.mjs (see setup
        // note below) rather than resolved via import.meta.url - the latter
        // is flaky across different webpack/Turbopack configs on Vercel,
        // while a static /public path always just works.
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

        const loadingTask = pdfjs.getDocument({
          url: fileUrl,
          // Needed for PDFs that reference the 14 standard PDF fonts
          // without embedding them, and for CJK / non-Latin text that
          // relies on character maps. Without these, such PDFs still
          // "load" but render with missing/garbled glyphs.
          standardFontDataUrl: '/pdf-standard-fonts/',
          cMapUrl: '/pdf-cmaps/',
          cMapPacked: true,
        })
        const doc = await loadingTask.promise
        if (cancelled) return
        pdfDocRef.current = doc
        setNumPages(doc.numPages)
        setPage(1)
        setStatus('ready')
      } catch (err: any) {
        if (cancelled) return
        console.error('[DocumentViewer] PDF load error:', err)
        setErrorMsg(err?.message ?? 'Failed to load PDF')
        setStatus('error')
      }
    }

    load()
    return () => {
      cancelled = true
      pdfDocRef.current?.destroy?.()
    }
  }, [fileUrl])

  // Render current page onto the canvas whenever page/scale changes.
  const renderPage = useCallback(async () => {
    const doc = pdfDocRef.current
    const canvas = canvasRef.current
    if (!doc || !canvas) return

    // Cancel any in-flight render before starting a new one.
    renderTaskRef.current?.cancel?.()

    const pdfPage = await doc.getPage(page)
    const containerWidth = scrollRef.current?.clientWidth ?? 360
    const baseViewport = pdfPage.getViewport({ scale: 1 })
    // Fit-to-width, then apply the user's zoom multiplier on top.
    const fitScale = (containerWidth - 24) / baseViewport.width
    const viewport = pdfPage.getViewport({ scale: fitScale * scale })

    const context = canvas.getContext('2d')
    if (!context) return

    // Render at device pixel ratio for crisp text on retina/mobile screens.
    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1
    canvas.width = Math.floor(viewport.width * dpr)
    canvas.height = Math.floor(viewport.height * dpr)
    canvas.style.width = `${viewport.width}px`
    canvas.style.height = `${viewport.height}px`
    context.setTransform(dpr, 0, 0, dpr, 0, 0)

    const task = pdfPage.render({ canvasContext: context, viewport })
    renderTaskRef.current = task
    try {
      await task.promise
    } catch (err: any) {
      if (err?.name !== 'RenderingCancelledException') {
        console.error('[DocumentViewer] page render error:', err)
      }
    }
  }, [page, scale])

  useEffect(() => {
    if (status === 'ready') renderPage()
  }, [status, renderPage])

  // Re-fit on resize/orientation change.
  useEffect(() => {
    function onResize() { if (status === 'ready') renderPage() }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [status, renderPage])

  function goTo(next: number) {
    if (next < 1 || next > numPages) return
    setPage(next)
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <Shell title={title} accentColor={accentColor} onClose={onClose} fileUrl={fileUrl}>
      {status === 'loading' && (
        <div className={styles.loading}><span /><span /><span /></div>
      )}

      {status === 'error' && (
        <div className={styles.unsupported}>
          <p>Couldn't load this PDF in-app.{errorMsg ? ` (${errorMsg})` : ''}</p>
          <a href={fileUrl} target="_blank" rel="noreferrer" className={styles.downloadLink}>
            Open file
          </a>
        </div>
      )}

      {status === 'ready' && (
        <>
          <div ref={scrollRef} className={styles.pdfScroll}>
            <canvas ref={canvasRef} className={styles.pdfCanvas} />
          </div>
          <div className={styles.pdfControls}>
            <button
              className={styles.navBtn}
              onClick={() => goTo(page - 1)}
              disabled={page <= 1}
              aria-label="Previous page"
            >
              ← Prev
            </button>
            <span className={styles.pageIndicator}>{page} / {numPages}</span>
            <button
              className={styles.navBtn}
              onClick={() => goTo(page + 1)}
              disabled={page >= numPages}
              aria-label="Next page"
            >
              Next →
            </button>
            <div className={styles.zoomGroup}>
              <button className={styles.zoomBtn} onClick={() => setScale(s => Math.max(0.6, +(s - 0.2).toFixed(1)))} aria-label="Zoom out">−</button>
              <button className={styles.zoomBtn} onClick={() => setScale(s => Math.min(2.4, +(s + 0.2).toFixed(1)))} aria-label="Zoom in">+</button>
            </div>
          </div>
        </>
      )}
    </Shell>
  )
}

// ---------------------------------------------------------------------
// Office documents (Word/Excel/PPT) via Office Online embed.
// ---------------------------------------------------------------------
function OfficeShell({ title, fileUrl, accentColor, onClose }: Props) {
  const [loaded, setLoaded] = useState(false)
  const embedSrc = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`

  return (
    <Shell title={title} accentColor={accentColor} onClose={onClose} fileUrl={fileUrl}>
      {!loaded && <div className={styles.loading}><span /><span /><span /></div>}
      <iframe
        src={embedSrc}
        className={styles.frame}
        onLoad={() => setLoaded(true)}
        title={title}
      />
    </Shell>
  )
}
