# SchoolOS Live Classroom — Phase 4 (General Meetings: PTA, Staff, etc.)

You asked for PTA meetings, staff meetings, and similar — I need to lead with an honest account of what happened, not just the result.

## I built the wrong thing first, then corrected it

I initially built a **new, parallel `school_meetings` table** and a new UI from scratch, without checking whether SchoolOS already had a meetings feature. It did — a complete one, across **six roles** (`online_meetings` table, with `target_audience`, `target_class_id`, `meeting_type`, `meeting_url`; principal creates, teacher/parent/student/bursar/secretary each have their own filtered list page). I only discovered this when a file-creation call collided with an existing file.

I stopped, deleted the parallel system, and rebuilt Phase 4 the right way: **extending the real `online_meetings` table**, the same way Phase 0 extended `online_classes` — additive columns, existing external-link flow untouched, new RLS closing a gap that (like `online_classes` before Phase 0) didn't exist.

**A second, more consequential thing I found while doing this correction:** the existing `PrincipalMeetingsClient.tsx` had a real, pre-existing bug — `target_class_id` was computed at form-submit time but never actually sent to the database, with a comment claiming the column "doesn't exist in DB schema." This meant `specific_class` meetings have never actually been scoped to a class in production — every parent/student query filtering by `target_class_id` was filtering against a column that was always `null`. I fixed this (migration adds the column defensively with `IF NOT EXISTS`, since the comment suggests the live DB may genuinely be missing it; the client now actually sends `target_class_id`). This wasn't something I was asked to fix — it was directly in the path of making the audience-based LiveKit authorization work at all, so leaving it broken would have meant building correct authorization on top of data that could never be correct.

I'm putting this at the top because a report that only described the final state would look like everything went smoothly, and it didn't — the correction is the more important thing to understand about this phase, not a footnote.

## What changed (final, corrected state)

**Migration:** `sql/migrations/2026-09-02-live-classroom-phase4-meetings.sql` — adds `provider`, `livekit_room_name`, `active_egress_id`, `is_live`, `started_at`, `ended_at`, `locked_at` to `online_meetings` (all additive, external-link meetings unaffected); adds `target_class_id` defensively; closes `online_meetings`' missing RLS gap with **audience-aware** policies (not just school-scoped); adds the same room-tamper trigger pattern as Phase 0; extends `class_recordings` with a nullable `online_meeting_id` (mirrors how it already supports `online_class_id`).

**New library code:**
- `meetingAuthorize.ts` — `decideMeetingAccess()`, matched against the **real** audience rules (verified by reading each role's actual existing query, not guessed): `all_parents`→parent, `all_teachers`→teacher, `all_staff`→teacher+principal+bursar+secretary+admin (confirmed from the teacher page's own query — broader than the `is_staff()` helper used elsewhere), `specific_class`→student in that class or parent of a student in that class (via the real `profiles.parent_id` link).
- `livekit.ts` refactored (not rewritten) to share room-naming/token/permission/recording logic between class sessions and meetings via `room: string` primitives — **the existing class-specific functions kept their exact signatures and behavior**; all 39 pre-existing tests passed unchanged after the refactor, confirming nothing regressed.

**New API routes** (`/api/live/meeting/{token,permission,end,recording/start,recording/stop}`) — structurally identical to the class routes, kept separate rather than branching one route on a `kind` field, same reasoning as `meetingAuthorize.ts` being a separate module from `authorize.ts`.

**Webhook extended** (not duplicated) — `/api/live/webhook` now parses both room-name formats (`{school_id}:{class_id}` vs `{school_id}:meeting:{meeting_id}`) and branches `room_started`/`room_finished`/`egress_ended` accordingly. **Known gap, stated plainly:** meeting participants get no `live_session_participants` audit trail and no attendance-style tracking — that table's schema is class-specific (`online_class_id` is a non-nullable FK) and building a parallel one wasn't in scope for this pass.

**UI:** `PrincipalMeetingsClient.tsx`'s create form now has three real modes (In-Person / External Link / Embedded Video) instead of a boolean, since "no `meeting_url`" was never a safe signal for "wants LiveKit" — it's equally true for an in-person meeting. The list card forks on `provider === 'livekit'`, not link presence. Teacher's list gets the matching join-side fork, gated on `is_live` since a participant can't start a meeting themselves.

## Explicitly deferred, not silently skipped

**Parent, student, bursar, secretary UI wiring** — the backend (routes, authorization, RLS) fully supports all of these roles today; only the `MeetingListCard`/equivalent edit + room page (the same ~15-line pattern applied twice above) wasn't done for the remaining four role folders in this pass, given how much ground this phase already covered after the correction. This is genuinely small, mechanical remaining work, not a design gap.

## Tests run and results

- **61/61 vitest tests passing** (17 new for `meetingAuthorize.ts`, covering every audience type and the staff/creator host rule; all 39 pre-existing class tests confirmed unchanged after the `livekit.ts` refactor).
- **10/10 real RLS tests against actual Postgres**, run twice (once during development, once fresh for this report) — including the specific scenario that matters most here: a parent seeing exactly the `all_parents` meeting plus their own child's `specific_class` meeting and nothing else, using the real `profiles.parent_id` link, not a mock.
- Every new/modified backend file — the migration, `meetingAuthorize.ts`, the refactored `livekit.ts`, all five new API routes, the extended webhook, `MeetingRoomClient.tsx` — typechecked clean against the real installed packages under your exact `tsconfig.json`.
- `PrincipalMeetingsClient.tsx` and `TeacherMeetingsClient.tsx` were **not** isolated-typechecked (same limitation as Phase 3 — too many external dependencies to faithfully replicate); verified by direct inspection of variable scope and JSX structure instead.

## What could not be tested

Same standing list as every phase before this: no real LiveKit server, no real R2 bucket. Additionally new to this phase: the audience-based RLS policies were tested against a schema *stub* matching the real columns, not your actual production `online_meetings` table — if that table's real schema has drifted further from `sql/s.sql` than the `target_class_id` and `classes.name` cases already found (both discovered through *application code*, not the schema dump), this migration could hit a similar surprise. Worth running it against a staging copy of the real database before production, not just trusting this test harness.

## Recommended next step

Finish the four remaining roles' UI wiring (small, mechanical) — but honestly, the bigger recommendation is unchanged from the last two phases and now applies to more surface area than ever: this is the point to actually test against a real LiveKit server and a real (or staging) Supabase project, not add a fifth phase of untested code on top of four.
