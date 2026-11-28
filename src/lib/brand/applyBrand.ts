// src/lib/brand/applyBrand.ts
// CLIENT ONLY. Applies a school's brand variables to <html> from a saved school row,
// for pages that cannot use the server-rendered SchoolBrandInjector (offline twins).
// Uses the same palette code as the online dashboards (brandVars.ts).
//
// Values come from a row saved on the phone, so they are validated before use:
// a bad colour or font name is ignored and the default is used instead.

import { buildBrandVars, DEFAULT_FONT_FAMILY, DEFAULT_PRIMARY_COLOR } from './brandVars'

const HEX = /^#[0-9a-fA-F]{6}$/
const FONT = /^[A-Za-z0-9 ]{1,40}$/

export interface SavedSchoolBrand {
  primary_color?: string | null
  secondary_color?: string | null
  font_family?: string | null
}

/** Returns a cleanup function that removes the variables again. */
export function applyBrandVars(school: SavedSchoolBrand | null | undefined): () => void {
  if (typeof document === 'undefined') return () => {}

  const primary = school?.primary_color && HEX.test(school.primary_color) ? school.primary_color : DEFAULT_PRIMARY_COLOR
  const secondary = school?.secondary_color && HEX.test(school.secondary_color) ? school.secondary_color : undefined
  const font = school?.font_family && FONT.test(school.font_family) ? school.font_family : DEFAULT_FONT_FAMILY

  const root = document.documentElement
  const vars = buildBrandVars({ primaryColor: primary, secondaryColor: secondary, fontFamily: font })
  for (const [name, value] of vars) root.style.setProperty(name, value)

  return () => {
    for (const [name] of vars) root.style.removeProperty(name)
  }
}
