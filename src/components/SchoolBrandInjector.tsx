// src/components/SchoolBrandInjector.tsx
// Server component — renders an inline <script> that overrides --brand
// and related CSS variables with the school's saved primary_color.
// Runs before React hydration so there is zero colour flash.
//
// Usage (in any dashboard layout.tsx):
//   import SchoolBrandInjector from '@/components/SchoolBrandInjector'
//   <SchoolBrandInjector primaryColor={school.primary_color} fontFamily={school.font_family} />

interface Props {
  primaryColor: string   // e.g. "#800020"
  fontFamily?:  string   // e.g. "Poppins"
}

/** Lighten a hex colour by mixing it toward white at the given ratio (0–1). */
function hexToRgb(hex: string): [number, number, number] | null {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return null
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ]
}

function darken(hex: string, amount: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const [r, g, b] = rgb.map(v => Math.max(0, Math.round(v * (1 - amount))))
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`
}

function lighten(hex: string, amount: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const [r, g, b] = rgb.map(v => Math.min(255, Math.round(v + (255 - v) * amount)))
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`
}

function rgba(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`
}

export default function SchoolBrandInjector({ primaryColor, fontFamily = 'Inter' }: Props) {
  // Derive the full palette from the single primary colour
  const brandLight  = lighten(primaryColor, 0.25)
  const brandDark   = darken(primaryColor, 0.25)
  const brandGlow   = rgba(primaryColor, 0.35)
  const brandSubtle = rgba(primaryColor, 0.12)
  const brandBorder = rgba(primaryColor, 0.3)
  const inputFocus  = rgba(primaryColor, 0.5)
  const glassActive = rgba(primaryColor, 0.15)
  const glassBorderHover = rgba(primaryColor, 0.4)

  // Build the CSS variable block as a string
  const css = [
    `--brand:${primaryColor}`,
    `--brand-light:${brandLight}`,
    `--brand-dark:${brandDark}`,
    `--brand-glow:${brandGlow}`,
    `--brand-subtle:${brandSubtle}`,
    `--brand-border:${brandBorder}`,
    `--input-focus:${inputFocus}`,
    `--glass-bg-active:${glassActive}`,
    `--glass-border-hover:${glassBorderHover}`,
    `--nav-icon-active:${primaryColor}`,
    `--nav-label-active:${brandLight}`,
    `--font-brand:${fontFamily},Inter,-apple-system,sans-serif`,
  ].join(';')

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
