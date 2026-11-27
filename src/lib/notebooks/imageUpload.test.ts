import { describe, it, expect } from 'vitest'
import { cleanImageLink, altFromFileName } from './imageUpload'

describe('image links and names', () => {
  it('accepts only https links and escapes brackets', () => {
    expect(cleanImageLink('https://example.com/a b.png')).toBe('https://example.com/a%20b.png')
    expect(cleanImageLink('https://example.com/x(1).png')).toBe('https://example.com/x%281%29.png')
    expect(cleanImageLink('http://example.com/a.png')).toBeNull()
    expect(cleanImageLink('javascript:alert(1)')).toBeNull()
    expect(cleanImageLink('data:image/png;base64,AAAA')).toBeNull()
    expect(cleanImageLink('   ')).toBeNull()
  })
  it('makes a readable caption from a file name', () => {
    expect(altFromFileName('IMG_2034 (1).jpg')).toBe('IMG 2034 1')
    expect(altFromFileName('.png')).toBe('Image')
  })
})
