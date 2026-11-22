'use client'
// src/components/KatexMath.tsx
//
// Renders one equation with KaTeX. Loaded lazily by NoteMarkdown (next/dynamic)
// so the KaTeX bundle is only downloaded when a note actually has an equation.
// This is the ONLY place in the notes viewer that sets innerHTML, and the HTML
// comes from KaTeX itself (trust is off, so \href / \url / raw HTML are inert).

import { useMemo } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

interface Props { expr: string; display?: boolean }

export default function KatexMath({ expr, display = false }: Props) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(expr, {
        throwOnError: false,
        displayMode: display,
        output: 'html',
        strict: 'ignore',
        trust: false,
        maxExpand: 500,
      })
    } catch {
      return null
    }
  }, [expr, display])

  if (html === null) return <code>{expr}</code>
  if (display) {
    // Long equations scroll inside their own box instead of running off the page.
    return <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 12px' }} dangerouslySetInnerHTML={{ __html: html }} />
  }
  return <span dangerouslySetInnerHTML={{ __html: html }} />
}
