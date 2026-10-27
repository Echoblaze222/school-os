import { describe, it, expect } from 'vitest'
import {
  normalizeLin,
  isValidLin,
  isValidDnemisSchoolId,
  csvCell,
  buildDnemisCsv,
  parseLinCsv,
  type DnemisStudentRow,
} from '../dnemis'

const row = (over: Partial<DnemisStudentRow> = {}): DnemisStudentRow => ({
  id: 'u1',
  full_name: 'Chioma Okonkwo',
  gender: 'Female',
  date_of_birth: '2012-03-04',
  class_level: 'JSS 1',
  admission_number: 'ADM/2026/001',
  lin: 'AB12-3456-7890',
  guardian_name: 'Mr Okonkwo',
  guardian_phone: '+2348012345678',
  ...over,
})

describe('LIN helpers', () => {
  it('normalises case and whitespace', () => {
    expect(normalizeLin(' ab12 3456 7890 ')).toBe('AB1234567890')
    expect(normalizeLin(null)).toBe('')
  })

  it('validates LIN shape', () => {
    expect(isValidLin('AB12-3456-7890')).toBe(true)
    expect(isValidLin('1234567890123456')).toBe(true)
    expect(isValidLin('short')).toBe(false)
    expect(isValidLin('has space 12345')).toBe(false)
    expect(isValidLin('')).toBe(false)
  })

  it('validates the 10-digit school ID', () => {
    expect(isValidDnemisSchoolId('1234567890')).toBe(true)
    expect(isValidDnemisSchoolId('123456789')).toBe(false)
    expect(isValidDnemisSchoolId('12345678901')).toBe(false)
    expect(isValidDnemisSchoolId('12345abcde')).toBe(false)
  })
})

describe('csvCell', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"')
  })

  it('renders null/undefined as empty', () => {
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
  })

  it('neutralises spreadsheet formulas', () => {
    expect(csvCell('=SUM(A1:A9)')).toBe("'=SUM(A1:A9)")
    expect(csvCell('@cmd')).toBe("'@cmd")
    expect(csvCell('-2+3+cmd')).toBe("'-2+3+cmd")
  })

  it('leaves plain phone numbers alone', () => {
    expect(csvCell('+2348012345678')).toBe('+2348012345678')
    expect(csvCell('080 1234 5678')).toBe('080 1234 5678')
  })
})

describe('buildDnemisCsv', () => {
  it('emits BOM, header, CRLF rows and the school ID on every row', () => {
    const csv = buildDnemisCsv([row(), row({ id: 'u2', full_name: 'Ade, Bola', lin: null })], '1234567890')
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    const lines = csv.slice(1).split('\r\n')
    expect(lines[0]).toBe(
      'LIN,Full Name,Gender,Date of Birth,Class,Admission Number,Guardian Name,Guardian Phone,School D-NEMIS ID',
    )
    expect(lines[1]).toContain('AB12-3456-7890,Chioma Okonkwo')
    expect(lines[1].endsWith(',1234567890')).toBe(true)
    expect(lines[2].startsWith(',"Ade, Bola"')).toBe(true)
  })

  it('leaves the school ID column empty when not set', () => {
    const csv = buildDnemisCsv([row()], null)
    expect(csv.split('\r\n')[1].endsWith(',')).toBe(true)
  })
})

describe('parseLinCsv', () => {
  it('parses comma, tab and semicolon rows and skips a header', () => {
    const { rows, errors } = parseLinCsv(
      'admission_number,lin\nADM/1,ab12-3456-7890\nADM/2\t1234567890123456\nADM/3;ZZ99-0000-1111\n',
    )
    expect(errors).toEqual([])
    expect(rows).toEqual([
      { key: 'ADM/1', lin: 'AB12-3456-7890' },
      { key: 'ADM/2', lin: '1234567890123456' },
      { key: 'ADM/3', lin: 'ZZ99-0000-1111' },
    ])
  })

  it('reports invalid and missing LINs with line numbers', () => {
    const { rows, errors } = parseLinCsv('ADM/1,bad\nADM/2,\n,AB12-3456-7890')
    expect(rows).toEqual([])
    expect(errors).toHaveLength(3)
    expect(errors[0]).toMatch(/^Line 1:/)
    expect(errors[1]).toMatch(/^Line 2:/)
    expect(errors[2]).toMatch(/^Line 3:/)
  })

  it('rejects a LIN repeated inside the file', () => {
    const { rows, errors } = parseLinCsv('ADM/1,AB12-3456-7890\nADM/2,ab12-3456-7890')
    expect(rows).toHaveLength(1)
    expect(errors[0]).toMatch(/already used on line 1/)
  })

  it('handles quoted cells and a BOM', () => {
    const { rows, errors } = parseLinCsv('\uFEFF"ADM/1","AB12-3456-7890"')
    expect(errors).toEqual([])
    expect(rows).toEqual([{ key: 'ADM/1', lin: 'AB12-3456-7890' }])
  })

  it('ignores blank lines', () => {
    const { rows, errors } = parseLinCsv('\n\nADM/1,AB12-3456-7890\n\n')
    expect(errors).toEqual([])
    expect(rows).toHaveLength(1)
  })
})
