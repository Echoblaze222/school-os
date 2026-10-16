// src/lib/brand/brandVars.ts
// Pure functions that turn a school's saved branding into the CSS custom
// properties SchoolBrandInjector sets on <html>. Extracted from the component
// so the logic (and its input sanitizing) can be unit tested without React.
//
// Every input is validated here, not just upstream: the database may already
// contain values written before validation existed, or written through a path
// that bypasses the Next.js API routes.

import {
  DEFAULT_FONT_FAMILY,
  DEFAULT_PRIMARY_COLOR,
  DEFAULT_SECONDARY_COLOR,
  normalizeFontFamily,
  normalizeHexColor,
  serializeForInlineScript,
  type AllowedFontFamily,
} from '@/lib/validation/brand'

export interface BrandInput {
  primaryColor?:   string | null
  secondaryColor?: string | null
  fontFamily?:     string | null
}

export interface BrandVars {
  vars:       Record<string, string>
  fontFamily: AllowedFontFamily
}

/** Hex → HSL hue, used only to keep the fixed status colours from landing in
 *  the same hue family as whatever a school picks for its brand colours
 *  (e.g. a green-branded school shouldn't also get a green "on track" pill -
 *  they'd read as the same signal). */
function hueOf(hex: string): number | null {
  const rgb = hexToRgb(hex)
  if (!rgb) return null
  const [r, g, b] = rgb.map(v => v / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const d = max - min
  if (d === 0) return 0
  let h = 0
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  h *= 60
  return h < 0 ? h + 360 : h
}

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return Math.min(d, 360 - d)
}

function hexToRgb(hex: string): [number, number, number] | null {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return null
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ]
}

function toHex(r: number, g: number, b: number): string {
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

/** Darken a hex colour by scaling each channel toward black (amount 0-1). */
export function darken(hex: string, amount: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const [r, g, b] = rgb.map(v => Math.max(0, Math.round(v * (1 - amount))))
  return toHex(r, g, b)
}

/** Lighten a hex colour by mixing it toward white at the given ratio (0-1). */
export function lighten(hex: string, amount: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const [r, g, b] = rgb.map(v => Math.min(255, Math.round(v + (255 - v) * amount)))
  return toHex(r, g, b)
}

export function rgba(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`
}

/**
 * Builds the full CSS variable map from the school's saved branding.
 * Invalid or missing values fall back to the platform defaults instead of
 * being passed through.
 */
export function buildBrandCssVars(input: BrandInput): BrandVars {
  const primaryColor = normalizeHexColor(input.primaryColor) ?? DEFAULT_PRIMARY_COLOR
  const brand2       = normalizeHexColor(input.secondaryColor) ?? DEFAULT_SECONDARY_COLOR
  const fontFamily   = normalizeFontFamily(input.fontFamily) ?? DEFAULT_FONT_FAMILY

  // Derive the full palette from the single primary colour
  const brandLight  = lighten(primaryColor, 0.25)
  const brandDark   = darken(primaryColor, 0.25)
  const brandGlow   = rgba(primaryColor, 0.35)
  const brandSubtle = rgba(primaryColor, 0.12)
  const brandBorder = rgba(primaryColor, 0.3)
  const inputFocus  = rgba(primaryColor, 0.5)
  const glassActive = rgba(primaryColor, 0.15)
  const glassBorderHover = rgba(primaryColor, 0.4)

  // Second brand colour: falls back to a warm gold if the school hasn't set
  // one, since most school brand kits are a primary + one accent.
  const brand2Light  = lighten(brand2, 0.25)
  const brand2Dark   = darken(brand2, 0.25)
  const brand2Subtle = rgba(brand2, 0.14)

  // Fixed "status" colours (on-track / needs-attention pills, gauge fills)
  // are NOT derived from the brand - they're a separate signal and must
  // stay legible as one regardless of what the school picked. But we do
  // steer them away from the brand's own hue family: e.g. a school whose
  // primary is green shouldn't also get a green "on track" indicator,
  // since the two would read as the same colour doing two different jobs.
  const primaryHue = hueOf(primaryColor)
  const greenHue = 150, blueHue = 205
  const okHue = (primaryHue !== null && hueDistance(primaryHue, greenHue) < 40) ? blueHue : greenHue
  const statusOk   = okHue === greenHue ? '#3FA66B' : '#2F86D3'
  const statusWarn = '#E4572E' // warm red-orange - reserved for alerts only, never a brand default

  const vars: Record<string, string> = {
    '--brand':               primaryColor,
    '--brand-light':         brandLight,
    '--brand-dark':          brandDark,
    '--brand-glow':          brandGlow,
    '--brand-subtle':        brandSubtle,
    '--brand-border':        brandBorder,
    '--brand-2':             brand2,
    '--brand-2-light':       brand2Light,
    '--brand-2-dark':        brand2Dark,
    '--brand-2-subtle':      brand2Subtle,
    '--status-ok':           statusOk,
    '--status-warn':         statusWarn,
    '--input-focus':         inputFocus,
    '--glass-bg-active':     glassActive,
    '--glass-border-hover':  glassBorderHover,
    '--nav-icon-active':     primaryColor,
    '--nav-label-active':    brandLight,
    '--font-brand':          `${fontFamily},Inter,-apple-system,sans-serif`,
  }

  return { vars, fontFamily }
}

/**
 * Builds the inline script body that sets each variable on <html>
 * synchronously, before first paint. Values are embedded as JSON (escaped for
 * use inside a <script> element), never concatenated into JS source.
 */
export function buildBrandInitScript(vars: Record<string, string>): string {
  return (
    '(function(){try{' +
    'var vars=' + serializeForInlineScript(vars) + ';' +
    'var el=document.documentElement;' +
    'Object.keys(vars).forEach(function(k){el.style.setProperty(k,vars[k]);});' +
    '}catch(e){}})();'
  )
}

/** Google Fonts stylesheet URL for an allowlisted font. */
export function brandFontUrl(fontFamily: AllowedFontFamily): string {
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontFamily)}:wght@400;500;600;700;800&display=swap`
}
