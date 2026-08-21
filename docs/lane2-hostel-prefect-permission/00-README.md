# Lane 2 — Hostel Prefect Permission

## What this closes

LANE-E1-README.md and LANE-F-README.md both independently flagged the same
gap: the `hostel_prefect` appointment type exists, the permission matrix
defines its scope precisely (view own assigned hostel; create roll-call
attendance entries only, in that hostel; explicitly never incidents, leave,
or maintenance), and `/api/hostel/roll-call` already enforced that scope
correctly — but there was no UI surface for it. A Hostel Prefect landed on
the generic duties-only Leadership page, identical to every other prefect
type, with no way to actually assist with roll call.

This lane builds the missing surface, on top of the existing (already
correct) API, plus fixes two bugs found while tracing why the feature was
unreachable even at the data layer.

## What shipped

**Student-facing** — `/dashboard/student/hostel-roll-call`
- New page + client component: scoped roll-call view for a Hostel Prefect.
  Same session/status recording flow as the staff version, deliberately
  built as its own component rather than a "staff component with a prop
  to hide things" — no close-session code path exists in this component
  at all, so there's nothing to accidentally leave enabled for a prefect.
- A card on `/dashboard/student/leadership` links here, shown only when
  `appointmentType === 'hostel_prefect'`. Everyone else's Leadership page
  is unchanged.
- Empty-scope state handled explicitly (appointment exists, no hostel
  assigned yet) rather than an error or blank page.

**Principal-facing** — `/dashboard/principal/leadership`
- New "Hostel Prefects" section, same two-step appoint/revoke pattern
  already used for Vice Principal: pick a student, pick which hostel(s)
  they assist with, confirm. Without this, nothing above was reachable —
  there was no way for anyone to actually become a Hostel Prefect with a
  populated scope.

## Two bugs found and fixed

**1. `/api/appointments` silently dropped `hostelIds`.** The POST handler
only ever read `portfolio`/`departmentIds` into `scope` (the VP shape).
Even before any UI existed, appointing someone Hostel Prefect through this
endpoint would always produce `scope.hostel_ids = []` — a permanently
dead appointment. Fixed to parse `hostelIds`, require at least one for a
`hostel_prefect` appointment, and validate every id resolves to a real
hostel at the caller's own school before accepting it (never trusting the
request body's word for what hostels exist, same principle already
applied to `profileId`/`departmentId` in this file).

**2. `/api/org/eligible-staff` had no caller authorization check.** Any
authenticated user — student, parent, any staff role — could call it and
get back a full same-school roster (name, avatar, role, department) for
whatever `appointmentType` they passed. This was documented as
intentional on the theory that it's "no more sensitive than the existing
staff directory," which was true as long as every appointment type's
`baseRoleScope` was staff. `hostel_prefect`'s is `['student']`, which
turns the same endpoint into a full student-roster leak the moment a
picker for it exists — which this lane adds. Gated behind the same
principal-or-VP check `/api/appointments` already uses. No behavior
change for the existing `hod`/`vice_principal` callers, which were always
principal or VP anyway.

## Verified, not changed

- **`appointments` table RLS** (`src/lib/supabase/identity-appointments-schema.sql`):
  confirmed INSERT/UPDATE/DELETE have no policy for ordinary authenticated
  roles — Postgres denies by default, so only the service-role key
  (`assignAppointment`/`revokeAppointment`, both admin-client only) can
  write. `appointments.scope` can't be forged client-side. This is what
  the whole Hostel Prefect scope model depends on, and it holds.
- **`hostels` table RLS**: `hostels_same_school` policy already covers the
  new same-school read this lane's principal page does.
- **`/api/hostel/roll-call`**: not modified. Already re-derives the
  caller's scope from `appointments` server-side on every request and
  double-checks `hostel.school_id` independent of the scope array. This
  lane is purely the UI surface on top of it.

## Optional, not required

`docs/lane2-hostel-prefect-permission/hostel-prefect-rls-additions.sql` —
adds two SELECT policies so a prefect querying `hostel_roll_call_sessions`/
`hostel_roll_call_entries` directly through a browser Supabase client
(not through the API) would see their scoped hostel's roster instead of
only their own row. Nothing in this lane's actual feature needs this —
the route uses the service-role client for every read/write already —
it's pure defense-in-depth in case a future code path queries these
tables client-side. Postgres OR's permissive SELECT policies together,
so applying it can only add read access, never remove any.

## Verification performed

- Full project `npm ci` + `npx tsc --noEmit` — clean, zero errors, across
  the entire ~1300-file project, not just the touched files.
- Manual trace of every new/changed authorization path: student page →
  appointment/scope check → hostel query; principal page → appointment
  write → hostel ownership check; eligible-staff → caller gate.
- Confirmed all three existing callers of `/api/org/eligible-staff`
  (`hod`/`vice_principal` pickers) are already principal-or-VP, so the
  new gate changes nothing for them.

## Explicitly out of scope, flagged rather than built

- **Editing an existing Hostel Prefect's hostel list.** Appoint/revoke
  only, matching the VP section's own pattern (no "edit portfolio" exists
  there either). Revoke-and-reappoint covers it for now.
- **Appointment types other than `hostel_prefect`** (Head Boy, Head Girl,
  Class Prefect, etc.) still have no appointment UI anywhere. Same root
  cause as the bug above — genuinely out of scope for this lane, since
  the zip and the flagged gap were both specific to hostel prefects, not
  student leadership generally.
- **Live database schema was not directly inspected** (no DB credentials
  available here) — RLS conclusions above are drawn from the SQL files
  in this repo, on the same basis every prior lane's security notes in
  this codebase already used. Worth a `pg_policies` check against the
  live database before relying on this for anything beyond what
  `/api/hostel/roll-call`'s own service-role enforcement already covers.
