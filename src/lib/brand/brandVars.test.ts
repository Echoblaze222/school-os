// src/lib/brand/brandVars.test.ts
import { describe, it, expect } from 'vitest'
import { brandFontUrl, buildBrandCssVars, buildBrandInitScript } from './brandVars'

/** Runs the generated init script against a fake document and returns what it set. */
function runInitScript(script: string): Array<[string, string]> {
  const calls: Array<[string, string]> = []
  const fakeDocument = {
    documentElement: {
      style: { setProperty: (k: string, v: string) => { calls.push([k, v]) } },
    },
  }
  new Function('document', script)(fakeDocument)
  return calls
}

function clearPwned() {
  delete (globalThis as unknown as Record<string, unknown>).__brandPwned
}
function pwned() {
  return (globalThis as unknown as Record<string, unknown>).__brandPwned
}

describe('buildBrandCssVars: ordinary school branding keeps working', () => {
  it('derives the expected palette from a primary colour', () => {
    const { vars, fontFamily } = buildBrandCssVars({ primaryColor: '#800020', secondaryColor: '#C99A3B', fontFamily: 'Inter' })
    expect(vars['--brand']).toBe('#800020')
    expect(vars['--brand-light']).toBe('#a04058')
    expect(vars['--brand-dark']).toBe('#600018')
    expect(vars['--brand-glow']).toBe('rgba(128,0,32,0.35)')
    expect(vars['--brand-subtle']).toBe('rgba(128,0,32,0.12)')
    expect(vars['--nav-icon-active']).toBe('#800020')
    expect(vars['--nav-label-active']).toBe('#a04058')
    expect(vars['--status-ok']).toBe('#3FA66B')
    expect(vars['--status-warn']).toBe('#E4572E')
    expect(fontFamily).toBe('Inter')
  })

  it('moves the on-track status colour off green for a green-branded school', () => {
    const { vars } = buildBrandCssVars({ primaryColor: '#1B7F4B' })
    expect(vars['--status-ok']).toBe('#2F86D3')
  })

  it('uses the saved secondary colour', () => {
    const { vars } = buildBrandCssVars({ primaryColor: '#800020', secondaryColor: '#112233' })
    expect(vars['--brand-2']).toBe('#112233')
  })

  it.each([undefined, null, '', 'red'])('falls back to gold when the secondary colour is %j', secondary => {
    const { vars } = buildBrandCssVars({ primaryColor: '#800020', secondaryColor: secondary })
    expect(vars['--brand-2']).toBe('#C99A3B')
  })

  it('keeps an allowlisted font, including names with spaces', () => {
    const { vars, fontFamily } = buildBrandCssVars({ primaryColor: '#800020', fontFamily: 'Playfair Display' })
    expect(fontFamily).toBe('Playfair Display')
    expect(vars['--font-brand']).toBe('Playfair Display,Inter,-apple-system,sans-serif')
  })

  it('does not throw and uses defaults when nothing is provided', () => {
    const { vars, fontFamily } = buildBrandCssVars({})
    expect(vars['--brand']).toBe('#800020')
    expect(vars['--brand-2']).toBe('#C99A3B')
    expect(fontFamily).toBe('Inter')
  })

  it('builds the Google Fonts URL for an allowlisted font', () => {
    const url = brandFontUrl('DM Sans')
    expect(url.startsWith('https://fonts.googleapis.com/css2?family=')).toBe(true)
    expect(url).toContain('DM%20Sans')
  })
})

describe('buildBrandCssVars: malicious stored values are neutralized', () => {
  const fontPayloads = [
    'Inter";globalThis.__brandPwned=1;//',
    '</script><script>globalThis.__brandPwned=1</script>',
    'Inter,sans-serif;x:y',
    "Poppins'",
  ]

  it.each(fontPayloads)('replaces the font payload %j with the default font', payload => {
    const { vars, fontFamily } = buildBrandCssVars({ primaryColor: '#800020', fontFamily: payload })
    expect(fontFamily).toBe('Inter')
    expect(vars['--font-brand']).toBe('Inter,Inter,-apple-system,sans-serif')
  })

  it.each([
    '#fff"+globalThis.__brandPwned+"',
    '#800020";globalThis.__brandPwned=1;//',
    '</script>',
    'red',
  ])('replaces the colour payload %j with the platform default', payload => {
    const { vars } = buildBrandCssVars({ primaryColor: payload, secondaryColor: payload })
    expect(vars['--brand']).toBe('#800020')
    expect(vars['--brand-2']).toBe('#C99A3B')
    for (const value of Object.values(vars)) {
      expect(value).not.toContain('__brandPwned')
      expect(value).not.toContain('<')
    }
  })

  it('generates an init script that runs no injected code for any hostile input', () => {
    clearPwned()
    for (const payload of fontPayloads) {
      const { vars } = buildBrandCssVars({ primaryColor: payload, secondaryColor: payload, fontFamily: payload })
      const script = buildBrandInitScript(vars)
      expect(script.toLowerCase()).not.toContain('</script')
      const calls = runInitScript(script)
      expect(calls.length).toBe(Object.keys(vars).length)
      for (const [key] of calls) expect(key.startsWith('--')).toBe(true)
    }
    expect(pwned()).toBeUndefined()
  })
})

describe('buildBrandInitScript', () => {
  it('sets every variable on the root element with its exact value', () => {
    const { vars } = buildBrandCssVars({ primaryColor: '#1B7F4B', secondaryColor: '#112233', fontFamily: 'Lato' })
    expect(runInitScript(buildBrandInitScript(vars))).toEqual(Object.entries(vars))
  })

  it('stays safe even if a hostile value somehow reaches it (serialization is independent of validation)', () => {
    clearPwned()
    const hostile = {
      '--x': '";globalThis.__brandPwned=1;//',
      '--y': '</script><img src=x onerror=alert(1)>',
      '--z': 'line\u2028break',
    }
    const script = buildBrandInitScript(hostile)
    expect(script.toLowerCase()).not.toContain('</script')
    expect(runInitScript(script)).toEqual(Object.entries(hostile))
    expect(pwned()).toBeUndefined()
  })
})
