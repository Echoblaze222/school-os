// src/components/SchoolBrandInjector.tsx
// Server component - renders an inline <script> that overrides --brand
// and related CSS variables with the school's saved primary_color.
// Runs before React hydration so there is zero colour flash.
//
// The palette itself is derived in src/lib/brand/brandVars.ts, which the offline
// twin pages also use, so a school looks the same online and offline.
//
// Usage (in any dashboard layout.tsx):
//   import SchoolBrandInjector from '@/components/SchoolBrandInjector'
//   <SchoolBrandInjector primaryColor={school.primary_color} fontFamily={school.font_family} />

import { buildBrandVars } from '@/lib/brand/brandVars'

interface Props {
  primaryColor:   string   // e.g. "#800020"
  secondaryColor?: string  // e.g. "#C99A3B" - the school's second brand colour
  fontFamily?:    string   // e.g. "Poppins"
}

export default function SchoolBrandInjector({ primaryColor, secondaryColor, fontFamily = 'Inter' }: Props) {
  // Build the CSS variable block as a string
  const css = buildBrandVars({ primaryColor, secondaryColor, fontFamily })
    .map(([name, value]) => `${name}:${value}`)
    .join(';')

  // Google Fonts URL for the chosen font (if not Inter which is already loaded)
  const needsFont = fontFamily !== 'Inter'
  const fontUrl   = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontFamily)}:wght@400;500;600;700;800&display=swap`

  return (
    <>
      {/* Load the brand font if it differs from the default */}
      {needsFont && (
        <link rel="stylesheet" href={fontUrl} />
      )}

      {/*
        Inline script: sets CSS variables on <html> synchronously,
        before any CSS or React paint. No flash. No useEffect needed.
      */}
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){try{
            var el=document.documentElement;
            var pairs="${css}".split(";");
            pairs.forEach(function(p){
              var i=p.indexOf(":");
              if(i>0) el.style.setProperty(p.slice(0,i),p.slice(i+1));
            });
          }catch(e){}})();`,
        }}
      />
    </>
  )
}
