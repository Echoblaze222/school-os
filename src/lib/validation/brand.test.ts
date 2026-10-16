// src/lib/validation/brand.test.ts
import { describe, it, expect } from 'vitest'
import {
  ALLOWED_FONT_FAMILIES,
  normalizeFontFamily,
  normalizeHexColor,
  serializeForInlineScript,
} from './brand'

describe('normalizeFontFamily', () => {
  it.each([...ALLOWED_FONT_FAMILIES])('accepts the allowlisted font %s', font => {
    expect(normalizeFontFamily(font)).toBe(font)
  })

  it('returns the canonical spelling for different case and surrounding whitespace', () => {
    expect(normalizeFontFamily('  playfair display ')).toBe('Playfair Display')
    expect(normalizeFontFamily('DM SANS')).toBe('DM Sans')
  })

  it.each([
    'Inter";alert(1);//',
    '</script><script>alert(1)</script>',
    'Inter,sans-serif',
    'Inter;color:red',
    "Inter'",
    'url(https://evil.example/x.css)',
    'Inter\u2028',
    'In\nter',
    'Arial',
    '',
    '   ',
  ])('rejects %j', value => {
    expect(normalizeFontFamily(value)).toBeNull()
  })

  it.each([null, undefined, 42, {}, ['Inter']])('rejects non-string input %j', value => {
    expect(normalizeFontFamily(value)).toBeNull()
  })
})

describe('normalizeHexColor', () => {
  it.each(['#800020', '#C99A3B', '#aBc123', '#000000', '#FFFFFF'])('accepts %s', value => {
    expect(normalizeHexColor(value)).toBe(value)
  })

  it('trims surrounding whitespace', () => {
    expect(normalizeHexColor(' #800020 ')).toBe('#800020')
  })

  it.each([
    '#fff',
    '800020',
    '#80002',
    '#8000200',
    '#800020;color:red',
    '#800020"',
    '#800020\n',
    '#800020";alert(1);//',
    'red',
    'rgb(1,2,3)',
    '',
  ])('rejects %j', value => {
    expect(normalizeHexColor(value)).toBeNull()
  })

  it.each([null, undefined, 123, {}])('rejects non-string input %j', value => {
    expect(normalizeHexColor(value)).toBeNull()
  })
})

describe('serializeForInlineScript', () => {
  it('neutralizes a closing script tag and angle brackets', () => {
    const out = serializeForInlineScript({ a: '</script><script>alert(1)</script>' })
    expect(out.toLowerCase()).not.toContain('</script')
    expect(out).not.toContain('<')
    expect(out).not.toContain('>')
  })

  it('escapes ampersands and JS line separators', () => {
    const out = serializeForInlineScript('a&b\u2028c\u2029d')
    expect(out).not.toContain('&')
    expect(out).not.toMatch(/[\u2028\u2029]/)
  })

  it('still round-trips to the original value as JSON', () => {
    const value = { a: '</script>&\u2028"quoted"', b: ['x', 1, null] }
    expect(JSON.parse(serializeForInlineScript(value))).toEqual(value)
  })

  it('does not let a string value break out of its literal and run code', () => {
    const g = globalThis as unknown as Record<string, unknown>
    delete g.__brandPwned
    const payload = '";globalThis.__brandPwned=1;//'
    const result = new Function('return ' + serializeForInlineScript(payload))()
    expect(result).toBe(payload)
    expect(g.__brandPwned).toBeUndefined()
  })

  it('returns "null" for undefined instead of throwing', () => {
    expect(serializeForInlineScript(undefined)).toBe('null')
  })
})
