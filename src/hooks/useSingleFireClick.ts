// src/hooks/useSingleFireClick.ts
//
// Some Android WebViews fire a duplicate click/touch event for a single
// tap. For a toggle button implemented as setX(!x), that duplicate fire
// nets out to no visible change — open-then-immediately-close in the same
// gesture, indistinguishable from the button doing nothing. For a button
// that only ever needs to open something (a menu, a picker), the fix is
// to call setX(true) explicitly instead of toggling — see the chat
// sticker picker and header menu for that pattern.
//
// But some buttons are genuine two-way toggles where the SAME button is
// the only control (show/hide password, dark-mode switch, expand/collapse
// a card) — there's no separate "close" action to convert to, so
// explicit-true isn't an option without permanently locking the toggle
// on. This hook fixes those by guarding the handler itself: a second
// call within a short window of the first is ignored, so a duplicated
// event can't cancel out a genuine tap. It does not change the toggle
// logic at all, so it's safe to drop into any existing setX(!x) handler.
import { useRef } from 'react'

export function useSingleFireClick<Args extends unknown[]>(
  handler: (...args: Args) => void,
  windowMs = 400
): (...args: Args) => void {
  const lastFired = useRef(0)
  return (...args: Args) => {
    const now = Date.now()
    if (now - lastFired.current < windowMs) return
    lastFired.current = now
    handler(...args)
  }
}
