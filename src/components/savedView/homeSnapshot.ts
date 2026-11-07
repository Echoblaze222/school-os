// src/components/savedView/homeSnapshot.ts
// The small, generic summary kept on the phone for a role's Home screen:
// a greeting, the school, and a few headline numbers. Deliberately nothing
// sensitive: no money figures, no health or counselling data, no names of
// students, no activity text. Bump HOME_SNAPSHOT_VERSION whenever the shape
// changes so old copies are ignored.

export const HOME_SNAPSHOT_VERSION = 1

export interface HomeTile {
  label: string
  value: string
}

export interface HomeSnapshot {
  v:           number
  firstName:   string
  schoolName:  string
  schoolColor: string
  headline:    string
  tiles:       HomeTile[]
}

export function homeKey(role: string): string {
  return `${role}-home`
}

export function buildHomeSnapshot(
  profile: { full_name?: string | null } | null | undefined,
  school:  { name?: string | null; primary_color?: string | null } | null | undefined,
  headline: string,
  tiles: HomeTile[],
): HomeSnapshot {
  return {
    v:           HOME_SNAPSHOT_VERSION,
    firstName:   profile?.full_name?.split(' ')[0] ?? 'there',
    schoolName:  school?.name ?? '',
    schoolColor: school?.primary_color ?? '#7C3AED',
    headline,
    tiles,
  }
}
