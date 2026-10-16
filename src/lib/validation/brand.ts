// src/lib/validation/brand.ts
// Validation and safe serialization for school branding values.
//
// WHY THIS EXISTS: schools.primary_color, secondary_color and font_family are
// written by principals (and, for registration, by anonymous visitors) and are
// later rendered into an inline <script> tag by SchoolBrandInjector for every
// user of that school. Anything that reaches that script must be either
// allowlisted here or serialized with serializeForInlineScript().
//
// Keep ALLOWED_FONT_FAMILIES in sync with the font pickers in
//   - src/app/dashboard/principal/settings/SettingsClient.tsx (FONTS)
//   - src/app/register-school/page.tsx (Portal Font <select>)
// and with the schools_font_family_format CHECK constraint in
//   sql/migrations/2026-08-18-public-platform-lane-a-b.sql
// (letters, digits, spaces and hyphens only, up to 40 characters).

export const ALLOWED_FONT_FAMILIES = [
  'Inter',
  'Poppins',
  'Lato',
  'Montserrat',
  'Nunito',
  'Raleway',
  'DM Sans',
  'Playfair Display',
  'Roboto',
] as const

export type AllowedFontFamily = (typeof ALLOWED_FONT_FAMILIES)[number]

export const DEFAULT_FONT_FAMILY: AllowedFontFamily = 'Inter'
export const DEFAULT_PRIMARY_COLOR   = '#800020'
export const DEFAULT_SECONDARY_COLOR = '#C99A3B'

/**
 * Returns the canonical (allowlisted) spelling of a font name, or null if the
 * input is not an exact, case-insensitive match for an allowed font.
 * Surrounding whitespace is ignored; nothing else is.
 */
export function normalizeFontFamily(input: unknown): AllowedFontFamily | null {
  if (typeof input !== 'string') return null
  const wanted = input.trim().toLowerCase()
  for (const font of ALLOWED_FONT_FAMILIES) {
    if (font.toLowerCase() === wanted) return font
  }
  return null
}

const HEX_6 = /^#[0-9A-Fa-f]{6}$/

/**
 * Returns the colour (trimmed, case preserved) if it is a strict 6-digit hex
 * value such as "#800020", otherwise null. Same rule as
 * /api/principal/settings and the schools_*_color_format CHECK constraints.
 */
export function normalizeHexColor(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const value = input.trim()
  return HEX_6.test(value) ? value : null
}

/**
 * JSON-serializes a value so it is safe to embed inside an inline <script>.
 * JSON.stringify alone is not enough: a string containing "</script>" would
 * end the script block early, and U+2028/U+2029 are line terminators in JS
 * source. The output is still valid JSON and valid JS.
 */
export function serializeForInlineScript(value: unknown): string {
  const json = JSON.stringify(value) ?? 'null'
  return json
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}
