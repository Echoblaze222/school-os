// src/lib/liveClass/__tests__/authorize.test.ts
//
// Unit tests for decideLiveClassAccess — the pure decision function that
// backs /api/live/token. These complement, not replace, the SQL-level RLS
// tests in sql/migrations/2026-08-29-live-classroom-phase0.sql's test
// harness: RLS is the database-enforced backstop, this is the app-layer
// decision that runs first and produces the actual error messages/status
// codes a client sees. Both layers independently enforce the same
// cross-school and role rules on purpose (defense in depth) — these tests
// exist to catch a regression in the app layer even if RLS alone would
// have caught the underlying attempt.

import { describe, it, expect } from 'vitest'
import { decideLiveClassAccess, type CallerProfile, type OnlineClassRow } from '../authorize'

const greenwoodSchoolId = '11111111-1111-1111-1111-111111111111'
const riversideSchoolId = '22222222-2222-2222-2222-222222222222'
const classId = 'cccccccc-0001-0001-0001-000000000001'
const otherClassId = 'cccccccc-0009-0009-0009-000000000009'
const sessionId = 'dddddddd-0001-0001-0001-000000000001'

function caller(overrides: Partial<CallerProfile> = {}): CallerProfile {
  return {
    userId: 'user-1',
    role: 'student',
    schoolId: greenwoodSchoolId,
    fullName: 'Test User',
    ...overrides,
  }
}

function session(overrides: Partial<OnlineClassRow> = {}): OnlineClassRow {
  return {
    id: sessionId,
    class_id: classId,
    school_id: greenwoodSchoolId,
    teacher_id: 'teacher-1',
    ...overrides,
  }
}

const unlocked = { locked: false }
const locked = { locked: true }

describe('decideLiveClassAccess', () => {
  it('denies when the caller has no profile/school (no_profile)', () => {
    const result = decideLiveClassAccess({
      caller: caller({ schoolId: null }),
      session: session(),
      isClassTeacher: false,
      isEnrolledStudent: false,
      schoolLock: unlocked,
    })
    expect(result).toEqual({ ok: false, reason: 'no_profile' })
  })

  it('denies when the session does not exist (session_not_found)', () => {
    const result = decideLiveClassAccess({
      caller: caller(),
      session: null,
      isClassTeacher: false,
      isEnrolledStudent: false,
      schoolLock: unlocked,
    })
    expect(result).toEqual({ ok: false, reason: 'session_not_found' })
  })

  it('denies a same-role caller from a different school (cross_school) — the core tenant-isolation case', () => {
    const result = decideLiveClassAccess({
      caller: caller({ schoolId: riversideSchoolId, role: 'teacher' }),
      session: session({ school_id: greenwoodSchoolId }),
      isClassTeacher: true, // even if somehow true, cross-school must still win
      isEnrolledStudent: false,
      schoolLock: unlocked,
    })
    expect(result).toEqual({ ok: false, reason: 'cross_school' })
  })

  it('cross_school is checked before school_locked, so a cross-tenant attempt never leaks whether the target school is locked', () => {
    const result = decideLiveClassAccess({
      caller: caller({ schoolId: riversideSchoolId, role: 'principal' }),
      session: session({ school_id: greenwoodSchoolId }),
      isClassTeacher: false,
      isEnrolledStudent: false,
      schoolLock: locked, // Greenwood is locked, but Riverside caller should get cross_school, not school_locked
    })
    expect(result).toEqual({ ok: false, reason: 'cross_school' })
  })

  it('denies everyone, including the assigned teacher, when the school is locked', () => {
    const result = decideLiveClassAccess({
      caller: caller({ role: 'teacher' }),
      session: session(),
      isClassTeacher: true,
      isEnrolledStudent: false,
      schoolLock: locked,
    })
    expect(result).toEqual({ ok: false, reason: 'school_locked' })
  })

  it('grants host to the assigned class teacher, same school, unlocked', () => {
    const result = decideLiveClassAccess({
      caller: caller({ role: 'teacher', userId: 'teacher-1' }),
      session: session(),
      isClassTeacher: true,
      isEnrolledStudent: false,
      schoolLock: unlocked,
    })
    expect(result).toEqual({
      ok: true,
      role: 'host',
      userId: 'teacher-1',
      schoolId: greenwoodSchoolId,
      onlineClassId: sessionId,
      classId,
    })
  })

  it('denies host to a teacher in the same school who is NOT assigned to this class — falls through to participant', () => {
    const result = decideLiveClassAccess({
      caller: caller({ role: 'teacher', userId: 'teacher-2' }),
      session: session(),
      isClassTeacher: false, // not on class_teachers for this class
      isEnrolledStudent: false,
      schoolLock: unlocked,
    })
    expect(result).toEqual({
      ok: true,
      role: 'participant', // least privilege, not denied outright and not host
      userId: 'teacher-2',
      schoolId: greenwoodSchoolId,
      onlineClassId: sessionId,
      classId,
    })
  })

  it('grants host to a principal regardless of class_teachers membership', () => {
    const result = decideLiveClassAccess({
      caller: caller({ role: 'principal' }),
      session: session(),
      isClassTeacher: false,
      isEnrolledStudent: false,
      schoolLock: unlocked,
    })
    expect(result).toMatchObject({ ok: true, role: 'host' })
  })

  it('a principal from a different school does NOT get host — cross_school still wins over role', () => {
    const result = decideLiveClassAccess({
      caller: caller({ role: 'principal', schoolId: riversideSchoolId }),
      session: session({ school_id: greenwoodSchoolId }),
      isClassTeacher: false,
      isEnrolledStudent: false,
      schoolLock: unlocked,
    })
    expect(result).toEqual({ ok: false, reason: 'cross_school' })
  })

  it('grants participant to a student who IS enrolled in this class', () => {
    const result = decideLiveClassAccess({
      caller: caller({ role: 'student' }),
      session: session(),
      isClassTeacher: false,
      isEnrolledStudent: true,
      schoolLock: unlocked,
    })
    expect(result).toMatchObject({ ok: true, role: 'participant' })
  })

  it('denies a student in the SAME SCHOOL who is enrolled in a DIFFERENT class (not_enrolled_in_class) — the "unrelated class" scenario', () => {
    const result = decideLiveClassAccess({
      caller: caller({ role: 'student' }),
      session: session({ class_id: otherClassId }), // session belongs to a class this student isn't in
      isClassTeacher: false,
      isEnrolledStudent: false, // isEnrolledInClass() returned false for THIS class
      schoolLock: unlocked,
    })
    expect(result).toEqual({ ok: false, reason: 'not_enrolled_in_class' })
  })

  it('not_enrolled_in_class is still checked after cross_school — a student from a different school gets cross_school, not the enrollment message', () => {
    const result = decideLiveClassAccess({
      caller: caller({ role: 'student', schoolId: riversideSchoolId }),
      session: session({ school_id: greenwoodSchoolId }),
      isClassTeacher: false,
      isEnrolledStudent: false,
      schoolLock: unlocked,
    })
    expect(result).toEqual({ ok: false, reason: 'cross_school' })
  })

  it('grants participant to a parent in the same school (enrollment check does not apply to parents)', () => {
    const result = decideLiveClassAccess({
      caller: caller({ role: 'parent' }),
      session: session(),
      isClassTeacher: false,
      isEnrolledStudent: false,
      schoolLock: unlocked,
    })
    expect(result).toMatchObject({ ok: true, role: 'participant' })
  })

  it('denies a role with no defined access (not_authorized_role)', () => {
    const result = decideLiveClassAccess({
      caller: caller({ role: 'unknown_future_role' }),
      session: session(),
      isClassTeacher: false,
      isEnrolledStudent: false,
      schoolLock: unlocked,
    })
    expect(result).toEqual({ ok: false, reason: 'not_authorized_role' })
  })
})
