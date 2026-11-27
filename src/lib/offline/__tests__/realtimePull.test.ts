import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPullScheduler } from '../realtimePull'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('createPullScheduler', () => {
  it('turns a burst of events into one pull of the distinct tables', async () => {
    const pull = vi.fn(async () => {})
    const s = createPullScheduler({ pull, delayMs: 1000 })
    for (let i = 0; i < 40; i++) s.notify('results')
    s.notify('classes')
    await vi.advanceTimersByTimeAsync(999)
    expect(pull).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2)
    expect(pull).toHaveBeenCalledTimes(1)
    expect(pull).toHaveBeenCalledWith(['results', 'classes'])
  })
  it('keeps names while pulling is not allowed, and pulls them on the next event', async () => {
    const pull = vi.fn(async () => {})
    let ok = false
    const s = createPullScheduler({ pull, delayMs: 100, canPull: () => ok })
    s.notify('results')
    await vi.advanceTimersByTimeAsync(200)
    expect(pull).not.toHaveBeenCalled()
    ok = true
    s.notify('classes')
    await vi.advanceTimersByTimeAsync(200)
    expect(pull).toHaveBeenCalledWith(['results', 'classes'])
  })
  it('does nothing after stop and survives a failing pull', async () => {
    const pull = vi.fn(async () => { throw new Error('boom') })
    const s = createPullScheduler({ pull, delayMs: 100 })
    s.notify('a')
    await vi.advanceTimersByTimeAsync(200)
    expect(pull).toHaveBeenCalledTimes(1)
    s.stop()
    s.notify('b')
    await vi.advanceTimersByTimeAsync(500)
    expect(pull).toHaveBeenCalledTimes(1)
  })
})
