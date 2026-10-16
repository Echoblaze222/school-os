// src/lib/brand/brandInputs.ts
// Validation and safe serialization for school branding values.
//
// Why this exists: primary_color, secondary_color and font_family come from
// the `schools` table and are written by (a) the public /api/schools/register
// route and (b) the principal settings route. SchoolBrandInjector used to
// interpolate them, unescaped, into an inline <script> that runs on every
// dashboard page of that school. A value such as `x";fetch(...);//` in
// font_family therefore executed as script for every user of the school.
//
// Defence in depth:
//   1. Write paths validate with the helpers below (reject bad input early).
//   2. SchoolBrandInjector re-validates at render time, so rows that were
//      written before this fix (or by any future write path) are neutralised.
//   3. The inline script receives its data as a JSON string literal with
//      <, >, & and U+2028/U+2029 escaped, so data can never terminate the
//      string literal or the <script> element.

/** Fonts a school may choose. Union of the registration form and the
 *  principal settings page. Names must match Google Fonts family names. */
export const BRAND_FONTS = [
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

export type BrandFont = (typeof BRAND_FONTS)[number]

export const DEFAULT_BRAND_FONT: BrandFont = 'Inter'
export const DEFAULT_PRIMARY_COLOR   = '#800020'
export const DEFAULT_SECONDARY_COLOR = '#C99A3B'

const FONT_BY_LOWERCASE = new Map<string, BrandFont>(
  BRAND_FONTS.map(f => [f.toLowerCase(), f]),
)

const HEX6 = /^#[0-9A-Fa-f]{6}$/

/** Returns the canonical allowlisted font name, or null if not allowed. */
export function normalizeBrandFont(value: unknown): BrandFont | null {
  if (typeof value !== 'string') return null
  return FONT_BY_LOWERCASE.get(value.trim().toLowerCase()) ?? null
}

/** Returns the trimmed value if it is exactly #RRGGBB, otherwise null. */
export function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const v = value.trim()
  return HEX6.test(v) ? v : null
}

export type OptionalParse<T> = { ok: true; value: T | undefined } | { ok: false }

/** For write paths where the field may be omitted: empty/null/undefined is
 *  accepted (value undefined), anything else must be allowlisted. */
export function parseOptionalBrandFont(value: unknown): OptionalParse<BrandFont> {
  if (value === undefined || value === null || value === '') return { ok: true, value: undefined }
  const font = normalizeBrandFont(value)
  return font ? { ok: true, value: font } : { ok: false }
}

export function parseOptionalHexColor(value: unknown): OptionalParse<string> {
  if (value === undefined || value === null || value === '') return { ok: true, value: undefined }
  const color = normalizeHexColor(value)
  return color ? { ok: true, value: color } : { ok: false }
}

/** Render-time resolution: never throws, always returns safe values. */
export function resolveBrandInputs(input: {
  primaryColor?:   unknown
  secondaryColor?: unknown
  fontFamily?:     unknown
}): { primaryColor: string; secondaryColor: string; fontFamily: BrandFont } {
  return {
    primaryColor:   normalizeHexColor(input.primaryColor)   ?? DEFAULT_PRIMARY_COLOR,
    secondaryColor: normalizeHexColor(input.secondaryColor) ?? DEFAULT_SECONDARY_COLOR,
    fontFamily:     normalizeBrandFont(input.fontFamily)    ?? DEFAULT_BRAND_FONT,
  }
}

/** Serialize a value as a JS literal that is safe to embed in an inline
 *  <script>. JSON.stringify handles quotes/backslashes/newlines; the extra
 *  replacements stop `</script>`, HTML comments and legacy line terminators
 *  from breaking out. */
export function serializeForInlineScript(value: unknown): string {
  const json = JSON.stringify(value) ?? 'null'
  return json
    .replace(/</g,      '\\u003c')
    .replace(/>/g,      '\\u003e')
    .replace(/&/g,      '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

/** Builds the inline script that applies `css` ("--a:b;--c:d") to <html>.
 *  The css string is passed as an escaped string literal, never spliced in
 *  as code. Behaviour for legitimate values is unchanged. */
export function buildBrandScript(css: string): string {
  return (
    '(function(){try{' +
    'var el=document.documentElement;' +
    `var pairs=${serializeForInlineScript(css)}.split(";");` +
    'pairs.forEach(function(p){' +
    'var i=p.indexOf(":");' +
    'if(i>0) el.style.setProperty(p.slice(0,i),p.slice(i+1));' +
    '});' +
    '}catch(e){}})();'
  )
}
