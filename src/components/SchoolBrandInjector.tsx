// src/components/SchoolBrandInjector.tsx
// Server component - renders an inline <script> that overrides --brand
// and related CSS variables with the school's saved primary_color.
// Runs before React hydration so there is zero colour flash.
//
// Usage (in any dashboard layout.tsx):
//   import SchoolBrandInjector from '@/components/SchoolBrandInjector'
//   <SchoolBrandInjector primaryColor={school.primary_color} fontFamily={school.font_family} />

interface Props {
  primaryColor:   string   // e.g. "#800020"
  secondaryColor?: string  // e.g. "#C99A3B" - the school's second brand colour
  fontFamily?:    string   // e.g. "Poppins"
}

/** Hex → HSL, used only to keep the fixed status colours from landing in
 *  the same hue family as whatever a school picks for its brand colours
 *  (e.g. a green-branded school shouldn't also get a green "on track" pill - *  they'd read as the same signal). */
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

/** Lighten a hex colour by mixing it toward white at the given ratio (0-1). */
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

export default function SchoolBrandInjector({ primaryColor, secondaryColor, fontFamily = 'Inter' }: Props) {
  // Derive the full palette from the single primary colour
  const brandLight  = lighten(primaryColor, 0.25)
  const brandDark   = darken(primaryColor, 0.25)
  const brandGlow   = rgba(primaryColor, 0.35)
  const brandSubtle = rgba(primaryColor, 0.12)
  const brandBorder = rgba(primaryColor, 0.3)
  const inputFocus  = rgba(primaryColor, 0.5)
  const glassActive = rgba(primaryColor, 0.15)
  const glassBorderHover = rgba(primaryColor, 0.4)

  // Second brand colour - falls back to a warm gold if the school hasn't
  // set one, since most school brand kits are a primary + one accent.
  const brand2 = secondaryColor || '#C99A3B'
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

  // Build the CSS variable block as a string
  const css = [
    `--brand:${primaryColor}`,
    `--brand-light:${brandLight}`,
    `--brand-dark:${brandDark}`,
    `--brand-glow:${brandGlow}`,
    `--brand-subtle:${brandSubtle}`,
    `--brand-border:${brandBorder}`,
    `--brand-2:${brand2}`,
    `--brand-2-light:${brand2Light}`,
    `--brand-2-dark:${brand2Dark}`,
    `--brand-2-subtle:${brand2Subtle}`,
    `--status-ok:${statusOk}`,
    `--status-warn:${statusWarn}`,
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
