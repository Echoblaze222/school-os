// src/lib/liveClass/__tests__/attendance.test.ts
//
// Exercises markLiveClassAttendance against an in-memory fake of the
// Supabase query-builder chain (select/eq/maybeSingle, update/eq,
// insert) rather than a real Postgres instance — the RLS-relevant
// behavior already has real Postgres coverage in the Phase 0 SQL test
// harness; what's under test here is purely the idempotency LOGIC
// (select-then-insert-or-update), which doesn't depend on RLS at all
// and is meaningfully cheaper and more precise to test this way.
//
// The specific scenario this exists to prove: "a student joining twice
// because of reconnection must not create duplicate attendance records"
// (Phase 1 requirement) — TEST 3 below is that exact scenario.

import { describe, it, expect, beforeEach } from 'vitest'
import { markLiveClassAttendance } from '../attendance'

interface FakeRow { id: string; class_id: string; student_id: string; date: string; is_present: boolean; [k: string]: unknown }

function makeFakeAdmin(initialRows: FakeRow[] = []) {
  const rows = [...initialRows]
  let nextId = 1

  const admin = {
    from(table: string) {
      if (table !== 'attendance') throw new Error(`fake admin only supports 'attendance', got ${table}`)
      return {
        select() {
          const filters: Record<string, unknown> = {}
          const builder = {
            eq(col: string, val: unknown) {
              filters[col] = val
              return builder
            },
            async maybeSingle() {
              const match = rows.find(r => Object.entries(filters).every(([k, v]) => (r as any)[k] === v))
              return { data: match ?? null, error: null }
            },
          }
          return builder
        },
        update(patch: Record<string, unknown>) {
          return {
            async eq(col: string, val: unknown) {
              const row = rows.find(r => (r as any)[col] === val)
              if (row) Object.assign(row, patch)
              return { error: null }
            },
          }
        },
        async insert(row: Record<string, unknown>) {
          rows.push({ id: `fake-${nextId++}`, ...row } as FakeRow)
          return { error: null }
        },
      }
    },
  }

  return { admin, rows }
}

const schoolId = 'school-1'
const classId = 'class-1'
const studentId = 'student-1'
const teacherId = 'teacher-1'

describe('markLiveClassAttendance', () => {
  it('inserts a new attendance row when none exists for today', async () => {
    const { admin, rows } = makeFakeAdmin()
    const result = await markLiveClassAttendance(admin as any, { schoolId, classId, studentId, teacherId })
    expect(result.action).toBe('inserted')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ class_id: classId, student_id: studentId, is_present: true, status: 'present' })
  })

  it('updates an existing not-yet-present row to present, rather than inserting a second row', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const { admin, rows } = makeFakeAdmin([
      { id: 'existing-1', class_id: classId, student_id: studentId, date: today, is_present: false },
    ])
    const result = await markLiveClassAttendance(admin as any, { schoolId, classId, studentId, teacherId })
    expect(result.action).toBe('updated')
    expect(rows).toHaveLength(1) // still one row, not two
    expect(rows[0].is_present).toBe(true)
  })

  it('the core reconnect scenario: calling it twice for the same student/class/day never produces two rows', async () => {
    const { admin, rows } = makeFakeAdmin()

    const first = await markLiveClassAttendance(admin as any, { schoolId, classId, studentId, teacherId })
    const second = await markLiveClassAttendance(admin as any, { schoolId, classId, studentId, teacherId }) // simulates a reconnect

    expect(first.action).toBe('inserted')
    expect(second.action).toBe('already_present')
    expect(rows).toHaveLength(1) // <- the requirement: no duplicate
  })

  it('a different student joining the same class/day gets their own row', async () => {
    const { admin, rows } = makeFakeAdmin()
    await markLiveClassAttendance(admin as any, { schoolId, classId, studentId: 'student-1', teacherId })
    await markLiveClassAttendance(admin as any, { schoolId, classId, studentId: 'student-2', teacherId })
    expect(rows).toHaveLength(2)
  })
})
