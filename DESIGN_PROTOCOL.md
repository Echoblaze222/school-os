# SchoolOS Premium Design Protocol

Derived from the 2026 SaaS dashboard research (Linear, Vercel, Stripe, Attio, Raycast patterns),
mapped onto SchoolOS's real tokens in `src/app/globals.css`. This is the bar for what good looks like.

## Core rule

Expensive means restraint and precision. Fewer colors, weights, borders and shadows. When in doubt, remove.

## Hard rules

1. Shadows only on floating UI (bottom dock, menus, modals, toasts). Never on static cards.
2. Hairline 1px borders define structure. `--glass-border` is already correct.
3. Two font weights for most UI (400 and 600). Reserve 700 for a single hero number per screen.
4. Every number a user compares or scans uses tabular figures (`.tabular-nums` or a `table`).
5. One accent per screen. Brand burgundy leads; cyan `--gold` is a rare secondary.
6. Per-school brand colors flow through `sc` / SchoolBrandInjector. Never hardcode a hue.
   `--status-warn` / `--status-ok` are runtime-injected on purpose. Do not "fix" them.
7. Motion: 100 to 160ms for feedback, 250ms max for entrances, always honor prefers-reduced-motion (already global).
8. Every list, table and card needs loading (skeleton), empty, and error designs.
9. Touch targets 44px minimum on mobile (the Capacitor WebView is the primary surface).
10. Blur (`backdrop-filter`) only on surfaces that float over scrolling content: dock, sticky header, modals.

## Done in globals.css (this branch)

- Tabular numerals on tables and `.stat-card-value`, plus a `.tabular-nums` utility
- Global `:focus-visible` ring (cyan on dark, brand on light)
- `.btn-gold` aligned to the cyan accent; stale header comment fixed
- Muted text contrast measured and fixed: dark `--text-muted` was 2.7 to 3.4:1 (now 4.8:1 or better),
  light `--text-muted` was 4.3 to 4.5:1 (now 5.3:1 or better)
- No blur or hover lift/shadow on static cards (`.glass-card`, `.glass-card-flat`, `.stat-card`)
- Primary button, chat bubble and dock home button are solid brand with a 1px inner highlight
  (dock keeps its glow because it floats)
- Weights lowered: `.h1`, `.section-label`, `.stat-card-value` from 800 to 700

## Still open

- Inter is loaded twice: `next/font` in `layout.tsx` and a render-blocking `@import` here. Point `--font-sans`
  at `var(--font-inter)` and delete the `@import` (needs a visual check of any element using `--font-sans`).
- `--text-faint` is about 1.6 to 2.0:1 on the dark surfaces. Fine for disabled and decoration only, never for
  readable text.
- Principal home: ranked "Needs your attention" strip and a real week-over-week payments delta were built on
  `design/premium-protocol`. They depend on the principal data layer, which is being rebuilt in
  `feature/principal-analytics`, so port them there instead of merging the old branch.
- Command palette built from the `featureGroups.ts` files.
- A real table component using the `--table-*` tokens (sticky header, tabular numbers, density toggle).
- AI insight as a first-class card with accept/dismiss.

## Definition of done for any screen

- Hero number plus 2 to 3 secondary tiles, never an equal-weight grid
- Loading skeleton, empty state, error state all designed
- Works in light and dark (test light mode explicitly)
- Uses shared classes and real tokens, no hardcoded hex
- Per-school brand color preserved
- 44px touch targets, no hover-only affordances
- `npx tsc --noEmit` clean, full diff read before commit
