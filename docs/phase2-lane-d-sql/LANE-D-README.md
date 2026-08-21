# Lane D (ICT) — everything, nothing else

## new/
Copy this folder's contents straight into your repo root — every path
under `new/` is already the real repo-relative path (e.g.
`new/src/app/dashboard/ict/page.tsx` → `src/app/dashboard/ict/page.tsx`).
None of these paths exist in your current repo, so there's nothing to
overwrite or merge here.

## modified-shared-files/
These are NOT new files — they're existing files in your repo that
Lane D added to (never rewrote wholesale). Diff each one against your
current version and merge by hand rather than overwriting, in case
another lane has also touched them since this was built:

- `notify.ts` → `src/lib/notify.ts` — added `notifyAppointmentHolders()`,
  existing `notifyRoles()` and everything else untouched.
- `RoleNav.tsx` → `src/components/RoleNav.tsx` — added one `ict:` entry
  to the `NAV` record, nothing else changed.
- `UniversalAIPage.tsx` → `src/components/UniversalAIPage.tsx` — added
  one `ict:` entry to `ROLE_CONFIG`, nothing else changed.
- `chat-route.ts` → `src/app/api/ai/chat/route.ts` — added an `ict`
  branch to `rolePrompts`, `ROUTE_MAP`, `RATE_LIMIT_PER_ROLE`, and
  `fetchDataContext` (the one with its own `requireIctAccess` check),
  plus two new imports at the top. Every existing role's behavior in
  this file is unchanged.

## Before running any of it
Apply `new/docs/phase2-lane-d-ict/01-ict-schema.sql` to your database
first (via the Supabase SQL editor, as a superuser role — see that
file's own comments on why), then follow
`new/docs/phase2-lane-d-ict/02-cron-setup.md` to register the one
external cron job it needs.

## Not included here
The `principal/settings/route.ts` XSS fix from the earlier security
pass isn't Lane D's work and isn't in this zip — say the word if you
want that one separately too.
