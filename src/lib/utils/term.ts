/**
 * Shared term + academic year utilities.
 *
 * Nigerian school calendar:
 *   Sep–Dec → First Term  (e.g. 2025/2026)
 *   Jan–Mar → Second Term (e.g. 2025/2026)
 *   Apr–Jul → Third Term  (e.g. 2025/2026)
 *
 * The common shortcut `${year}/${year+1}` is WRONG in April–July
 * because the academic year started the previous September.
 */

export function getCurrentAcademicYear(): string {
  const m = new Date().getMonth() // 0-indexed
  const y = new Date().getFullYear()
  // Sep–Dec: new academic year has just started → y/y+1
  // Jan–Aug: we are mid-year from the previous Sep → y-1/y
  return m >= 8 ? `${y}/${y + 1}` : `${y - 1}/${y}`
}

export function getCurrentTerm(): string {
  const m = new Date().getMonth()
  if (m >= 8) return 'First Term'
  if (m <= 2) return 'Second Term'
  return 'Third Term'
}

export function getCurrentTermAndYear(): { term: string; academicYear: string } {
  return {
    term:         getCurrentTerm(),
    academicYear: getCurrentAcademicYear(),
  }
}
