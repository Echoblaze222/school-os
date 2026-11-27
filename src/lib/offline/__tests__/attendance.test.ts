import { describe, it, expect } from 'vitest'
import type { OutboxItem } from '../db'
import { pendingAttendanceStatuses } from '../attendance'

const item = (seq: number, rows: Record<string, unknown>[], table = 'attendance'): OutboxItem => ({
  seq,
  id: String(seq),
  userId: 'u1',
  schoolId: 's1',
  table,
  op: 'upsert',
  rows,
  onConflict: 'student_id,date,class_id',
  label: '',
  status: 'pending',
  attempts: 0,
  nextAttemptAt: 0,
  createdAt: 0,
  lastError: null,
})

const r = (student: string, status: string, classId = 'c1', date = '2026-11-22') => ({
  student_id: student,
  class_id: classId,
  date,
  status,
})

describe('pendingAttendanceStatuses', () => {
  it('returns only the requested class and date', () => {
    const items = [item(1, [r('a', 'absent'), r('b', 'late', 'c2'), r('c', 'absent', 'c1', '2026-11-21')])]
    expect(pendingAttendanceStatuses(items, 'c1', '2026-11-22')).toEqual({ a: 'absent' })
  })

  it('lets a later queued correction win, whatever order the array is in', () => {
    const items = [item(2, [r('a', 'present')]), item(1, [r('a', 'absent')])]
    expect(pendingAttendanceStatuses(items, 'c1', '2026-11-22')).toEqual({ a: 'present' })
  })

  it('ignores other tables and rows without a student id', () => {
    const items = [item(1, [r('a', 'absent')], 'payments'), item(2, [{ class_id: 'c1', date: '2026-11-22' }])]
    expect(pendingAttendanceStatuses(items, 'c1', '2026-11-22')).toEqual({})
  })

  it('defaults a missing status to present', () => {
    const items = [item(1, [{ student_id: 'a', class_id: 'c1', date: '2026-11-22' }])]
    expect(pendingAttendanceStatuses(items, 'c1', '2026-11-22')).toEqual({ a: 'present' })
  })
})
