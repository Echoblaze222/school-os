// src/lib/constants/nigeria.ts
// Single source of truth for Nigerian states and school education levels.
// Previously this list was hardcoded inline only in register-school/page.tsx;
// it's needed again for public discovery filters (Lane B) and the
// principal's public-profile settings, so it now lives in one place both
// import from instead of drifting into two copies.
//
// Typed as readonly string[] (not `as const` tuples): several call sites
// do EDUCATION_LEVELS.includes(someArbitraryString) to validate
// user-submitted values, which needs the wider string parameter type. A
// literal-tuple type would reject that call at compile time.

export const NIGERIAN_STATES: readonly string[] = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue',
  'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu',
  'FCT Abuja', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina',
  'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo',
  'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara',
]

export const SCHOOL_TYPES: readonly string[] = ['secondary', 'primary', 'combined']

export const SCHOOL_TYPE_LABELS: Record<string, string> = {
  primary: 'Primary',
  secondary: 'Secondary',
  combined: 'Primary & Secondary',
}

export const EDUCATION_LEVELS: readonly string[] = [
  'Creche',
  'Nursery',
  'Primary',
  'Junior Secondary',
  'Senior Secondary',
]

export const ADMISSION_STATUS_LABELS: Record<string, string> = {
  open: 'Admissions open',
  closed: 'Admissions closed',
  waitlist: 'Waitlist only',
}
