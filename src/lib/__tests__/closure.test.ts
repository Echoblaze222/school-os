import { describe, it, expect } from 'vitest'
import {
  lagosToday,
  isClosureLive,
  reasonLabel,
  bannerTitle,
  notificationText,
  CLOSURE_REASON_IDS,
} from '../closure'

const base = { mode: 'closed', reason: 'security', starts_on: '2026-10-27', expected_end_on: null as string | null, active: true }

describe('lagosToday', () => {
  it('uses Nigeria time, which is ahead of UTC by an hour', () => {
    expect(lagosToday(new Date('2026-10-27T23:30:00Z'))).toBe('2026-10-28')
    expect(lagosToday(new Date('2026-10-27T10:00:00Z'))).toBe('2026-10-27')
  })
})

describe('isClosureLive', () => {
  const noon = new Date('2026-10-27T11:00:00Z')

  it('is live when active and started', () => {
    expect(isClosureLive(base, noon)).toBe(true)
  })

  it('is not live when ended or inactive', () => {
    expect(isClosureLive({ ...base, active: false }, noon)).toBe(false)
  })

  it('is not live before its start date', () => {
    expect(isClosureLive({ ...base, starts_on: '2026-10-28' }, noon)).toBe(false)
  })

  it('stops showing after the expected end date', () => {
    expect(isClosureLive({ ...base, expected_end_on: '2026-10-26' }, noon)).toBe(false)
  })

  it('is still live on the expected end date itself', () => {
    expect(isClosureLive({ ...base, expected_end_on: '2026-10-27' }, noon)).toBe(true)
  })
})

describe('labels and text', () => {
  it('maps reason ids and falls back safely', () => {
    expect(reasonLabel('weather')).toBe('Flooding or weather')
    expect(reasonLabel('nope')).toBe('Other')
  })

  it('has banner titles for both modes', () => {
    expect(bannerTitle('remote')).toBe('Learning from home')
    expect(bannerTitle('closed')).toBe('School is closed')
  })

  it('builds a notification including message and reopening date', () => {
    const n = notificationText({ mode: 'remote', reason: 'weather', message: 'Check assignments daily.', expected_end_on: '2026-11-02' })
    expect(n.title).toBe('Learning from home')
    expect(n.body).toContain('flooding or weather')
    expect(n.body).toContain('Check assignments daily.')
    expect(n.body).toContain('2026-11-02')
  })

  it('copes with no message and caps the length', () => {
    const n = notificationText({ mode: 'closed', reason: 'other', message: null, expected_end_on: null })
    expect(n.body).toBe('School closed (other)')
    const long = notificationText({ mode: 'closed', reason: 'other', message: 'x'.repeat(1000), expected_end_on: null })
    expect(long.body.length).toBeLessThanOrEqual(400)
  })

  it('matches the reason CHECK in the migration', () => {
    expect(CLOSURE_REASON_IDS).toEqual(['security', 'weather', 'health', 'strike', 'public', 'other'])
  })
})
