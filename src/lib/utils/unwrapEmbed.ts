// src/lib/utils/unwrapEmbed.ts
//
// Supabase/PostgREST embeds (e.g. `profiles!student_id(...)`) don't always
// come back as a flat object. Depending on how PostgREST infers the
// relationship cardinality, the same query can return either:
//
//   row['profiles!student_id'] = { full_name: 'Jane', ... }       // object
//   row['profiles!student_id'] = [{ full_name: 'Jane', ... }]     // array
//
// This silently breaks any code that does `row['profiles!student_id']?.full_name`
// when the actual shape is an array — no error is thrown, the optional
// chain just resolves to undefined, and the UI falls back to "Unknown".
//
// Use this helper anywhere you read an embedded relation to handle both
// shapes safely.

export function unwrapEmbed<T = any>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null
  if (Array.isArray(value)) return value[0] ?? null
  return value
}
