// lib/shellIdentity.ts
// Tiny external store so the mobile glass drawer (opened from BottomDock, which
// many pages mount without passing profile/school) can still show the school
// crest, name and the signed-in account. DesktopShell is mounted by every
// header, so it publishes here and the drawer subscribes.
import { useSyncExternalStore } from 'react'

export interface ShellIdentity {
  profile: any
  school:  any
}

let current: ShellIdentity = { profile: null, school: null }
const listeners = new Set<() => void>()

export function publishShellIdentity(next: ShellIdentity) {
  if (current.profile === next.profile && current.school === next.school) return
  current = next
  listeners.forEach(l => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function useShellIdentity(): ShellIdentity {
  return useSyncExternalStore(subscribe, () => current, () => current)
}
