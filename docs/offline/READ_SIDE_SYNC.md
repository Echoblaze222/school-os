# Offline read-side sync (Phase 4a)

Status: implemented, tested with unit tests, **ships dark**. Not yet verified on a real phone and the
migration has not been applied to the live project.

## What it does
Copies the rows each user may see into IndexedDB (`rows`, `syncState`, Dexie v3) and keeps them current by
pulling only rows changed since the last pull. Screens read the local copy first (`readLocal` /
`readWithRefresh`) so a weak network no longer blocks them.

## Turning it on (order matters)
1. Apply `sql/migrations/2026-11-25-offline-read-sync.sql` (idempotent) to the live Supabase project.
2. Set `NEXT_PUBLIC_OFFLINE_READ_SYNC=1` and redeploy. With the flag off nothing is pulled and the
   attendance screen behaves exactly as before.
3. Test on a real phone: log in online, open the app, go to airplane mode, open Attendance (mark + history).

## Server requirement
- `updated_at` + `set_updated_at()` trigger + `(school_id, updated_at, id)` index on every synced table
- `public.sync_deletions` tombstones (RLS: same school, read-only) filled by an AFTER DELETE trigger
  (skips rows with NULL `school_id`; includes `profiles`; pruned at 90 days when pg_cron exists)

If the migration is missing the pass stops after one request (`schema`) and backs off for 30 minutes.

## Rules
- Offline reads work only for the user already signed in on the phone. RLS still decides what the server returns.
- One user per phone: other users' rows are purged on pull; everything is cleared on sign-out.
- Never synced: payments, billing, counseling, medical, secrets, access codes, AI (`NEVER_SYNC`).
- `profiles`: per-role scope (`profileScope`) and only `PROFILE_COLUMNS` (no email, phone, address, DOB,
  NIN, codes). Every stored row is also scrubbed by `FORBIDDEN_COLUMN`.
- Results/grades are readable offline but NOT writable offline until the Phase 5 compare-and-flag step.
- Cursor is the server's `updated_at` string (never the phone clock, never parsed to a Date).
- Interrupted full pulls resume from their cursor; a phone away longer than 80 days, or whose scope changed,
  does a full re-pull and old rows are removed only after the new pull completes.
- New phones record the newest tombstone id as a baseline instead of downloading all history.
- Windowed tables (attendance, 120 days) drop local rows that fall out of the window.

## Pieces
| File | Role |
| --- | --- |
| `lib/offline/syncTables.ts` | what is synced, which columns, for whom |
| `lib/offline/pullSync.ts` | `pullTable`, `pullAll`, `readLocal`, `readWithRefresh`, `getSyncSummary` |
| `lib/offline/autoSync.ts` | periodic pull (every 5 min at most) after the outbox flush; only with `pullClient` |
| `lib/offline/flags.ts` | `readSyncEnabled()` |
| `lib/offline/storage.ts` | ask the browser not to evict the local copy; storage health |
| `lib/offline/realtimePull.ts` + `hooks/useRealtimePull.ts` | debounced pull on Realtime events |
| `hooks/useSyncStatus.ts` + `components/SyncStatusCard.tsx` | "Offline & sync" status UI |
| `teacher/attendance/AttendanceClient.tsx` | `loadExisting` / `loadHistory` read local first |

## Not wired up yet
- `useRealtimePull` and `SyncStatusCard` exist but are **not mounted** in any layout/page. Mount
  `useRealtimePull({ userId, schoolId, role })` in the dashboard layout and `<SyncStatusCard userId role />` in a
  settings page.
- `loadExpandedDay` in teacher attendance still uses the network (needs `default_code`, never copied).
- Other screens still fetch directly.

## Follow-ups
Tracked as GitHub issues: offline twins per role, server-component pages, avatars in the service worker,
offline writes for notes/assignments/behaviour, results compare-and-flag, chat, tables without `school_id`,
profiles RLS over-exposure.

## Test checklist (real phone)
- First pull on an empty phone; second pull fetches 0 rows.
- Edit a row on the server: only that row arrives.
- Delete a row on the server: it disappears locally after the next pull.
- Kill the network mid-pull: local data still served, next pull resumes from the cursor.
- Sign out, sign in as another user: nothing of the first is readable.
- Mark attendance offline, reconnect: queued change uploads, history shows it after the next pull.
