# Lane 3 — Centralized Notification Architecture
## Status report — 19 Aug 2026

Scope: SMART-UPGRADE-5-LANES.md, Lane 3 (sections 56–73).

---

## 1. Audit first — this codebase already has more than expected

Before writing anything, went through what exists. It's substantially
further along than "ad-hoc per-page behavior":

- **Push is already centralized at the database level.** A Postgres
  trigger fires on every `notifications` insert, from anywhere —
  server routes, admin tooling, everywhere — and calls
  `api/internal/push-on-notification`, which calls `sendPushToUsers`
  (`src/lib/webpush.ts`). This is actually a stronger guarantee than
  "every code path remembers to call a notify function": nothing *can*
  skip it, because it's not opt-in, it's a DB-level side effect of the
  insert itself.
- `src/lib/webpush.ts` already handles stale-subscription pruning (410/404
  → delete), per-notification unique tags (with a comment documenting a
  real prior bug: same-tag pushes were collapsing into one slot on
  Android/Chrome instead of stacking), and fails silently when VAPID
  isn't configured rather than throwing.
- `src/lib/notify/notifyUser.ts` already does WhatsApp-then-SMS fallback
  via Termii, with per-channel delivery logging to
  `notification_deliveries` and per-user channel preference checks
  (`notify_whatsapp`/`notify_sms` on `profiles`).
- §69's "generic preview for sensitive categories" rule was **already
  being followed** before this pass — `api/counselor/referrals/route.ts`
  explicitly notifies counselors of a new referral "without putting the
  reason in the notification body," per its own comment.

So this lane's job wasn't "build a notification system," it was "close
the specific gaps in a system that's mostly already right."

---

## 2. Gaps found and fixed this pass

### Bulk-notification safety (§68) — real violation, fixed
`api/notifications/send` ran up to 200 recipients through `notifyUsers`
**sequentially inside the HTTP request** — each recipient costing a DB
insert, a phone lookup, and up to two external Termii calls. That's a
near-certain serverless timeout on a large send, with no batching,
retry, or failed-recipient tracking — the exact pattern §68 warns
against, just capped at 200 instead of "thousands."

Fixed: recipient counts above 15 now enqueue a `bulk_notification` job
via the Lane 1 queue instead of processing inline; the request returns
immediately with a job id. Small sends (a teacher notifying their own
class) stay synchronous — queueing everything would add latency for no
benefit at that size. This reuses the `bulk_notification` handler
already wired into `api/cron/process-queue` from Lane 1, rather than
building a second queue path — same `notifyUser` payload shape either
way. Also added a per-account rate limit (`notifications_send`, 20 per
5 min) on top, independent of the sync/queue split.

### Deduplication (§67) — infra added, not yet applied everywhere
No dedup mechanism existed. §67's own example is exact: "a payment
webhook may be delivered multiple times... must not produce 5 payment
notifications." Added:
- `dedupe_key` column + partial unique index on both `notifications`
  and `notification_deliveries` (nullable — existing callers that don't
  pass one are unaffected).
- `notifyUser()` now accepts an optional `dedupeKey`; if a row with that
  key already exists for the recipient, it returns the existing id
  instead of sending again. Also handles the race where two near-
  simultaneous calls both pass the check before either inserts (unique-
  violation on insert is treated as a successful dedup, not an error).

**Not yet wired into every retryable caller** — the canonical Paystack
webhook from Lane 1 uses its own idempotency layer (which already
prevents the underlying financial operation from double-running); it
doesn't yet pass a `dedupeKey` through to the `notifyUser` calls inside
`handleInvoicePayment`. Worth doing as a quick follow-up so the
notification layer has the same guarantee as the payment layer, not
just relying on the payment layer never re-entering.

### Notification preferences (§64) — category granularity added
Before this pass: only two all-or-nothing booleans
(`notify_whatsapp`, `notify_sms`) existed, with **no push preference
check anywhere** and no way to say "fee reminders yes, promotional
no" — §64's own example. Added a `notification_preferences` table
(per-user, per-category, per-channel) with RLS scoped to the owning
user. `notifyUser()` now checks it before SMS/WhatsApp sends, falling
back to the existing profile-level booleans when no per-category row
exists — so behavior is unchanged for every user who's never touched
their settings. A small set of mandatory categories
(`security_alert`, `account_security`, `subscription_suspended`)
bypass preferences entirely, per §64's "critical notifications may
remain mandatory."

**Push preference is a documented gap, not a fixed one** — see next
section for why.

### Toast system (§57) — new centralized provider added
Before this pass: `src/components/motion/Toast.tsx` exports a local
`useToast()` hook, adopted by 7 files; 19 other files hand-roll their
own toast/alert state independently. Neither has severity variants,
dedup, or action buttons.

Added `src/contexts/ToastContext.tsx`, mounted once at
`src/app/layout.tsx` — a real provider with:
- Five variants (success/error/warning/info/loading) using the
  existing `--success`/`--danger`/`--warning`/`--info`/`--gold` design
  tokens, not new colors.
- `updateToast()` to flip a `loading` toast to `success`/`error` in
  place, rather than showing two separate toasts for one operation
  (§57's "loading → result" pattern).
- Primary + secondary action buttons (Retry/View per §57).
- Dedup window (2s) so a burst of identical events collapses into one
  toast instead of stacking duplicates.
- Max-3 stack cap — §57's "no excessive stacking."
- `aria-live="polite"` region for screen readers, one region for the
  whole stack rather than one per toast.

**Caught and fixed a real bug before it shipped**: the existing
`toast-in`/`toast-out` CSS keyframes assume the animated element
centers *itself* (`left: 50%` + `translate(-50%, ...)`). My new
component centers the *container* and stacks toasts inside it —
applying the old keyframes to each child would have double-applied the
horizontal transform and shifted every toast sideways by half its own
width. Added scoped `toast-item-in`/`toast-item-out` keyframes (vertical
motion only) instead of reusing the old ones incorrectly, and left the
original keyframes untouched since the 7 files still using the old
local hook depend on them as-is.

**Not migrated**: the 7 existing `useToast()` adopters and 19 hand-rolled
callers still work exactly as before — this was additive, not a
forced migration. New code should prefer the new provider; moving the
existing 26 call sites over is optional cleanup, not required for this
to work, and safer to do as its own separate, carefully-diffed pass
per file than bundled in here.

---

## 3. Found, NOT fixed — and why

### Push trigger has no source of truth in this repo
`api/internal/push-on-notification/route.ts`'s own comment references
`lib/supabase/notifications_push_trigger.sql` as the trigger's source —
that file doesn't exist anywhere in this repo. The real trigger was
applied directly to Supabase and isn't reproducible from source. This
is a real infra-as-code gap independent of Lane 3, and it's *why* push
preferences aren't actually enforced yet: the trigger fires
unconditionally on every insert, and I can't safely edit SQL I've
never seen and can't test.

I wrote `docs/lane3-notifications/02-push-trigger-RECONSTRUCTED-please-review.sql`
— a reconstruction of what the trigger must be doing (based on what the
calling route expects), plus the preference-check addition Lane 3
needs, **explicitly marked as needing your review against the actual
live trigger definition before it's applied**. Pulling the real
definition out of Supabase and committing it to the repo first (so
there's something to diff against) is the safer order of operations —
I laid out the exact steps in that file's header.

### 7 near-identical per-role notification page components
`src/app/dashboard/{bursar,counselor,parent,principal,secretary,student,teacher}/notifications/NotificationsPageClient.tsx`
— 4,166 lines total. `secretary`'s and `student`'s versions are
**byte-for-byte identical** (538 lines, zero diff). `bursar` vs
`teacher` differ by 190 of ~570 lines. This is precisely the anti-
pattern §56 opens with: "Do not allow each page or role to invent its
own notification behavior." It predates this lane, not something this
pass introduced.

**Not touched this pass.** Collapsing 7 live, in-production pages (some
handling role-specific filtering, e.g. parent's linked-children scope)
into one shared component safely requires diffing all 7 in full and
confirming behavioral parity for each — that's a substantial, carefully-
scoped piece of work on its own, not something to fold into a session
that's also touching payment-adjacent notification code. Flagging
clearly rather than either skipping silently or rushing a risky
mass-refactor of live UI.

### Not addressed this pass — honest gap list
- Real-time in-app delivery (§59) — whether the notification center UI
  subscribes to Supabase Realtime for live updates without a refresh,
  or relies on the push trigger + a page reload, wasn't verified
  against all 7 duplicated clients individually.
- Offline/reconnect handling (§66) — no service-worker-level offline
  queue/sync verified for notifications specifically (there's a
  general `public/sw.js`, not audited for this).
- Notification observability dashboard (§70) — `notification_deliveries`
  has the raw data (status, provider, error) to build one from, but no
  admin view exists yet.
- Deep link correctness across all `type` values (§65) — spot-checked
  a few (`counseling_referral` → `/dashboard/counselor/referrals`),
  didn't exhaustively verify every notification type points somewhere
  specific rather than a generic dashboard.
- Full §73 testing matrix (multi-device, expired tokens, offline
  device, notification queue overload, etc.) — needs a live environment
  and real devices, not something to verify from source.

---

## 4. Suggested next steps, in order

1. Wire `dedupeKey` through the Paystack webhook's `notifyUser` calls
   (quick — reuse the same `reference`-based key the payment
   idempotency layer already uses).
2. Pull the real push trigger definition from Supabase, commit it to
   this repo, diff against the reconstruction, then apply the
   preference-check addition.
3. Scope the 7-file notification-page consolidation as its own pass —
   diff all 7 in full first, identify genuinely role-specific logic vs.
   copy-paste, then extract a shared component.
4. Build the notification-observability view (queue depth, failure
   rate, invalid-token count) off the existing `notification_deliveries`
   + Lane 1 `job_queue` tables — no new tables needed, just a dashboard.
5. Migrate the 7 existing `useToast()` call sites and 19 hand-rolled
   ones to the new `ToastContext` provider, one file at a time.
