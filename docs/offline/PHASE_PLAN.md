# SchoolOS offline mode - plan and protocol

Branch: `feature/offline-mode`. One PR per phase. Nothing merges without its gate.

## Vision
Read from the device, write to an outbox, sync when the backend is healthy.

- **Writes:** `src/lib/offline/outbox.ts` (Dexie/IndexedDB) - allowlisted tables only, idempotent upserts on a natural key.
- **Sync:** `syncEngine.ts` (ordered, single-flight, classified errors) triggered by `autoSync.ts` using the existing `serviceStatus.ts` connectivity signal.
- **Reads:** the existing `src/lib/savedView/store.ts` (user-scoped, one user per phone, wiped on sign-out). Offline-capable screens pass a longer `maxAgeMs` to `loadView`. No second cache.
- Works in the website and in the Android WebView (the APK loads the live site).

## Never offline
Payments, billing, invoices, subscriptions, AI, live class, account or role changes. They need server-side idempotency (`src/lib/idempotency.ts`) and must fail loudly offline.

## Phases and gates
1. **Foundation:** outbox, sync engine, auto-sync, banner, tests. (done on branch)
2. **Pilot: teacher attendance.** (on branch)
   - Classes and students saved on the device for 7 days; a save that fails because the network, backend or session is down is queued; reopening shows queued changes.
   - Sign-out tries one capped upload first (`flushBeforeSignOut`); leftovers stay scoped to that user.
   - Offline wording in `ServiceStatusBanner` updated.
   - Gate: `npm install` (regenerates lockfile), `npm test`, `npm run lint`, `npm run build` green, then the manual matrix below on a real phone.
3. **Offline shell.** Open already-visited pages with no network without breaking the shared-phone rule in `public/sw.js`.
4. **Expand** to notes, clinic logs; grades only with a compare-and-flag conflict step. Attendance History tab offline.
5. **Harden:** review screen for failed items, conflict UI, metrics.

## Manual test matrix (every phase)
Airplane mode; throttled 3G; token expired while offline; two devices editing the same record; two tabs open; sign out with pending items; switch accounts on one phone; storage cleared.

## Known limits
- Last write wins on conflict.
- A page can only open offline if it was opened with a connection first (Phase 3 removes this for visited pages).
- Items still pending at sign-out stay on the phone, scoped to that user, until that user signs in again.
- Failed items show a count only; the review screen is Phase 5.
- Attendance History tab still needs a connection.
