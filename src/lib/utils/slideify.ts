// src/lib/utils/slideify.ts
// Turns raw typed/pasted note text into an array of "slides" for the
// 3D book viewer. Pure function, no dependencies - safe to run on the
// client at render time (memoized by the caller).
//
// Splitting strategy, in priority order:
//   1. If the teacher used markdown-style headings ("# ", "## "), each
//      heading starts a new slide - this respects intentional structure.
//   2. Otherwise, split on blank-line paragraph breaks.
//   3. Any single paragraph longer than CHARS_PER_SLIDE is further
//      broken up on sentence boundaries so no slide overflows the page.
//
// Each slide also gets a short auto-title (first heading, or first ~40
// chars of its first line) so the book has something to show on the
// "spine"/progress dots.

export interface Slide {
  title: string
  body: string
}

const CHARS_PER_SLIDE = 420 // tuned for a comfortable mobile "page" of text

function deriveTitle(text: string, index: number): string {
  const firstLine = text.trim().split('\n')[0]?.replace(/^#+\s*/, '').trim()
  if (firstLine && firstLine.length <= 60) return firstLine
  if (firstLine) return firstLine.slice(0, 57) + '…'
  return `Page ${index + 1}`
}

function splitLongParagraph(paragraph: string): string[] {
  if (paragraph.length <= CHARS_PER_SLIDE) return [paragraph]
  const sentences = paragraph.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [paragraph]
  const chunks: string[] = []
  let current = ''
  for (const sentence of sentences) {
    if ((current + sentence).length > CHARS_PER_SLIDE && current) {
      chunks.push(current.trim())
      current = sentence
    } else {
      current += sentence
    }
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks
}

export function slideify(raw: string): Slide[] {
  const text = (raw ?? '').trim()
  if (!text) return []

  const hasHeadings = /^#{1,3}\s+/m.test(text)
  let blocks: string[]

  if (hasHeadings) {
    // Split right before each heading line, keep the heading with its content
    blocks = text
      .split(/\n(?=#{1,3}\s+)/)
      .map(b => b.trim())
      .filter(Boolean)
  } else {
    // Split on paragraph breaks (one or more blank lines)
    blocks = text
      .split(/\n\s*\n/)
      .map(b => b.trim())
      .filter(Boolean)
    // If the note was pasted as one giant blob with no blank lines at all,
    // fall back to plain length-based chunking so it still becomes a book
    // rather than one unreadable wall-of-text slide.
    if (blocks.length <= 1 && text.length > CHARS_PER_SLIDE) {
      blocks = splitLongParagraph(text)
    }
  }

  // Further break up any oversized block, and merge tiny trailing blocks
  // (e.g. a lone one-line block) into the previous slide so pages feel even.
  const expanded: string[] = []
  for (const block of blocks) {
    expanded.push(...splitLongParagraph(block))
  }

  const merged: string[] = []
  for (const block of expanded) {
    const prev = merged[merged.length - 1]
    if (prev && (prev.length + block.length) < CHARS_PER_SLIDE * 0.4) {
      merged[merged.length - 1] = prev + '\n\n' + block
    } else {
      merged.push(block)
    }
  }

  return merged.map((body, i) => ({
    title: deriveTitle(body, i),
    body: body.replace(/^#{1,3}\s+/, '').trim(),
  }))
}
