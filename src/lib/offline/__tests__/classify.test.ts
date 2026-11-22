import { describe, it, expect } from 'vitest'
import { classifyResult, backoffMs, MAX_DELAY_MS } from '../classify'

describe('classifyResult', () => {
  const cases: Array<[string, Parameters<typeof classifyResult>[0], string]> = [
    ['success', { error: null, status: 201 }, 'ok'],
    ['chrome offline', { error: { message: 'TypeError: Failed to fetch' }, status: 0 }, 'network'],
    ['safari offline', { error: { message: 'Load failed' } }, 'network'],
    ['postgres aborted transaction is NOT network', { error: { code: '25P02', message: 'current transaction is aborted, commands ignored' }, status: 400 }, 'fatal'],
    ['expired jwt', { error: { code: 'PGRST301', message: 'JWT expired' }, status: 401 }, 'auth'],
    ['gateway', { error: { message: 'bad gateway' }, status: 503 }, 'server'],
    ['statement timeout is server', { error: { code: '57014', message: 'canceling statement due to statement timeout' }, status: 500 }, 'server'],
    ['rate limited', { error: { message: 'slow down' }, status: 429 }, 'server'],
    ['rls refusal', { error: { code: '42501', message: 'new row violates row-level security policy' }, status: 403 }, 'fatal'],
    ['constraint', { error: { code: '23505', message: 'duplicate key' }, status: 409 }, 'fatal'],
    ['unknown error without status', { error: { message: 'weird' } }, 'fatal'],
  ]
  it.each(cases)('%s', (_name, input, expected) => {
    expect(classifyResult(input)).toBe(expected)
  })
})

describe('backoffMs', () => {
  it('is half fixed, half random', () => {
    expect(backoffMs(1, () => 0)).toBe(2500)
    expect(backoffMs(1, () => 1)).toBe(5000)
    expect(backoffMs(2, () => 1)).toBe(10000)
  })
  it('is capped', () => {
    expect(backoffMs(50, () => 1)).toBe(MAX_DELAY_MS)
    expect(backoffMs(50, () => 0)).toBe(MAX_DELAY_MS / 2)
  })
})
