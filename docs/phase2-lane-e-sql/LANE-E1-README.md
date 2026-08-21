# Lane E1 — Hostel Dashboard, Room/Bed Management, Roll Call

Covers §13 (Hostel Dashboard), §14 (Room/Bed Management), §17 (Roll Call).
§18-21 (leave, incidents, maintenance, parent connection) are Lane E2 —
not in this package, say the word for it next.

## Dependencies (apply before this)

- Phase 1's `02-identity-appointments-schema.sql` must already be applied
  (this lane's SQL adds hostel-specific appointment types on top of
  Phase 1's `appointment_types` table).
- `src/lib/permissions.ts` is new — Phase 1's audit flagged that no
  shared permission helper existed; this is it, and every future
  appointment-gated lane should use it instead of another one-off
  allow-list.
- `src/lib/supabase/appointments-types.ts` is included here (copied from
  Phase 1's deliverable, extended with the three hostel roles §13 names
  that Phase 1 hadn't seeded yet: Assistant Warden, House Parent, Hostel
  Administrator). If you already applied Phase 1's version of this file,
  merge rather than overwrite — this version is a superset.

## How to apply

1. Run `sql/hostel-schema.sql` against your live database (after Phase
   1's schema).
2. Copy everything under `src/` into your repo at the matching paths.
3. Deploy.

## What's real vs. stubbed in this package

- Dashboard overview, room/bed structure viewing, bed vacating, and full
  roll call (open session, seed roster, record status, close session)
  are fully wired end to end, not mocked.
- **Bed assignment UI is not built yet.** The API (`POST /api/hostel/rooms`
  with `action: 'assign'`) is ready and double-assignment-safe (enforced
  at the database level via a unique index, not just app logic), but
  there's no student-picker UI to call it from yet — the rooms page only
  shows "Vacant" for empty beds rather than a non-functional "Assign"
  button. Flagging rather than shipping a button that does nothing, per
  "no silent failures."
- Incident count and maintenance count on the dashboard read as 0 with a
  `e2Pending` flag, and the UI shows "being built in the next update"
  rather than a wrong or fake number — those tables belong to Lane E2.
- §16 (phone policy) and §13's "visitor activity" line aren't covered in
  E1 — they're lower priority operational config, not core to the
  occupancy/roll-call seam this half of the lane was scoped to.

## How to reach these pages right now

Lane F owns building the real context-switcher UI (§23) since student-side
multi-context switching is the more common case. Until that ships, a
warden/house-parent/assistant-warden's base role is still `teacher` (per
Phase 1's appointment model), so nothing routes them to `/dashboard/hostel`
automatically yet. Add a temporary link — e.g. in `RoleNav.tsx`, show a
"Hostel" entry when the signed-in teacher holds an active hostel
appointment — and remove it once Lane F's switcher lands. Didn't add this
myself since `RoleNav.tsx` is shared across all 6 roles and touching it
crosses into "don't touch another lane's file" without confirming first.

## Flags carried over from the plan

- The Flutter UX/motion PDF doesn't apply to this Next.js/React codebase.
  What's used here is the motion system that already existed
  (`dashboard-motion.module.css`: shimmer, pressable, ripple,
  reduced-motion-aware) — reused, not reinvented, per the anti-vibecoding
  doc's "use restraint."
- `hostel_prefect` appointment type is read from Phase 1's schema exactly
  as defined, for Lane F to consume when it builds the student-side
  Hostel Prefect dashboard — same row, not a second flag.
