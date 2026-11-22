# SchoolOS offline mode - plan and protocol

Branch: `feature/offline-mode`. One PR per phase. Nothing merges without its gate.

## Vision
Read from cache, write to an outbox, sync when the backend is healthy.

- **Local DB:** Dexie (IndexedDB). Works in the website and in the Android WebView (the APK loads the live site).
- **Writes:** `src/lib/offline/outbox.ts` - allowlisted tables only, idempotent upserts on a natural key.
- **Sync:** `syncEngine.ts` (ordered, single-flight, classified errors) triggered by `autoSync.ts` using the existing `serviceStatus.ts` connectivity signal.
- **Reads:** `cache.ts` stale-while-revalidate, scoped per user + school.

## Never offline
Payments, billing, invoices, subscriptions, AI, live class, account or role changes. They need server-side idempotency (`src/lib/idempotency.ts`) and must fail loudly offline.

## Phases and gates
1. **Foundation** (this PR): db, outbox, cache, sync engine, auto-sync, banner, tests.
   Gate: `npm install` (regenerates the lockfile), `npm test`, `npm run lint`, `npm run build` all green.
2. **Pilot: teacher attendance.** Queue on failed save; read-through for classes and students.
   Gate before starting: wire `clearCache(userId)` into the sign-out flow and warn when pending items exist; update the offline copy in `ServiceStatusBanner` (it currently says changes cannot be saved).
3. **Offline shell.** Open already-visited pages with no network without breaking the shared-phone rule in `public/sw.js`.
4. **Expand** to notes, clinic logs; grades only with a compare-and-flag conflict step.
5. **Harden:** review screen for failed items, conflict UI, metrics.

## Manual test matrix (every phase)
Airplane mode; throttled 3G; token expired while offline; two devices editing the same record; two tabs open; sign out with pending items; switch accounts on one phone; storage cleared.

## Known limits (Phase 1)
- Last write wins on conflict.
- No screen queues anything yet; the banner stays hidden until Phase 2.
- Failed items have a count only; the review screen is Phase 5.
