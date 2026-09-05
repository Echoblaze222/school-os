// src/lib/liveClass/__tests__/meetingAuthorize.test.ts
//
// Tests decideMeetingAccess and isInMeetingAudience against the REAL
// online_meetings audience model (verified against the actual per-role
// page.tsx queries already in this codebase, not invented): all_parents,
// all_teachers, all_staff (includes teachers), specific_class (student
// or parent-of-student in that class). Complements the real RLS tests in
// sql/migrations/2026-09-02-live-classroom-phase4-meetings.sql's test
// harness (10 tests, all passing against real Postgres) the same way
// authorize.test.ts complements the Phase 0 RLS suite.

import { describe, it, expect } from 'vitest'
import { decideMeetingAccess, isMeetingDenied, isInMeetingAudience, type MeetingCallerProfile, type OnlineMeetingRow } from '../meetingAuthorize'

const schoolId = '11111111-1111-1111-1111-111111111111'
const otherSchoolId = '22222222-2222-2222-2222-222222222222'
const meetingId = 'ffffffff-0001-0001-0001-000000000001'
const classId = 'cccccccc-0001-0001-0001-000000000001'

function caller(overrides: Partial<MeetingCallerProfile> = {}): MeetingCallerProfile {
  return { userId: 'user-1', role: 'parent', schoolId, fullName: 'Test User', ...overrides }
}

function meeting(overrides: Partial<OnlineMeetingRow> = {}): OnlineMeetingRow {
  return { id: meetingId, school_id: schoolId, target_audience: 'all_parents', target_class_id: null, created_by: 'principal-1', ...overrides }
}

const unlocked = { locked: false }
const locked = { locked: true }

describe('isInMeetingAudience', () => {
  it('all_parents matches only parent', () => {
    expect(isInMeetingAudience({ role: 'parent', targetAudience: 'all_parents', isInSpecificClassAudience: false })).toBe(true)
    expect(isInMeetingAudience({ role: 'teacher', targetAudience: 'all_parents', isInSpecificClassAudience: false })).toBe(false)
  })

  it('all_teachers matches only teacher', () => {
    expect(isInMeetingAudience({ role: 'teacher', targetAudience: 'all_teachers', isInSpecificClassAudience: false })).toBe(true)
    expect(isInMeetingAudience({ role: 'principal', targetAudience: 'all_teachers', isInSpecificClassAudience: false })).toBe(false)
  })

  it('all_staff includes teacher (matches the real teacher meetings page query, confirmed against the actual codebase — not the narrower is_staff() set used elsewhere)', () => {
    for (const role of ['teacher', 'principal', 'bursar', 'secretary', 'admin']) {
      expect(isInMeetingAudience({ role, targetAudience: 'all_staff', isInSpecificClassAudience: false })).toBe(true)
    }
    expect(isInMeetingAudience({ role: 'parent', targetAudience: 'all_staff', isInSpecificClassAudience: false })).toBe(false)
    expect(isInMeetingAudience({ role: 'student', targetAudience: 'all_staff', isInSpecificClassAudience: false })).toBe(false)
  })

  it('specific_class only matches student/parent AND only when isInSpecificClassAudience is true', () => {
    expect(isInMeetingAudience({ role: 'student', targetAudience: 'specific_class', isInSpecificClassAudience: true })).toBe(true)
    expect(isInMeetingAudience({ role: 'student', targetAudience: 'specific_class', isInSpecificClassAudience: false })).toBe(false)
    expect(isInMeetingAudience({ role: 'parent', targetAudience: 'specific_class', isInSpecificClassAudience: true })).toBe(true)
    expect(isInMeetingAudience({ role: 'teacher', targetAudience: 'specific_class', isInSpecificClassAudience: true })).toBe(false)
  })
})

describe('decideMeetingAccess', () => {
  it('denies with no_profile when the caller has no school', () => {
    expect(decideMeetingAccess({ caller: caller({ schoolId: null }), meeting: meeting(), isInSpecificClassAudience: false, schoolLock: unlocked }))
      .toEqual({ ok: false, reason: 'no_profile' })
  })

  it('denies with meeting_not_found when the meeting does not exist', () => {
    expect(decideMeetingAccess({ caller: caller(), meeting: null, isInSpecificClassAudience: false, schoolLock: unlocked }))
      .toEqual({ ok: false, reason: 'meeting_not_found' })
  })

  it('denies with cross_school for a different-school caller, checked before role/audience', () => {
    const result = decideMeetingAccess({
      caller: caller({ schoolId: otherSchoolId, role: 'principal' }),
      meeting: meeting({ school_id: schoolId }),
      isInSpecificClassAudience: false,
      schoolLock: unlocked,
    })
    expect(result).toEqual({ ok: false, reason: 'cross_school' })
  })

  it('cross_school wins over school_locked', () => {
    const result = decideMeetingAccess({
      caller: caller({ schoolId: otherSchoolId }),
      meeting: meeting({ school_id: schoolId }),
      isInSpecificClassAudience: false,
      schoolLock: locked,
    })
    expect(result).toEqual({ ok: false, reason: 'cross_school' })
  })

  it('denies everyone, including staff, when the school is locked', () => {
    expect(decideMeetingAccess({ caller: caller({ role: 'principal' }), meeting: meeting(), isInSpecificClassAudience: false, schoolLock: locked }))
      .toEqual({ ok: false, reason: 'school_locked' })
  })

  it('grants host to principal/bursar/secretary/admin regardless of who created the meeting', () => {
    for (const role of ['principal', 'bursar', 'secretary', 'admin']) {
      const result = decideMeetingAccess({
        caller: caller({ role, userId: 'someone-else' }),
        meeting: meeting({ created_by: 'principal-1' }),
        isInSpecificClassAudience: false,
        schoolLock: unlocked,
      })
      expect(result).toMatchObject({ ok: true, role: 'host' })
    }
  })

  it('grants host to a non-staff caller who created the meeting (e.g. a teacher who scheduled a specific_class meeting)', () => {
    const result = decideMeetingAccess({
      caller: caller({ role: 'teacher', userId: 'teacher-1' }),
      meeting: meeting({ target_audience: 'specific_class', target_class_id: classId, created_by: 'teacher-1' }),
      isInSpecificClassAudience: false, // irrelevant — creator path wins first
      schoolLock: unlocked,
    })
    expect(result).toMatchObject({ ok: true, role: 'host' })
  })

  it('a parent is a participant in an all_parents meeting', () => {
    const result = decideMeetingAccess({ caller: caller({ role: 'parent' }), meeting: meeting({ target_audience: 'all_parents' }), isInSpecificClassAudience: false, schoolLock: unlocked })
    expect(result).toMatchObject({ ok: true, role: 'participant' })
  })

  it('a parent is DENIED for a staff meeting (all_staff)', () => {
    const result = decideMeetingAccess({ caller: caller({ role: 'parent' }), meeting: meeting({ target_audience: 'all_staff', created_by: 'principal-1' }), isInSpecificClassAudience: false, schoolLock: unlocked })
    expect(result).toEqual({ ok: false, reason: 'not_authorized_audience' })
  })

  it('a student is a participant in their own specific_class meeting when isInSpecificClassAudience is true', () => {
    const result = decideMeetingAccess({
      caller: caller({ role: 'student' }),
      meeting: meeting({ target_audience: 'specific_class', target_class_id: classId, created_by: 'teacher-1' }),
      isInSpecificClassAudience: true,
      schoolLock: unlocked,
    })
    expect(result).toMatchObject({ ok: true, role: 'participant' })
  })

  it('a student is DENIED for a specific_class meeting targeting a DIFFERENT class (isInSpecificClassAudience: false)', () => {
    const result = decideMeetingAccess({
      caller: caller({ role: 'student' }),
      meeting: meeting({ target_audience: 'specific_class', target_class_id: classId, created_by: 'teacher-1' }),
      isInSpecificClassAudience: false,
      schoolLock: unlocked,
    })
    expect(result).toEqual({ ok: false, reason: 'not_authorized_audience' })
  })

  it('a teacher is a participant in all_staff and all_teachers meetings they did not create', () => {
    const r1 = decideMeetingAccess({ caller: caller({ role: 'teacher' }), meeting: meeting({ target_audience: 'all_staff', created_by: 'principal-1' }), isInSpecificClassAudience: false, schoolLock: unlocked })
    const r2 = decideMeetingAccess({ caller: caller({ role: 'teacher' }), meeting: meeting({ target_audience: 'all_teachers', created_by: 'principal-1' }), isInSpecificClassAudience: false, schoolLock: unlocked })
    expect(r1).toMatchObject({ ok: true, role: 'participant' })
    expect(r2).toMatchObject({ ok: true, role: 'participant' })
  })

  it('isMeetingDenied narrows correctly at runtime', () => {
    const denied = decideMeetingAccess({ caller: caller({ schoolId: null }), meeting: meeting(), isInSpecificClassAudience: false, schoolLock: unlocked })
    const granted = decideMeetingAccess({ caller: caller({ role: 'principal' }), meeting: meeting(), isInSpecificClassAudience: false, schoolLock: unlocked })
    expect(isMeetingDenied(denied)).toBe(true)
    expect(isMeetingDenied(granted)).toBe(false)
    if (isMeetingDenied(denied)) expect(denied.reason).toBe('no_profile')
  })
})
