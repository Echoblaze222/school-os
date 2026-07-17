// scripts/copy-pdfjs-assets.mjs
//
// Copies the pdfjs-dist worker script, standard font files, and CMaps
// into /public so DocumentViewer.tsx can load them as plain static
// assets ("/pdf.worker.min.mjs", "/pdf-standard-fonts/", "/pdf-cmaps/")
// instead of relying on webpack/Turbopack to resolve them at bundle
// time — that resolution path (new URL(..., import.meta.url)) is known
// to be flaky across different Next.js/Vercel build configurations.
//
// Runs automatically after every `npm install` (see package.json's
// "postinstall" script) so /public always has the assets matching
// whatever pdfjs-dist version is in node_modules — no manual step,
// no risk of drifting out of sync after a dependency bump.
//
// Safe to run repeatedly; it just overwrites the target files.

import { cpSync, mkdirSync, copyFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const pkgDir = join(root, 'node_modules', 'pdfjs-dist')

if (!existsSync(pkgDir)) {
  console.warn('[copy-pdfjs-assets] pdfjs-dist not found in node_modules — skipping. Run `npm install pdfjs-dist` first.')
  process.exit(0)
}

const publicDir = join(root, 'public')
mkdirSync(publicDir, { recursive: true })

// 1. Worker script
const workerSrc = join(pkgDir, 'build', 'pdf.worker.min.mjs')
const workerDest = join(publicDir, 'pdf.worker.min.mjs')
copyFileSync(workerSrc, workerDest)
console.log('[copy-pdfjs-assets] copied pdf.worker.min.mjs')

// 2. Standard fonts (for PDFs referencing base-14 fonts that aren't embedded)
const fontsSrc = join(pkgDir, 'standard_fonts')
const fontsDest = join(publicDir, 'pdf-standard-fonts')
cpSync(fontsSrc, fontsDest, { recursive: true })
console.log('[copy-pdfjs-assets] copied standard_fonts -> pdf-standard-fonts')

// 3. CMaps (for CJK / non-Latin encoded text)
const cmapsSrc = join(pkgDir, 'cmaps')
const cmapsDest = join(publicDir, 'pdf-cmaps')
cpSync(cmapsSrc, cmapsDest, { recursive: true })
console.log('[copy-pdfjs-assets] copied cmaps -> pdf-cmaps')

console.log('[copy-pdfjs-assets] done.')
