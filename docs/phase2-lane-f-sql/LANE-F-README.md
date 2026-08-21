# Lane F — Student Leadership, Boarding Student, Context Switcher
## + closing out flagged items from Lane E1 and the security hotfix

Covers §7 (Student Leadership/Prefect), §8 (Headboy/Head Girl linked
dashboard), §15 (Boarding Student Dashboard), §22 (Hostel Prefect
connection to Lane E — reads the same `hostel_prefect` appointment row,
nothing duplicated), §23 (Role Context Switching).

## Apply order

1. Phase 1's schema, then Lane E1's `hostel-schema.sql`, then this lane's
   `sql/leadership-schema.sql`.
2. Copy `new-files/src/*` into your repo at matching paths.
3. Copy `patched-files/src/*` over the matching existing files — these
   are edits, not new files: `StudentDashboardClient.tsx` and
   `TeacherDashboardClient.tsx` now render `<ContextSwitcher />`, and the
   two Lane E1 hostel files below are updated versions (superseding
   what was in the `schoolos-lane-e1-hostel.zip` delivery).
4. Deploy.

## What's real vs. stubbed

- Context switcher, `/api/me/contexts`, Student Leadership dashboard
  (duties: list, complete, escalate to staff), Boarding Student dashboard
  (hostel/block/room/bed, roommates, latest roll-call status) are fully
  wired, not mocked.
- Leave requests on the Boarding dashboard show "being added in the next
  update" rather than a fake or wrong status — that data belongs to Lane
  E2, not built yet.
- The Hostel Prefect appointment type shows up in the context switcher
  and currently routes to the generic Leadership dashboard (duties only,
  same as any other prefect), not a hostel-specific prefect view. §22's
  fuller hostel-prefect experience (whatever scoped hostel data a prefect
  should see beyond duties) wasn't in this lane's four sections — flagging
  rather than guessing at scope Lane E's warden view already owns.

## What this closes from OUTSTANDING-ITEMS.md

- ✅ **"No route to `/dashboard/hostel` exists yet"** — closed. The
  context switcher now appears on the teacher dashboard for anyone
  holding an active hostel-staff appointment, and on the hostel
  dashboard itself so they can switch back.
- ✅ **"Bed assignment UI isn't built"** — closed. Rooms page now has a
  real student picker (search, pick, assign), backed by a new
  `/api/hostel/unassigned-students` endpoint. Same double-booking
  protection as before, this just adds the missing UI in front of it.
- ✅ **`super-admin/create-school` used `Math.random()`** — closed.
  Swapped for `crypto.randomInt`, same code format, nothing downstream
  changes.

## Still open (unchanged from before)

- Dead duplicate `sql/src/` tree — still your call, still untouched.
- Six diverging `NotificationsPageClient.tsx` files, no shared
  `BottomNav` — still deferred, still flagged not to compound by editing
  piecemeal.
- General abuse-rate-limiting on public write routes beyond the two
  account-takeover endpoints — not done.
- Principal/Bursar admin-issued-only exclusion — still never explicitly
  confirmed by you.
- Live database schema was never directly inspected.
- Lane A (VP + Org Hierarchy), Lane B (Counselor), Lane C (Examination
  Team), Lane D (ICT), Lane E2 (leave/incidents/maintenance/parent) — not
  started.

## A note on scope discipline

`/api/me/contexts` is read-only and grants nothing — see the comment at
the top of that file. Every page it links to (leadership, boarding,
hostel) independently re-verifies the caller's appointment server-side.
This matters because §23 explicitly warns that changing the UI context
must never be treated as proof of authorization — worth restating here
since it's the one architectural rule this whole lane is built around.
