import { describe, it, expect } from 'vitest'
import { isCronAuthorized } from '../cronAuth'

describe('isCronAuthorized', () => {
  it('accepts the correct bearer token', () => {
    expect(isCronAuthorized('Bearer s3cret-value', 's3cret-value')).toBe(true)
  })

  it('rejects a missing header', () => {
    expect(isCronAuthorized(null, 's3cret-value')).toBe(false)
    expect(isCronAuthorized(undefined, 's3cret-value')).toBe(false)
    expect(isCronAuthorized('', 's3cret-value')).toBe(false)
  })

  it('rejects a wrong token of the same length', () => {
    expect(isCronAuthorized('Bearer s3cret-valuf', 's3cret-value')).toBe(false)
  })

  it('rejects a wrong token of a different length', () => {
    expect(isCronAuthorized('Bearer nope', 's3cret-value')).toBe(false)
  })

  it('rejects a header without the Bearer prefix', () => {
    expect(isCronAuthorized('s3cret-value', 's3cret-value')).toBe(false)
  })

  it('fails closed when CRON_SECRET is not configured', () => {
    expect(isCronAuthorized('Bearer undefined', undefined)).toBe(false)
    expect(isCronAuthorized('Bearer ', '')).toBe(false)
    expect(isCronAuthorized('Bearer undefined', 'undefined')).toBe(false)
    expect(isCronAuthorized(undefined, undefined)).toBe(false)
  })
})
