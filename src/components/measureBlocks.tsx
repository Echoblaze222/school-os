'use client'
// src/components/measureBlocks.tsx
//
// Browser-only. Measures how tall each note block really is when drawn on a book
// page (same width, same fonts, same styles), so pages can be filled EXACTLY
// instead of guessed. Used by NoteBook after it knows the real page size.
//
// Call it from a timer or event handler, never during React rendering (it renders
// with flushSync into a hidden off-screen element).

import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import NoteMarkdown from './NoteMarkdown'
import type { NoteBlock } from '@/lib/utils/noteMarkdown'
import { paginateByHeight } from '@/lib/utils/fill'

export interface PageMeasurer {
  paginate: (blocks: NoteBlock[]) => NoteBlock[][]
  destroy: () => void
}

/** width/height are the CSS pixel size of the text area of one page. */
export function createPageMeasurer(width: number, height: number): PageMeasurer {
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText =
    `position:fixed;left:-99999px;top:0;width:${Math.floor(width)}px;visibility:hidden;pointer-events:none;display:flow-root;`
  document.body.appendChild(host)
  const root = createRoot(host)

  const heightOfBlocks = (blocks: NoteBlock[]): number => {
    flushSync(() => root.render(<NoteMarkdown blocks={blocks} variant="book" />))
    return host.offsetHeight
  }

  // The page text box has bottom padding of its own; measure it once and subtract it per block.
  const baseline = heightOfBlocks([])
  const capacity = Math.max(40, height - baseline)

  return {
    paginate: blocks => paginateByHeight(blocks, b => Math.max(0, heightOfBlocks([b]) - baseline), capacity),
    destroy: () => {
      try { root.unmount() } catch { /* ignore */ }
      host.remove()
    },
  }
}
