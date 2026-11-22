// src/lib/offline/attendance.ts
// Pure helper (no I/O) for the teacher attendance screen: what is still waiting
// to upload for one class on one day, so the screen shows what the teacher
// actually saved even when the server does not have it yet.

import type { OutboxItem } from './db'

/**
 * Map of student_id -> status from queued attendance changes for this class and
 * date. Items are applied in queue order, so a later correction wins.
 */
export function pendingAttendanceStatuses(
  items: OutboxItem[],
  classId: string,
  date: string,
): Record<string, string> {
  const result: Record<string, string> = {}
  const ordered = [...items].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
  for (const item of ordered) {
    if (item.table !== 'attendance') continue
    for (const row of item.rows) {
      if (row.class_id !== classId || row.date !== date) continue
      if (typeof row.student_id !== 'string') continue
      result[row.student_id] = typeof row.status === 'string' ? row.status : 'present'
    }
  }
  return result
}
