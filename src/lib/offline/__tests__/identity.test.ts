import { describe, it, expect } from 'vitest'
import { scrubSensitive } from '../identity'

describe('scrubSensitive', () => {
  it('drops anything that looks like a credential, at any depth', () => {
    const input = {
      id: 'u1',
      full_name: 'Ada',
      password_hash: 'x',
      transaction_pin: '1234',
      reset_token: 't',
      auto_lock_minutes: 10,
      schools: { name: 'Nonchalant', api_secret: 's', primary_color: '#800020' },
      list: [{ otp: '1', ok: true }],
    }
    expect(scrubSensitive(input)).toEqual({
      id: 'u1',
      full_name: 'Ada',
      auto_lock_minutes: 10,
      schools: { name: 'Nonchalant', primary_color: '#800020' },
      list: [{ ok: true }],
    })
  })

  it('does not drop innocent keys that merely contain those letters', () => {
    const input = { pinned: true, shipping_address: 'x', tokenizer_note: 'y' }
    expect(scrubSensitive(input)).toEqual(input)
  })

  it('passes primitives and null through', () => {
    expect(scrubSensitive(null)).toBeNull()
    expect(scrubSensitive('a')).toBe('a')
    expect(scrubSensitive(3)).toBe(3)
  })
})
