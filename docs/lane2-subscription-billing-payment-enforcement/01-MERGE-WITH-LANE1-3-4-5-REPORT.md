# Merge report — Lane 2 (subscription/billing) + Lane 5 (mobile push) into Lanes 1/3/4

## What this merge actually was

The Lane 2 zip wasn't a changed-files diff like Lane 4/5 — it was a full
~1,300-file snapshot, and it turned out to be the newer, more complete
base: files I never touched (leadership, hostel roll-call, appointments,
org/eligible-staff) had moved on independently while I was doing Lanes
1/3/4 in this sandbox. So this merge used the Lane 2 snapshot as the new
foundation and layered my work on top, rather than the other way round —
see the file-by-file reasoning below.

## Lane 2 reconciliation — the important part

Both Lane 1 (me) and Lane 2 (a separate pass) independently touched the
Paystack webhook chain. Diffing confirmed most of my Lane 1/3/4 files
were pure supersets of the Lane 2 snapshot (safe to keep as-is:
`notifyUser.ts`, `bursar/generate-invoices`, `receipts/generate`,
`report-card/generate`, `schools/search`, `notifications/send`, the
Lane 4 AI/search files, `layout.tsx`, `globals.css`) — but the webhook
chain itself needed real reconciliation, not a pick-a-side call.

**What Lane 2 built, independently of me:** found that `activateSchool()`
and `activateSubscription()` trusted Paystack's echoed-back
`metadata.school_id` with no check that the reference actually came from
the registration/renewal flow — a parent's ₦100 fee payment carried the
same metadata shape and could activate a school or subscription for
free. Fixed by having each function refuse any reference without its
flow's own server-generated prefix (`SCH-REG-` / `SCOS-`), with the
subscription path additionally cross-checking a pre-logged
`subscription_payments` row for the real expected amount. Also fixed:
wrong pricing tier breakpoints (150/250 instead of spec's 250/500 —
every 151–500-student school was being charged roughly double), an
uncapped 3% platform fee with no ₦10,000 ceiling, and a hard
active→suspended cutoff with no grace period. All genuinely good,
already-verified work (their own report shows a clean `tsc --noEmit`
across the full project) — none of it touched by me.

**What I'd built, independently of them:** the single-canonical-webhook
consolidation from Lane 1, because Paystack only delivers events to one
configured URL per account, and I'd found `api/payments/paystack-webhook`
was unreachable regardless of dashboard config (missing from
`PUBLIC_PATHS` in `middleware.ts`, so an unauthenticated POST — which is
all Paystack ever sends — got redirected to `/login` before the handler
ran).

**The merge:** rebuilt `api/webhooks/paystack/route.ts` to keep my
one-URL structure but call Lane 2's hardened `activateSchool()` /
`activateSubscription()` unchanged, and ported Lane 2's platform-fee
tracking (`platform_fee_ngn`/`school_amount_ngn`) into the invoice-
payment handler. Routing inside the canonical route now branches by
**reference prefix** (`SCH-REG-` / `SCOS-` / else-check-`invoice_id`)
instead of my original metadata-shape check — prefix is what Lane 2's
functions themselves authoritatively check, so routing on the same
signal means this file and those functions can't drift apart about what
counts as which payment type. `api/payments/paystack-webhook` and
`api/schools/paystack-webhook` are deprecation stubs again, same pattern
as Lane 1, with Lane 2's platform-fee logic preserved by moving it into
the canonical route rather than being dropped.

**Still true, restated because it's the important part:** per the
screenshot you showed me during Lane 1, the Paystack dashboard's Live
Webhook URL was empty and the Test Webhook URL pointed at a GET-only
route that 405s on Paystack's POST deliveries. Lane 2's own writeup
describes the webhook routes as "separately configured," which is only
true if that's changed since — I have no way to verify from code alone.
**Until the dashboard's Test/Live Webhook URL is actually set to
`/api/webhooks/paystack`, none of this webhook hardening — old or
new — has ever received a real Paystack event.** This remains the single
highest-priority action item, unchanged from Lane 1.

## Lane 5 — mobile push (Android/FCM)

Clean, additive merge — three files (`webpush.ts`, `push/subscribe`,
`push/send`) extended to dispatch to native Android via FCM alongside
existing Web Push, branching on a new `platform` column, with nothing
removed from the existing logic. `sendPushToUsers()`'s call signature is
unchanged, so nothing that already calls it needed touching. Added
`src/lib/fcm.ts` and the two new SQL docs; merged the one new dependency
(`firebase-admin`) into `package.json` by hand rather than overwriting
the file, since Lane 2's snapshot also modified `package.json` for its
own reasons — a blind overwrite either direction would have dropped one
side's change.

**Found while merging, not part of Lane 5's own work:** `api/push/send`
and `api/internal/push-on-notification` are both server-to-server routes
called by `pg_net` (no session cookie), each gated by its own
`x-internal-secret` header check — but neither was listed in
`middleware.ts`'s `PUBLIC_PATHS`. Same failure mode as the Paystack
webhook bug from Lane 1: middleware redirects any unauthenticated
request to a non-public path to `/login` before the route handler's own
auth check ever runs. This means **the DB-trigger-driven push
notification system, and the new Android reminder-firing function, have
likely never actually delivered a push** — not a Lane 5 defect
specifically, a pre-existing gap Lane 5's new route inherited. Fixed by
adding both paths to `PUBLIC_PATHS`; their own secret checks still gate
real access, so this only lets the request reach the check that was
supposed to run it, not skip auth entirely.

## Verification

- Full repo `npx tsc --noEmit` after each stage (Lane 2 reconciliation
  alone, then with Lane 5 added, then after the middleware fix): 0
  errors every time.
- Confirmed no other file in the repo calls `activateSubscription()` or
  `activateSchool()` with the old (pre-Lane-2) signatures.
- Confirmed `sendPushToUsers()` callers (`cron/unread-digest`,
  `internal/push-on-notification`, `pushNotify.ts`) are all unaffected
  by the internal FCM-branch addition.

## Open items, unchanged or newly found

1. **Paystack dashboard Webhook URL** — still the top action item, see above.
2. **Push trigger has no source-of-truth file in this repo** — true for
   both the general notification-insert trigger (found in Lane 1) and
   now confirmed for the new `fire_pending_reminders` Android function
   too (Lane 5's own comment says the same thing independently).
3. **Anti-gaming on student count at renewal** — Lane 2's own report
   flags this as a real, undecided item (bulk-deactivating students
   right before renewal, reactivating after) — exactly what you said is
   still in progress.
4. Yearly billing checkout UI, cancellation flow, formal billing
   snapshots — as you said, real spec items, correctly not attempted as
   live-bug fixes in either lane.
