# SchoolOS - Phase 1 Foundation: Audit

Scope note up front: I was given `PHASE-1-FOUNDATION.md` and the codebase zip,
but not the actual source spec it references (`SCHOOL_OS_ROLE_HOSTEL_ICT_EXPANSION_UPDATE_PROMPT_BRANDED.md`,
sections 1, 2, 3, 24, 25, 68). Everything below is built from what the live
code actually contains plus the phase brief. Where the phase brief implies a
detail only the full spec would confirm (exact appointment titles, exact
permission verbs beyond the nine listed), I've made a reasoned default and
flagged it rather than guessing silently, per your own "flag it, don't
silently resolve it" rule.

## 1. Dead / duplicate files found (flagging, not touching)

`sql/src/` contains a second, older, divergent copy of `src/app`,
`src/components`, and `src/lib` - nested inside the `sql/` folder. It is not
part of the Next.js build (only root `src/` is), but it will confuse anyone
who greps the repo, and it's the exact failure mode your phase doc warns
about: `sql/src/app/dashboard/parent/notifications/NotificationsPageClient.tsx`
differs from the live `src/app/dashboard/parent/notifications/NotificationsPageClient.tsx`.
I left it untouched since deleting isn't part of this lane's mandate, but you
should decide whether to delete or archive it before Phase 2, or someone will
eventually edit the dead copy by mistake.

Also present at repo root: `sql/FIVE-LANE-PROMPTS.md` and `sql/EMOJI-ICON-MAP.md` - leftovers from the earlier emoji/icon pass, sitting in the SQL folder for
no structural reason.

## 2. Roles: enum vs. reality mismatch (real bug, not hypothetical)

`src/lib/supabase/types.ts` declares `UserRole` as exactly six values:
`student | teacher | principal | bursar | secretary | parent`. `ROLE_DASHBOARDS`
is keyed off that same union.

But three live server routes already accept and write roles outside that
union:

- `src/app/api/secretary/create-user/route.ts` - `ROLES_CALLER_CAN_ASSIGN`
  includes `'librarian'` and `'nurse'` for principal/admin.
- `src/app/api/staff-codes/regenerate/route.ts` - same two roles in
  `ALLOWED_TARGET_ROLES`.
- `src/app/dashboard/principal/staff/StaffClient.tsx` and
  `src/app/dashboard/principal/codes/CodesClient.tsx` - same roles in their
  dropdowns, plus `'counselor'` in the staff filter.

Net effect: a principal can already create a profile with `role: 'librarian'`
today. That profile then hits `ROLE_DASHBOARDS['librarian']` in middleware,
which is `undefined` - the redirect logic has no defined destination for
that role. This is a live latent bug, not a Phase-2-later concern, and it's
exactly the gap this phase's "new role/appointment type list" deliverable
needs to close: the enum has to catch up to what the UI and API already
promise.

## 3. Existing identity/permission model (what to reuse)

- `profiles` table: one row per user, `role: UserRole`, `school_id`,
  `onboarding_stage`, `default_code` (access code), `lifecycle_status`. This
  already is the "one user, one identity" table - the right place to extend
  from, not replace.
- Server-side role checks are done ad hoc per-route today (each API route
  independently fetches `caller.role` via the admin client and checks it
  against a local `Record<string, string[]>` allow-list), not through a
  shared permission-checking function. That pattern is secure when done
  right (and `create-user`/`regenerate` do it right: role-escalation guard,
  same-school scoping, service-role writes) but it means there's no single
  place to encode a permission matrix today - every new permission check is
  copy-pasted. The §25 permission matrix this phase produces should become a
  single shared helper (e.g. `lib/permissions.ts`) that all routes call,
  rather than another hand-rolled `Record` per file.
- `portal_audit_log` already exists and is already used for access-code
  regeneration. The new `access_code_applications` flow should log through
  the same table rather than inventing a second audit mechanism.
- Access codes are already generated with `crypto.randomBytes` (8-char
  base36-ish, prefixed by role) - good, keep that generator for the new
  self-service pathway rather than re-deriving randomness.

## 4. RLS / schema-as-code gap

The repo has exactly four `.sql` files outside the dead `sql/src/` tree:
`SECURITY_RLS_AUDIT_AND_POLICIES.sql`, `sql/s.sql`, `migration.sql`,
`trial-subscription-schema.sql`. There is no migrations directory and no
schema-as-code history - the real source of truth for table structure is
the live Supabase project, not this repo. That means `src/lib/supabase/types.ts`
is currently doing double duty as documentation, and it's already been
wrong once (the `nin_number` comment shows a past drift between assumed and
actual columns). I'm treating `types.ts` plus `SECURITY_RLS_AUDIT_AND_POLICIES.sql`
as the best available ground truth, but a live `\d+ profiles` (or Supabase
schema export) would be worth doing before Phase 2 starts building against
tables I'm inferring here.

## 5. Design tokens: mostly already correct, gaps identified

`src/app/globals.css` already has a real dark+light token system pulled from
the actual brand: `--brand:#800020` / `--brand-light` / `--brand-dark`
(matches the logo's burgundy gradient, sampled at roughly `#37000d` - `#4a0012`)
and `--gold:#00B4D8` (matches the logo's teal accent, sampled at `#1c93ac`).
Status colors, spacing, radii, transitions, and z-index scales are already
defined once and shared. This is good, existing work - §68.14 does not need
a rebuild, it needs the missing surfaces filled in.

Confirmed present: background, glass/card, nav, text, input, sidebar (both
themes). Confirmed **missing**: dedicated button tokens (including
hover/active/focus states as tokens, not just class-level CSS), link tokens,
table tokens, modal tokens, chart tokens. I've added these in
`05-design-tokens-additions.css`, derived from the existing `--brand`/`--gold`/
status palette rather than inventing new colors.

## 6. Notification system

`NotificationsPageClient.tsx` exists per-role (parent, secretary, principal,
bursar, teacher, student) - six separate files rather than one shared
component with role-scoped data, confirming your own note that the earlier
lane pass diverged them. Out of scope to unify in this lane (that's a Phase
2+ concern once the new appointment-aware notification targeting exists),
but worth stating plainly: don't add the new appointment/committee
notification routing into six diverging files - that compounds the same
mistake. Flagging for Phase 2/3, not fixing here.

## 7. Mobile nav

No dedicated `BottomNav`/`bottomnav` component file was found by name; bottom
navigation is handled inline via `.bottom-nav-mobile` in `dashboard-layout.tsx`
/ `globals.css` media queries rather than a shared component. Same
implication as above - new nav items for new appointments should extend this
one shared layout file, not get re-implemented per role.
