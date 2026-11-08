import { describe, it, expect } from 'vitest'
import { escapeHtml } from '../escapeHtml'

describe('escapeHtml', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
    )
  })

  it('neutralises an injected link in a name', () => {
    const out = escapeHtml('Ada <a href="https://evil.example">Click</a>')
    expect(out).not.toContain('<a')
  })

  it('handles null, undefined and numbers', () => {
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(undefined)).toBe('')
    expect(escapeHtml(42)).toBe('42')
  })

  it('leaves ordinary text, including accents, untouched', () => {
    expect(escapeHtml('Chioma Òkọnkwọ')).toBe('Chioma Òkọnkwọ')
  })
})
