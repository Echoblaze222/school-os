// src/lib/utils/unwrapEmbed.ts
//
// Supabase/PostgREST embeds don't always come back as a flat object —
// depending on inferred cardinality, the same query can return either
// an object or a 1-element array for the same embedded relation. This
// helper normalizes both shapes safely.
//
// IMPORTANT — key naming: when you disambiguate a relationship with a
// hint like `profiles!student_id(...)` in a .select() string, that hint
// is ONLY used to pick which foreign key to follow. It does NOT change
// the key name in the response — the response key is always just the
// table name, e.g. `row.profiles`, never `row['profiles!student_id']`.
// (Confirmed directly from a live Supabase response during debugging:
// the row came back as `{ profiles: { full_name, class_level } }`.)
//
// The key DOES change if you use alias syntax instead of a hint, e.g.
// `parent:profiles!parent_id(...)` returns `row.parent`, not `row.profiles`.
//
// Use this helper anywhere you read an embedded relation, reading by the
// correct key (table name, or alias if one was used) — never the hint.

export function unwrapEmbed<T = any>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null
  if (Array.isArray(value)) return value[0] ?? null
  return value
}
