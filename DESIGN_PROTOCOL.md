# SchoolOS Premium Design Protocol

Derived from the 2026 SaaS dashboard research (Linear, Vercel, Stripe, Attio, Raycast patterns),
mapped onto SchoolOS's real tokens in `src/app/globals.css`. Read DESIGN_AUDIT.md first for
migration status. This file is the "what good looks like" bar; DESIGN_AUDIT.md tracks adoption.

## Core rule

Expensive means restraint and precision. Fewer colors, weights, borders and shadows. When in doubt, remove.

## Hard rules (do not break)

1. Shadows only on floating UI (bottom dock, menus, modals, toasts). Never on static cards.
2. Hairline 1px borders define structure. Existing `--glass-border` is already correct.
3. Two font weights for most UI (400 and 600). Reserve 700+ for a single hero number per screen.
4. Every number a user compares or scans uses tabular figures (`font-variant-numeric: tabular-nums`).
5. One accent per screen. Brand burgundy leads; cyan `--gold` is a rare secondary.
6. Per-school brand colors flow through `sc` / SchoolBrandInjector. Never hardcode a hue.
   `--status-warn` / `--status-ok` are runtime-injected on purpose. Do not "fix" them (see DESIGN_AUDIT.md).
7. Motion: 100 to 160ms for feedback, 250ms max for entrances, always honor prefers-reduced-motion (already global).
8. Never remove a state: every list/table/card needs loading (skeleton), empty, and error designs.
9. Touch targets 44px minimum on mobile (Capacitor WebView is the primary surface).

## Audit findings against globals.css (prioritized)

P0, zero visual risk, high payoff
- No `font-variant-numeric: tabular-nums` anywhere. Add to `.stat-card-value`, tables, fee amounts,
  GPA, attendance percentages. Numbers stop jittering and look financial-grade.
- No global `:focus-visible` ring. Only `.input:focus` has one. Buttons, nav items and cards have none
  (keyboard and switch-access users see nothing). Add one shared ring using `--brand-glow`.
- Header comment says "Violet x Gold x Deep Space" but real brand is burgundy and `--gold` is cyan.
  `.btn-gold` still uses amber `#D97706` and `rgba(245,158,11,..)`, which does not match cyan `--gold`.
  Fix the comment and align or retire `.btn-gold`.
- Inter is pulled via a render-blocking `@import url(...)` for 9 weights (300 to 900). Switch to
  `next/font` with only the weights used (400, 500, 600, 700). Faster first paint, works offline
  inside the Capacitor shell.

P1, small visual change, review on a Vercel preview first
- `.glass-card:hover` and `.stat-card:hover` lift 2px with a heavy shadow on static cards. Replace with
  a border-color change only. Lift and shadow are for floating or genuinely interactive cards.
- Colored glow shadows on `.btn-primary`, `.nav-home-btn`, `.bubble-user` (`var(--brand-glow)`).
  Glow reads as template. Keep one on the dock home button only; flatten the rest.
- Brand gradients (`linear-gradient(135deg, brand, brand-dark)`) on `.btn-primary`, `.nav-home-btn`,
  `.bubble-user`. Earlier passes already flattened hero gradients; finish the job with solid `--brand`
  plus a 1px inner highlight (`inset 0 1px 0 rgba(255,255,255,0.12)`).
- `backdrop-filter: blur(20px) saturate(160%)` on every `.glass-card`, plus blur on stat cards, header,
  and bottom nav. On Android WebView this is a real scroll-jank cost on mid-range phones.
  Keep blur on 3 surfaces only: bottom dock, sticky header, modals. Cards get a solid layered
  surface (`--bg-surface` or `--bg-elevated`) with the same hairline border.
- Contrast: `--text-muted` (#5A6580) and `--text-faint` (#3A4258) on the dark backgrounds are likely
  below WCAG AA 4.5:1 for body-size text. Measure, then lighten muted to roughly the #7C87A1 range
  and restrict faint to non-essential decoration.
- Heading weights 800/700 in `.h1`/`.h2`, `.stat-card-value` 800. Drop to 600 and rely on size and
  tracking for hierarchy.

P2, structural (new work, one role at a time, start with principal)
- Delta-first stat cards: each hero number shows change vs last term/week with a small up/down mark.
  Research calls this the pattern that drives daily return visits.
- "What needs you" strip at the top of every role home: 1 to 3 ranked actions (unpaid fees over 30 days,
  unmarked attendance, pending admissions). Dashboard decides what matters, not the user.
- Command palette (Cmd/Ctrl+K on desktop, search pill on mobile) over the existing FeatureGroup lists.
  The `featureGroups.ts` files already contain everything needed to index it.
- Tables over charts for dense data (results, fees, attendance). Real table component using the
  existing `--table-*` tokens: sticky header, tabular numbers, row hover, density toggle.
- AI insight as a first-class card (anomaly, risk, suggested action) with an accept/dismiss control,
  not a banner.
- Progressive disclosure: new users see hero stat plus top actions only; secondary tiles unlock
  as the school actually has data. Empty-school state must look intentional, not broken.

## Social and launch assets (separate from the app)

- Record demos with Screen Studio (smooth cursor, auto-zoom). Use a seeded demo school with realistic
  Nigerian names, naira amounts and a believable term, never lorem ipsum or zeros.
- One hero screenshot per role in dark mode, framed in a device mockup, 3 to 5 words of copy max.
- Short vertical clip: open dashboard, command palette jump, fee collected delta animating. Under 20s.

## Definition of done for any screen

- Hero number plus 2 to 3 secondary tiles, never an equal-weight grid
- Loading skeleton, empty state, error state all designed
- Works in light and dark (test light mode explicitly; past bugs came from skipping it)
- Uses shared classes (`.btn`, `.input`, `.glass-card-flat`) and real tokens, no hardcoded hex
- Per-school brand color preserved
- 44px touch targets, no hover-only affordances
- `npx tsc --noEmit -p tsconfig.json` clean, full diff read before commit

## Sources

Research summary compiled 2026-10-26 from SaaS design trend roundups and Linear/Vercel design-token
analyses. Treat exact values as starting points, verify on a Vercel preview.
