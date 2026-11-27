# Phase 3 - offline shell: design and what was built

Status: BUILT on `feature/offline-mode`, NOT yet run on a device. Decision 1 = option B (approved).

## What it does
Open the teacher attendance screen with no network, show what that teacher last saw, let
them mark attendance (queued, uploads later), keep auto-lock, and never show one person's
data to the next person on a shared phone.

## Findings that shaped it
1. Navigation offline always ended at `/offline`: `public/sw.js` never caches per-user pages
   (correct, stays), and dashboard pages get their data from the server.
2. `src/middleware.ts` signs out after 30 minutes with no server request and enforces school
   lock, role, appointment and subscription checks; none of that can run offline.
3. The lock screen needed the network twice (account lookup, password check) and counted a
   lost connection as a wrong password. Fixed.
4. `getSession()` returns nothing offline once the access token (about an hour) has expired,
   so offline pages cannot use it to know who the user is.

## Design (as built)
- **Twin page** `src/app/offline/teacher/attendance/page.tsx`: holds no user data. It lives under
  `/offline/` on purpose: that path is already public in the middleware, so the service worker
  can precache it and NO middleware change was needed.
- **`public/sw.js`**: when opening `/dashboard/teacher/attendance` fails (no network), serve the
  twin instead of `/offline`. Exact-path allowlist `OFFLINE_TWINS`; everything else unchanged.
  The twin is in `STATIC_PRECACHE_URLS` and in `CRITICAL_ROUTES` of the precache script.
- **`OfflineShell`** rebuilds the user's context from the phone: last-known user id
  (`schoolos_last_user`, non-secret UUID) + profile/school saved by `useOfflineReady` while
  online (`savedView`, credentials scrubbed, 7 days, role must match). While locked, nothing of
  the user's data is rendered. Queued changes upload as soon as the connection returns.
- **`useOfflineReady`** (called by `AttendanceClient`): saves the identity and, once per session,
  loads the twin in a hidden frame so the service worker caches every script it needs. This does
  not depend on the build manifest, which may not exist in Next 16.
- **Offline unlock (Decision B), Android app only** (`Capacitor.isNativePlatform()`):
  `unlockVerifier.ts` stores a salted PBKDF2-SHA256 hash (600,000 iterations) per user, created
  at sign-in (`login/page.tsx`) and refreshed at every online unlock. Offline, the lock screen
  checks against it: 5 tries (counter saved before each check), then the verifier is deleted and
  the person is signed out. Browsers always need a connection to unlock.
- **Sign-out** (`signOutFlow`): one capped upload attempt, then deletes the last-known user,
  every unlock verifier and all saved screens.
- `/offline` page links to "Take attendance (works offline)" when this phone has a teacher saved.

## Accepted trade-offs
- **30-minute server timeout (Decision 2):** offline work is not server activity, so the first
  page load after reconnecting may sign the user out. Queued changes are not lost: an open
  page uploads them as soon as the connection returns, otherwise they upload after sign-in.
- **Twin skips server-only checks (Decision 3):** it only shows data this user already loaded,
  and every upload is still checked by RLS. Review per screen as more are added.
- **Verifier weakness:** a short password can be guessed quickly by anyone who can read the
  stored hash. Hence Android app only, where app storage is sandboxed.
- **Stale verifier:** a password changed elsewhere is not known on the phone until the next
  online sign-in or unlock; until then the old password still opens the offline lock screen.
- **Offline sign-out:** `supabase.auth.signOut()` fails with no connection and leaves the local
  session in place. Saved screens, last-known user and verifier are still wiped, and the lock
  flag stays, so an online unlock is required afterwards.

## Must be checked on a real phone
1. Is `Capacitor.isNativePlatform()` true in the APK, which loads the live site via `server.url`?
2. Does the twin open offline on a phone that has only visited the real screen online once
   (warm-up frame worked, service worker caching every script)?
3. Do `RoleSubHeader` and the rest of `AttendanceClient` render with no network without errors?
4. Lock with no network: right password unlocks, 5 wrong signs out; browser build always says
   "No connection".
5. Sign out, then sign in as a different teacher on the same phone: nothing of the first is visible.
6. Reconnect with the twin open: queued attendance uploads without navigating.
