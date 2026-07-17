'use client'
// src/components/DocumentViewer.tsx
//
// In-portal document reader for uploaded note files (PDF / Word / PPT).
// Renders inline via the browser's native PDF engine for .pdf files
// (no extra npm dependency, no build risk — every mobile + desktop
// browser Vercel targets already ships a PDF renderer for <iframe>/<embed>).
// For Office formats (.doc/.docx/.ppt/.pptx) we fall back to Microsoft's
// public Office Online viewer, which requires the file to be publicly
// reachable — true here since Supabase Storage URLs already are.
//
// This replaces "tap to download, leave the app" with a full in-app
// reading modal, matching the request: "read the pdf or any document
// directly from the portal".

import { useState } from 'react'
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
  const [loaded, setLoaded] = useState(false)
  const ext = getExtension(fileUrl)
  const isPdf = ext === 'pdf'
  const isOffice = ['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx'].includes(ext)

  const embedSrc = isPdf
    ? fileUrl
    : isOffice
      ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`
      : null

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

        <div className={styles.viewerWrap}>
          {!loaded && (
            <div className={styles.loading}>
              <span /><span /><span />
            </div>
          )}
          {embedSrc ? (
            <iframe
              src={embedSrc}
              className={styles.frame}
              onLoad={() => setLoaded(true)}
              title={title}
            />
          ) : (
            <div className={styles.unsupported}>
              <p>This file type can't be previewed in-app yet.</p>
              <a href={fileUrl} target="_blank" rel="noreferrer" className={styles.downloadLink}>
                Open file
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
