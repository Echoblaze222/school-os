// src/lib/dnemis.ts
//
// Pure helpers for Learner Identification Numbers (LIN) and the D-NEMIS
// export/import flow. No I/O here so it is trivially unit-testable.

export interface DnemisStudentRow {
  id: string
  full_name: string
  gender: string | null
  date_of_birth: string | null
  class_level: string | null
  admission_number: string | null
  lin: string | null
  guardian_name: string | null
  guardian_phone: string | null
}

// Lenient on purpose; must match the CHECK constraint in
// sql/migrations/2026-10-27-lin-dnemis.sql. Tighten both together once the
// official LIN specification is confirmed.
const LIN_PATTERN = /^[A-Z0-9-]{8,24}$/
const DNEMIS_SCHOOL_ID_PATTERN = /^[0-9]{10}$/

export function normalizeLin(raw: string | null | undefined): string {
  return (raw ?? '').replace(/\s+/g, '').toUpperCase()
}

export function isValidLin(lin: string): boolean {
  return LIN_PATTERN.test(lin)
}

export function isValidDnemisSchoolId(id: string): boolean {
  return DNEMIS_SCHOOL_ID_PATTERN.test(id)
}

// ── CSV output ──────────────────────────────────────────────────────────────────────

/**
 * Escapes one CSV cell. Also neutralises spreadsheet formula injection: a
 * value starting with = @ (or a +/- that is not a plain number/phone) would
 * be executed by Excel/Sheets when the file is opened, and names here are
 * user-entered.
 */
export function csvCell(value: unknown): string {
  let s = value == null ? '' : String(value)
  if (/^[=@\t\r]/.test(s) || /^[+-](?![0-9 ()-]*$)/.test(s)) s = `'${s}`
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`
  return s
}

export const DNEMIS_CSV_HEADER = [
  'LIN',
  'Full Name',
  'Gender',
  'Date of Birth',
  'Class',
  'Admission Number',
  'Guardian Name',
  'Guardian Phone',
  'School D-NEMIS ID',
] as const

/**
 * Builds the learner export. Columns are a generic superset of what a school
 * is typically asked for; map them to the official D-NEMIS upload template
 * once you have it. UTF-8 BOM + CRLF so Excel opens Nigerian names correctly.
 */
export function buildDnemisCsv(rows: DnemisStudentRow[], schoolDnemisId: string | null): string {
  const lines = [DNEMIS_CSV_HEADER.join(',')]
  for (const r of rows) {
    lines.push(
      [
        r.lin,
        r.full_name,
        r.gender,
        r.date_of_birth,
        r.class_level,
        r.admission_number,
        r.guardian_name,
        r.guardian_phone,
        schoolDnemisId,
      ]
        .map(csvCell)
        .join(','),
    )
  }
  return '\uFEFF' + lines.join('\r\n') + '\r\n'
}

// ── CSV input ──────────────────────────────────────────────────────────────────────

function splitLine(line: string): string[] {
  // Delimiter: tab if present (pasted from a sheet), else semicolon, else comma.
  const delim = line.includes('\t') ? '\t' : line.includes(';') && !line.includes(',') ? ';' : ','
  const cells: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (ch === '"') inQuotes = false
      else cur += ch
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === delim) {
      cells.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  cells.push(cur)
  return cells.map(c => c.trim())
}

export interface ParsedLinRow {
  /** Admission number, as written in the file. */
  key: string
  lin: string
}

export interface ParsedLinCsv {
  rows: ParsedLinRow[]
  errors: string[]
}

/**
 * Parses a two-column "admission_number, lin" paste/upload. A header row is
 * detected and skipped. Rejects malformed LINs and LINs repeated within the
 * file (a LIN identifies exactly one learner).
 */
export function parseLinCsv(text: string): ParsedLinCsv {
  const rows: ParsedLinRow[] = []
  const errors: string[] = []
  const seenLins = new Map<string, number>()

  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/)
  lines.forEach((raw, idx) => {
    if (!raw.trim()) return
    const lineNo = idx + 1
    const cells = splitLine(raw)

    if (idx === 0 && /admission|student|id|name/i.test(cells[0] ?? '') && !isValidLin(normalizeLin(cells[1]))) {
      return // header
    }

    const key = cells[0] ?? ''
    const lin = normalizeLin(cells[1])
    if (!key) { errors.push(`Line ${lineNo}: missing admission number`); return }
    if (!lin) { errors.push(`Line ${lineNo}: missing LIN for ${key}`); return }
    if (!isValidLin(lin)) { errors.push(`Line ${lineNo}: "${cells[1]}" is not a valid LIN`); return }

    const firstSeen = seenLins.get(lin)
    if (firstSeen !== undefined) {
      errors.push(`Line ${lineNo}: LIN ${lin} already used on line ${firstSeen}`)
      return
    }
    seenLins.set(lin, lineNo)
    rows.push({ key, lin })
  })

  return { rows, errors }
}
