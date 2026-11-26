import { describe, it, expect } from 'vitest'
import {
  FORBIDDEN_COLUMN,
  NEVER_SYNC,
  PROFILE_COLUMNS,
  SYNC_TABLES,
  isSyncable,
  profileScope,
  scrubRow,
} from '../syncTables'
import { OFFLINE_WRITABLE_TABLES } from '../outbox'

describe('syncTables safety rules', () => {
  it('never lists a table that is on the never-sync list', () => {
    for (const cfg of SYNC_TABLES) expect(NEVER_SYNC.has(cfg.table)).toBe(false)
  })

  it('isSyncable is false for risky tables and true for listed ones', () => {
    expect(isSyncable('payments')).toBe(false)
    expect(isSyncable('student_medical_records')).toBe(false)
    expect(isSyncable('classes')).toBe(true)
    expect(isSyncable('nope')).toBe(false)
  })

  it('profiles never request a forbidden column', () => {
    for (const c of PROFILE_COLUMNS) expect(FORBIDDEN_COLUMN.test(c), c).toBe(false)
    expect(PROFILE_COLUMNS).not.toContain('default_code')
    expect(PROFILE_COLUMNS).not.toContain('email')
    expect(PROFILE_COLUMNS).not.toContain('date_of_birth')
  })

  it('scrubRow drops credential-like and identity columns but keeps harmless ones', () => {
    const out = scrubRow({
      id: '1', full_name: 'A', is_pinned: true, class_id: 'c',
      email: 'a@b.c', phone: '1', pin_hash: 'x', temp_password: 'y', nin_number: '1',
      date_of_birth: '2010-01-01', default_code: 'ABC', signature_url: 's', address: 'x',
    })
    expect(Object.keys(out).sort()).toEqual(['class_id', 'full_name', 'id', 'is_pinned'])
  })

  it('is a separate list from the offline-writable tables concept (readable != writable)', () => {
    // results are readable offline but must not be writable offline yet
    expect(isSyncable('results')).toBe(true)
    expect(Object.keys(OFFLINE_WRITABLE_TABLES)).not.toContain("results")
  })
})

describe('profileScope', () => {
  const base = { userId: 'me', classIds: [] as string[] }
  it('gives the whole school only to school-wide staff', () => {
    expect(profileScope({ ...base, role: 'principal' })).toEqual({ kind: 'all' })
    expect(profileScope({ ...base, role: 'secretary' })).toEqual({ kind: 'all' })
    expect(profileScope({ ...base, role: 'vice_principal' })).toEqual({ kind: 'all' })
  })
  it('gives a teacher only the classes they teach', () => {
    expect(profileScope({ ...base, role: 'teacher', classIds: ['b', 'a'] })).toEqual({ kind: 'in', column: 'class_id', values: ['a', 'b'] })
  })
  it('falls back to self-only for students, parents, unknown and teachers without classes', () => {
    for (const role of ['student', 'parent', 'whatever', null, undefined, 'teacher']) {
      expect(profileScope({ ...base, role })).toEqual({ kind: 'eq', column: 'id', value: 'me' })
    }
  })
})
