// src/lib/validation/safeUrl.ts
// Rejects anything that isn't a plain http(s) URL - in particular
// `javascript:`, `data:`, and `vbscript:` schemes, which are the classic
// way a link field becomes a stored-XSS vector once it's rendered back out
// in an <a href>. Used by any endpoint that accepts a user-supplied URL
// meant to be clicked from the public site (school_promotions.external_link,
// image_url, etc.) - see Lane E's promotion routes.

export function isSafeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Returns the trimmed URL if it's a safe http(s) URL, otherwise null.
 * Pass-through null/undefined/empty stays null (field is optional).
 */
export function sanitizeOptionalUrl(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return isSafeHttpUrl(trimmed) ? trimmed : null
}
