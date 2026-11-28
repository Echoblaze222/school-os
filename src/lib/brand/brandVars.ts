// src/lib/brand/brandVars.ts
// Pure palette derivation for a school's brand. One source of truth used by:
//  - SchoolBrandInjector (server rendered, online dashboards), and
//  - applyBrandVars / OfflineShell (offline twin pages),
// so a school looks identical online and offline.
//
// Input is the school's primary colour, optional secondary colour and font.
// Output is an ordered list of [css variable, value] pairs.

export const DEFAULT_PRIMARY_COLOR = '#7C3AED'
export const DEFAULT_FONT_FAMILY = 'Inter'

export interface BrandInput {
  primaryColor: string // e.g. "#800020"
  secondaryColor?: string // e.g. "#C99A3B"
  fontFamily?: string // e.g. "Poppins"
}

export type BrandVar = [name: string, value: string]

function hexToRgb(hex: string): [number, number, number] | null {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return null
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ]
}

/** Hue in degrees, used only to keep the fixed status colours out of the brand's own hue family. */
function hueOf(hex: string): number | null {
  const rgb = hexToRgb(hex)
  if (!rgb) return null
  const [r, g, b] = rgb.map(v => v / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
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

function toHex(r: number, g: number, b: number): string {
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

/** Mix a colour toward black by amount (0-1). */
export function darken(hex: string, amount: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const [r, g, b] = rgb.map(v => Math.max(0, Math.round(v * (1 - amount))))
  return toHex(r, g, b)
}

/** Mix a colour toward white by amount (0-1). */
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

export function buildBrandVars({
  primaryColor,
  secondaryColor,
  fontFamily = DEFAULT_FONT_FAMILY,
}: BrandInput): BrandVar[] {
  const brandLight = lighten(primaryColor, 0.25)
  const brandDark = darken(primaryColor, 0.25)
  const brandGlow = rgba(primaryColor, 0.35)
  const brandSubtle = rgba(primaryColor, 0.12)
  const brandBorder = rgba(primaryColor, 0.3)
  const inputFocus = rgba(primaryColor, 0.5)
  const glassActive = rgba(primaryColor, 0.15)
  const glassBorderHover = rgba(primaryColor, 0.4)

  // Second brand colour. Falls back to a warm gold when the school has not set one.
  const brand2 = secondaryColor || '#C99A3B'
  const brand2Light = lighten(brand2, 0.25)
  const brand2Dark = darken(brand2, 0.25)
  const brand2Subtle = rgba(brand2, 0.14)

  // Status colours are a separate signal and never follow the brand, but they are steered away
  // from the brand's hue family (a green school does not also get a green "on track" pill).
  const primaryHue = hueOf(primaryColor)
  const greenHue = 150
  const blueHue = 205
  const okHue = primaryHue !== null && hueDistance(primaryHue, greenHue) < 40 ? blueHue : greenHue
  const statusOk = okHue === greenHue ? '#3FA66B' : '#2F86D3'
  const statusWarn = '#E4572E'

  return [
    ['--brand', primaryColor],
    ['--brand-light', brandLight],
    ['--brand-dark', brandDark],
    ['--brand-glow', brandGlow],
    ['--brand-subtle', brandSubtle],
    ['--brand-border', brandBorder],
    ['--brand-2', brand2],
    ['--brand-2-light', brand2Light],
    ['--brand-2-dark', brand2Dark],
    ['--brand-2-subtle', brand2Subtle],
    ['--status-ok', statusOk],
    ['--status-warn', statusWarn],
    ['--input-focus', inputFocus],
    ['--glass-bg-active', glassActive],
    ['--glass-border-hover', glassBorderHover],
    ['--nav-icon-active', primaryColor],
    ['--nav-label-active', brandLight],
    ['--font-brand', `${fontFamily},Inter,-apple-system,sans-serif`],
  ]
}
