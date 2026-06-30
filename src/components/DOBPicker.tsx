'use client'
// DOBPicker.tsx
// Fast date-of-birth picker — 3 dropdowns (Day / Month / Year) instead of
// the native <input type="date"> calendar, which forces many clicks to
// reach a year like 2010. Years are ordered newest-first but biased so
// school-age birth years (last ~25 years) are reachable instantly.

import { useMemo } from 'react'

interface Props {
  value: string // 'YYYY-MM-DD' or ''
  onChange: (value: string) => void
  inputStyle: React.CSSProperties
  minAge?: number // youngest allowed age, default 2
  maxAge?: number // oldest allowed age, default 80
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

export default function DOBPicker({ value, onChange, inputStyle, minAge = 2, maxAge = 80 }: Props) {
  const today = new Date()
  const currentYear = today.getFullYear()

  const [yyyy, mm, dd] = value ? value.split('-').map(Number) : [0, 0, 0]

  const years = useMemo(() => {
    const start = currentYear - maxAge
    const end   = currentYear - minAge
    const arr: number[] = []
    for (let y = end; y >= start; y--) arr.push(y)
    return arr
  }, [currentYear, minAge, maxAge])

  const maxDay = yyyy && mm ? daysInMonth(yyyy, mm) : 31
  const days = Array.from({ length: maxDay }, (_, i) => i + 1)

  function emit(nextYear: number, nextMonth: number, nextDay: number) {
    if (!nextYear || !nextMonth || !nextDay) return
    const clampedDay = Math.min(nextDay, daysInMonth(nextYear, nextMonth))
    const y = String(nextYear).padStart(4, '0')
    const m = String(nextMonth).padStart(2, '0')
    const d = String(clampedDay).padStart(2, '0')
    onChange(`${y}-${m}-${d}`)
  }

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    appearance: 'none',
    WebkitAppearance: 'none',
    cursor: 'pointer',
  }

  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <select
        value={dd || ''}
        onChange={e => emit(yyyy || currentYear - 10, mm || 1, Number(e.target.value))}
        style={{ ...selectStyle, flex: '0 0 22%' }}
      >
        <option value="">Day</option>
        {days.map(d => <option key={d} value={d}>{d}</option>)}
      </select>

      <select
        value={mm || ''}
        onChange={e => emit(yyyy || currentYear - 10, Number(e.target.value), dd || 1)}
        style={{ ...selectStyle, flex: '0 0 38%' }}
      >
        <option value="">Month</option>
        {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
      </select>

      <select
        value={yyyy || ''}
        onChange={e => emit(Number(e.target.value), mm || 1, dd || 1)}
        style={{ ...selectStyle, flex: '1' }}
      >
        <option value="">Year</option>
        {years.map(y => <option key={y} value={y}>{y}</option>)}
      </select>
    </div>
  )
}
