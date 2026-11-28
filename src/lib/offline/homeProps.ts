// src/lib/offline/homeProps.ts
// The numbers a role's Home screen needs, kept on the phone so the offline twin
// of that Home screen can show the same screen with the last-known figures.
//
// Same privacy rules as src/lib/savedView/store.ts (stamped with the user, other
// users' copies removed on save, wiped on sign-out). On top of that, what is
// saved here must be limited to non-sensitive summary figures: counts and
// labels, never money, health or counselling data, names of students, or the
// text of activity or messages. Each role decides that in its own homeProps.ts.

import { loadView, saveView } from '@/lib/savedView/store'

export const HOME_PROPS_VERSION = 1

/** Offline copies are valid for as long as the saved sign-in identity is (7 days). */
export const HOME_PROPS_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

interface Envelope<T> {
  v: number
  props: T
}

export function homePropsKey(role: string): string {
  return `${role}-home-props`
}

export async function saveHomeProps<T>(userId: string, role: string, props: T): Promise<void> {
  const envelope: Envelope<T> = { v: HOME_PROPS_VERSION, props }
  await saveView(userId, homePropsKey(role), envelope)
}

export async function loadHomeProps<T>(
  userId: string,
  role: string,
): Promise<{ props: T; savedAt: number } | null> {
  const saved = await loadView<Envelope<T>>(userId, homePropsKey(role), HOME_PROPS_MAX_AGE_MS)
  if (!saved || saved.data?.v !== HOME_PROPS_VERSION) return null
  return { props: saved.data.props, savedAt: saved.savedAt }
}
