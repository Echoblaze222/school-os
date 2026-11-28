import 'fake-indexeddb/auto' // must load before the store opens IndexedDB
import { describe, it, expect } from 'vitest'
import { HOME_PROPS_MAX_AGE_MS, homePropsKey, loadHomeProps, saveHomeProps } from '../homeProps'
import { loadView, saveView } from '@/lib/savedView/store'

const props = { counts: { classCount: 3, studentCount: 90 }, examAppointmentLabel: null }

describe('home props kept for the offline Home screen', () => {
  it('uses a separate key per role', () => {
    expect(homePropsKey('teacher')).toBe('teacher-home-props')
    expect(homePropsKey('bursar')).not.toBe(homePropsKey('teacher'))
  })

  it('round-trips the saved figures for the same user', async () => {
    await saveHomeProps('u1', 'teacher', props)
    const res = await loadHomeProps<typeof props>('u1', 'teacher')
    expect(res?.props).toEqual(props)
    expect(typeof res?.savedAt).toBe('number')
  })

  it('never hands one user the copy saved for another', async () => {
    await saveHomeProps('u1', 'teacher', props)
    expect(await loadHomeProps('u2', 'teacher')).toBeNull()
  })

  it('saving as a second user removes the first user\'s copy', async () => {
    await saveHomeProps('u1', 'teacher', props)
    await saveHomeProps('u2', 'teacher', { counts: { classCount: 1, studentCount: 5 }, examAppointmentLabel: null })
    expect(await loadHomeProps('u1', 'teacher')).toBeNull()
  })

  it('ignores a copy written in an unknown format version', async () => {
    await saveView('u3', homePropsKey('teacher'), { v: 999, props })
    expect(await loadHomeProps('u3', 'teacher')).toBeNull()
  })

  it('keeps a copy for 7 days, longer than the 24 hour default of saved views', async () => {
    expect(HOME_PROPS_MAX_AGE_MS).toBe(7 * 24 * 60 * 60 * 1000)
    await saveHomeProps('u4', 'teacher', props)
    expect(await loadView('u4', homePropsKey('teacher'))).not.toBeNull()
  })
})
