// src/components/SchoolBrandInjector.tsx
// Server component - renders an inline <script> that overrides --brand
// and related CSS variables with the school's saved primary_color.
// Runs before React hydration so there is zero colour flash.
//
// SECURITY: the values passed in come from the database and are therefore
// untrusted (principals can write them, and registration accepts them from
// anonymous visitors). All validation, allowlisting and script serialization
// lives in @/lib/brand/brandVars and @/lib/validation/brand - do not
// interpolate props into the script string here.
//
// Usage (in any dashboard layout.tsx):
//   import SchoolBrandInjector from '@/components/SchoolBrandInjector'
//   <SchoolBrandInjector primaryColor={school.primary_color} fontFamily={school.font_family} />

import {
  brandFontUrl,
  buildBrandCssVars,
  buildBrandInitScript,
} from '@/lib/brand/brandVars'
import { DEFAULT_FONT_FAMILY } from '@/lib/validation/brand'

interface Props {
  primaryColor?:   string | null   // e.g. "#800020"
  secondaryColor?: string | null   // e.g. "#C99A3B" - the school's second brand colour
  fontFamily?:     string | null   // e.g. "Poppins" (must be one of ALLOWED_FONT_FAMILIES)
}

export default function SchoolBrandInjector({ primaryColor, secondaryColor, fontFamily }: Props) {
  const { vars, fontFamily: safeFont } = buildBrandCssVars({ primaryColor, secondaryColor, fontFamily })

  // Google Fonts URL for the chosen font (if not Inter which is already loaded)
  const needsFont = safeFont !== DEFAULT_FONT_FAMILY

  return (
    <>
      {/* Load the brand font if it differs from the default */}
      {needsFont && (
        <link rel="stylesheet" href={brandFontUrl(safeFont)} />
      )}

      {/*
        Inline script: sets CSS variables on <html> synchronously,
        before any CSS or React paint. No flash. No useEffect needed.
      */}
      <script dangerouslySetInnerHTML={{ __html: buildBrandInitScript(vars) }} />
    </>
  )
}
