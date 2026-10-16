// src/lib/brand/brandInputs.test.ts
// Regression tests for the font_family / colour injection fix.
// Run with: npx vitest run src/lib/brand/brandInputs.test.ts

import { describe, it, expect } from 'vitest'
import vm from 'node:vm'
import {
  BRAND_FONTS,
  DEFAULT_BRAND_FONT,
  DEFAULT_PRIMARY_COLOR,
  DEFAULT_SECONDARY_COLOR,
  normalizeBrandFont,
  normalizeHexColor,
  parseOptionalBrandFont,
  parseOptionalHexColor,
  resolveBrandInputs,
  serializeForInlineScript,
  buildBrandScript,
} from './brandInputs'

// Payloads an attacker could store in font_family / primary_color /
// secondary_color. Each one tries to end the JS string literal or the
// <script> element and run code.
const MALICIOUS = [
  'Inter";globalThis.pwned=true;//',
  'x"+(globalThis.pwned=true)+"',
  "Inter';globalThis.pwned=true;//",
  '</script><script>globalThis.pwned=true</script>',
  '</SCRIPT><img src=x onerror=alert(1)>',
  'Inter\nglobalThis.pwned=true',
  'Inter\u2028globalThis.pwned=true',
  'Inter\u2029globalThis.pwned=true',
  '${globalThis.pwned=true}',
  '`${globalThis.pwned=true}`',
  'Inter\\";globalThis.pwned=true;//',
  '#800020";globalThis.pwned=true;//',
  '#800020</script>',
  'javascript:alert(1)',
  '<!--',
]

describe('normalizeBrandFont', () => {
  it('accepts every allowlisted font', () => {
    for (const font of BRAND_FONTS) {
      expect(normalizeBrandFont(font)).toBe(font)
    }
  })

  it('covers the fonts offered by the registration form and the settings page', () => {
    for (const font of ['DM Sans', 'Poppins', 'Inter', 'Playfair Display', 'Roboto']) {
      expect(normalizeBrandFont(font)).toBe(font)
    }
    for (const font of ['Inter', 'Poppins', 'Lato', 'Montserrat', 'Nunito', 'Raleway']) {
      expect(normalizeBrandFont(font)).toBe(font)
    }
  })

  it('is case-insensitive and trims, returning the canonical spelling', () => {
    expect(normalizeBrandFont('  dm sans ')).toBe('DM Sans')
    expect(normalizeBrandFont('PLAYFAIR DISPLAY')).toBe('Playfair Display')
  })

  it('rejects malicious and unknown values', () => {
    for (const bad of MALICIOUS) expect(normalizeBrandFont(bad)).toBeNull()
    expect(normalizeBrandFont('Comic Sans MS')).toBeNull()
    expect(normalizeBrandFont('Inter, sans-serif')).toBeNull()
    expect(normalizeBrandFont('')).toBeNull()
  })

  it('rejects non-strings', () => {
    expect(normalizeBrandFont(undefined)).toBeNull()
    expect(normalizeBrandFont(null)).toBeNull()
    expect(normalizeBrandFont(42)).toBeNull()
    expect(normalizeBrandFont({ toString: () => 'Inter' })).toBeNull()
    expect(normalizeBrandFont(['Inter'])).toBeNull()
  })
})

describe('normalizeHexColor', () => {
  it('accepts #RRGGBB in either case', () => {
    expect(normalizeHexColor('#800020')).toBe('#800020')
    expect(normalizeHexColor('#c99a3b')).toBe('#c99a3b')
    expect(normalizeHexColor('  #00B4D8 ')).toBe('#00B4D8')
  })

  it('rejects malformed and malicious values', () => {
    for (const bad of MALICIOUS) expect(normalizeHexColor(bad)).toBeNull()
    for (const bad of ['#80002', '#8000200', '800020', '#GGGGGG', 'red', 'rgb(1,2,3)', '#800020\n', '']) {
      expect(normalizeHexColor(bad)).toBeNull()
    }
  })

  it('rejects non-strings', () => {
    expect(normalizeHexColor(undefined)).toBeNull()
    expect(normalizeHexColor(null)).toBeNull()
    expect(normalizeHexColor(0x800020)).toBeNull()
  })
})

describe('parseOptional* (registration write path)', () => {
  it('treats omitted values as ok-with-no-value', () => {
    for (const empty of [undefined, null, '']) {
      expect(parseOptionalBrandFont(empty)).toEqual({ ok: true, value: undefined })
      expect(parseOptionalHexColor(empty)).toEqual({ ok: true, value: undefined })
    }
  })

  it('accepts legitimate values and returns the canonical form', () => {
    expect(parseOptionalBrandFont('dm sans')).toEqual({ ok: true, value: 'DM Sans' })
    expect(parseOptionalHexColor('#800020')).toEqual({ ok: true, value: '#800020' })
  })

  it('rejects malicious values', () => {
    for (const bad of MALICIOUS) {
      expect(parseOptionalBrandFont(bad)).toEqual({ ok: false })
      expect(parseOptionalHexColor(bad)).toEqual({ ok: false })
    }
  })
})

describe('resolveBrandInputs (render-time)', () => {
  it('passes legitimate branding through unchanged', () => {
    expect(
      resolveBrandInputs({ primaryColor: '#1B365D', secondaryColor: '#C99A3B', fontFamily: 'Poppins' }),
    ).toEqual({ primaryColor: '#1B365D', secondaryColor: '#C99A3B', fontFamily: 'Poppins' })
  })

  it('falls back to platform defaults for missing values', () => {
    expect(resolveBrandInputs({})).toEqual({
      primaryColor:   DEFAULT_PRIMARY_COLOR,
      secondaryColor: DEFAULT_SECONDARY_COLOR,
      fontFamily:     DEFAULT_BRAND_FONT,
    })
  })

  it('replaces every malicious value with a safe default', () => {
    for (const bad of MALICIOUS) {
      const out = resolveBrandInputs({ primaryColor: bad, secondaryColor: bad, fontFamily: bad })
      expect(out).toEqual({
        primaryColor:   DEFAULT_PRIMARY_COLOR,
        secondaryColor: DEFAULT_SECONDARY_COLOR,
        fontFamily:     DEFAULT_BRAND_FONT,
      })
    }
  })
})

describe('serializeForInlineScript', () => {
  it('round-trips arbitrary strings through JSON.parse', () => {
    for (const s of [...MALICIOUS, 'plain', '--brand:#800020;--font-brand:DM Sans,Inter,sans-serif']) {
      expect(JSON.parse(serializeForInlineScript(s))).toBe(s)
    }
  })

  it('never emits characters that could end the script element or string', () => {
    for (const s of MALICIOUS) {
      const out = serializeForInlineScript(s)
      expect(out).not.toMatch(/[<>&]/)
      expect(out).not.toContain('\u2028')
      expect(out).not.toContain('\u2029')
      expect(out.toLowerCase()).not.toContain('</script')
      expect(out).not.toContain('\n')
    }
  })

  it('handles undefined without throwing', () => {
    expect(serializeForInlineScript(undefined)).toBe('null')
  })
})

describe('buildBrandScript', () => {
  function run(script: string) {
    const calls: Array<[string, string]> = []
    const sandbox: Record<string, unknown> = {
      pwned: false,
      document: {
        documentElement: {
          style: { setProperty: (k: string, v: string) => { calls.push([k, v]) } },
        },
      },
    }
    vm.runInNewContext(script, sandbox)
    return { calls, sandbox }
  }

  it('applies legitimate branding exactly as before', () => {
    const css = '--brand:#800020;--brand-2:#C99A3B;--font-brand:DM Sans,Inter,-apple-system,sans-serif'
    const { calls, sandbox } = run(buildBrandScript(css))
    expect(sandbox.pwned).toBe(false)
    expect(calls).toEqual([
      ['--brand', '#800020'],
      ['--brand-2', '#C99A3B'],
      ['--font-brand', 'DM Sans,Inter,-apple-system,sans-serif'],
    ])
  })

  it('does not execute attacker-controlled values, even if validation were bypassed', () => {
    for (const bad of MALICIOUS) {
      const script = buildBrandScript(`--font-brand:${bad},Inter,sans-serif`)
      expect(script.toLowerCase()).not.toContain('</script')
      const { sandbox } = run(script)
      expect(sandbox.pwned).toBe(false)
    }
  })

  it('contains no raw copy of the payload outside a string literal', () => {
    const script = buildBrandScript('--font-brand:Inter";globalThis.pwned=true;//')
    // The double quote from the payload must be escaped inside the literal.
    expect(script).toContain('\\"')
    expect(script).not.toContain('Inter";globalThis')
  })
})
