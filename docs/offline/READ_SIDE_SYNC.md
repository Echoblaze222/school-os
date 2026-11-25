# Offline read-side sync (Phase 4a)

Status: code added, NOT yet wired into `autoSync`, so nothing calls it at runtime yet.

## What it does
Copies the rows each user may see into IndexedDB (`rows`, `syncState` tables, Dexie v3) and keeps them current by pulling only rows changed since the last pull. Reads come from the local copy first (`readLocal` / `readWithRefresh`) so a weak network no longer blocks a screen.

## Server requirement (migration `schoolos_sync_foundation`)
- `updated_at` + `set_updated_at()` trigger + `(school_id, updated_at, id)` index on every table in `syncTables.ts`
- `public.sync_deletions` tombstones (RLS: same school, read-only) filled by an AFTER DELETE trigger

The client code fails safely (stops with `error`) if the migration is missing, but it will not sync until the migration is applied.

## Rules
- Offline reads work only for the user who was already signed in on the phone. Nothing here creates new access; RLS still decides what is returned.
- One user per phone: other users' rows are purged on pull and everything is cleared on sign-out.
- Never synced: payments, billing, counseling, medical, secrets, access codes, AI (see `NEVER_SYNC`).
- Results/grades are readable offline but NOT writable offline until the Phase 5 compare-and-flag step.
- Cursor is the server's `updated_at` string (never the phone clock, never parsed to a Date).
- A phone away longer than 80 days does a full re-pull; old rows are removed only after the new pull completes.

## Still to do
1. Apply the migration.
2. Call `pullAll(supabase, userId)` from `autoSync` after a successful outbox flush and on app open (keep the existing random delay).
3. Move screens to `readWithRefresh`, starting with classes/students, timetable, announcements, notes.
4. Merge pending outbox items over local rows so a pull cannot briefly show older data over an unsent change.
5. Add tests (see checklist below).

## Test checklist
- First pull on an empty phone; second pull fetches 0 rows.
- Edit a row on the server: only that row arrives.
- Delete a row on the server: it disappears locally after the next pull.
- Kill the network mid-pull: local data still served, next pull resumes from the cursor.
- Two rows with identical `updated_at`: neither skipped nor duplicated at a page boundary.
- Sign out, sign in as another user: nothing of the first is readable.
- Phone away longer than 80 days: full re-pull, no empty screen while it runs.
