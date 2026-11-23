# Phase 3 - offline shell: findings, design, decisions

Status: DESIGN ONLY. Nothing below is built until the decisions at the end are made.
The one code change that shipped alongside this document is the LockScreen fix (see Finding 3).

## What Phase 3 must achieve
Open an already-used screen with no network, show what that user last saw, let them
work (attendance first), and never show one person's data to the next person on a
shared phone.

## Findings (from the code)
1. **Navigation offline always ends at `/offline`.** `public/sw.js` serves per-user pages
   network-only and deliberately never caches them. That privacy rule is correct and
   stays. Dashboard pages are also server-rendered: `page.tsx` fetches the profile and
   school on the server and passes them to the client component, so there is nothing
   to render offline even if the HTML were cached.
2. **`src/middleware.ts` runs on every request**, signs the user out after 30 minutes
   with no *server* request (`schoolos_last_activity` cookie, httpOnly), and enforces
   school lock, role, appointment and student-subscription checks. None of that can
   run offline.
3. **The lock screen cannot work without a network.** `LockScreen` verifies the
   password with `signInWithPassword`, and looked the account up with `getUser()` (also
   a network call). With no connection, Unlock did nothing, and a lost connection
   would have counted as a wrong password; five of those sign the person out. Auto-lock
   defaults to 10 minutes, so a teacher working offline would be locked out by
   mid-morning. **Fixed in this commit:** identity now comes from the local session,
   and a network failure shows "No connection" without using up an attempt.
   Unlocking with NO connection is still impossible - see Decision 1.
4. **`getSession()` cannot be relied on offline once the access token has expired**
   (about an hour). It tries to refresh, fails, and returns no session. So the offline
   shell must not depend on it to know who the user is.
5. **Existing building blocks to reuse:** `savedView` (user-scoped, wiped on logout),
   the precached `/offline` page mechanism, `serviceStatus`, the outbox from Phases 1-2.

## Proposed design
**Client-only offline twin pages, never cached user HTML.**

- Add `/offline-app/teacher/attendance`: a static page containing no user data. It is
  precached like `/offline` and added to `PUBLIC_PATHS` in the middleware (otherwise
  the precache would store a login redirect).
- `sw.js`: when a navigation fails and the path is on a small allowlist
  (`/dashboard/teacher/attendance` -> `/offline-app/teacher/attendance`), serve the
  precached twin instead of `/offline`. Everything else is unchanged.
- The twin boots in the browser and rebuilds its props locally: the last-known user id
  (a non-secret UUID in localStorage, written when a dashboard loads online, removed
  by `signOutFlow`), and the profile and school saved with `savedView` while online.
  It then renders the same `AttendanceClient`, which already reads saved classes and
  students and queues saves.
- `scripts/generate-sw-precache.js`: include the twin route's JS chunks so it opens on a
  device that has not visited it offline before.
- `/offline` page: list the offline-capable screens when saved data exists for the
  current user.
- The twin enforces auto-lock exactly like the dashboard layout.
- Uploads: the twin mounts the same sync runner, so queued changes upload as soon as
  the connection returns, without needing a navigation.

## Decisions needed
**Decision 1 - how does an offline user unlock the lock screen?** (security owner's call)
- A. No offline unlock. Offline pages stay locked until the phone is online. Safest,
  but a teacher in a no-data school is stuck after the lock timeout.
- B. Offline unlock with a password check kept on the device (salted PBKDF2 verifier in
  IndexedDB, 5 tries, then wiped and online sign-in required), **Android app only**,
  where app storage is sandboxed. Browsers stay on A. Weakness: short passwords can be
  guessed quickly by anyone who can read the stored verifier.
- C. Same as B in browsers too. Not recommended on shared computers.
- Recommendation: B.

**Decision 2 - sign-out after 30 minutes with no server request.** Offline work does not
count as activity, so the first page load after reconnecting may sign the user out.
Queued changes are NOT lost (they stay on the device, scoped to that user, and upload
after sign-in; the open page also uploads them as soon as the connection returns).
Recommendation: accept, no change.

**Decision 3 - the twin skips server-only checks** (school suspended, role changed,
appointment ended). It only shows data this user already loaded legitimately, and every
upload is still checked by RLS. Recommendation: accept for teacher attendance; review per
screen as more are added.

## Build order once decided
3a LockScreen offline fixes (done) -> 3b last-known-user + saved profile/school ->
3c twin page + middleware public path + sw.js allowlist + precache script ->
3d offline unlock per Decision 1 -> 3e tests and the manual matrix on a real phone.
