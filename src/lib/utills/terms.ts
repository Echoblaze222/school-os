// src/lib/utils/term.ts

export function getCurrentAcademicYear(): string {
  const now   = new Date()
  const year  = now.getFullYear()
  const month = now.getMonth() + 1
  return month >= 9 ? `${year}/${year + 1}` : `${year - 1}/${year}`
}

export function getCurrentTerm(): string {
  const month = new Date().getMonth() + 1
  if (month >= 9 && month <= 12) return 'First Term'
  if (month >= 1 && month <= 3)  return 'Second Term'
  return 'Third Term'
}