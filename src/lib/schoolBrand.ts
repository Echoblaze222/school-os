// src/lib/schoolBrand.ts
// Shared helpers for showing the current school's own branding in client
// components that run before (or without) a fresh Supabase query - the
// lock screen and the billing-locked screen both need this, and this file
// exists because that same read-and-parse-localStorage logic was found
// duplicated between them while fixing separate but related brand-color
// bugs in each (see PR #4). One place now, so a future third screen that
// needs the same thing doesn't have to guess whether to copy it again.

export interface StoredSchoolBrand {
  id?: string
  name?: string | null
  primaryColor?: string | null
  logoUrl?: string | null
}

// Reads the 'schoolos_selected_school' localStorage key that
// /select-school, /login, and signOutFlow.ts already write on every
// login. Synchronous, no network round trip, no loading flash - by the
// time any authenticated screen can render, this key is reliably present.
export function getStoredSchoolBrand(): StoredSchoolBrand {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem('schoolos_selected_school')
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return {
      id: parsed?.id,
      name: typeof parsed?.name === 'string' ? parsed.name : null,
      primaryColor: typeof parsed?.primaryColor === 'string' ? parsed.primaryColor : null,
      logoUrl: typeof parsed?.logoUrl === 'string' ? parsed.logoUrl : null,
    }
  } catch {
    return {}
  }
}

// Darkens a '#rrggbb' hex color by scaling each channel by `factor`
// (0-1). Used to derive the second stop of a two-tone gradient from the
// single color value the school actually stores. Falls back to the
// input unchanged if it isn't valid 6-digit hex.
export function shadeHex(hex: string, factor: number): string {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(hex)
  if (!match) return hex
  const int = parseInt(match[1], 16)
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)))
  const r = clamp(((int >> 16) & 255) * factor)
  const g = clamp(((int >> 8) & 255) * factor)
  const b = clamp((int & 255) * factor)
  return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`
}

// Converts a '#rrggbb' hex color to an 'rgba(r,g,b,a)' string, e.g. for a
// radial-gradient background tint. Falls back to a neutral maroon tint
// (SchoolOS's own accent) if the value isn't valid 6-digit hex.
export function hexToRgba(hex: string, alpha: number): string {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(hex)
  if (!match) return `rgba(128,0,32,${alpha})`
  const int = parseInt(match[1], 16)
  const r = (int >> 16) & 255
  const g = (int >> 8) & 255
  const b = int & 255
  return `rgba(${r},${g},${b},${alpha})`
}
