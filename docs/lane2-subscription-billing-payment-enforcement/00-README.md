# Lane 2 — Subscription, Billing & Payment Enforcement Engine

Audited the existing billing/subscription system (source spec §12-25)
before writing anything new, per the spec's own rule. It's substantial and
mostly reasonable — real tables, real webhook idempotency, real server-
side amount calculation. Four concrete, high-impact problems were found
and fixed. What's below is honest about both.

## 1. Critical: subscription/registration payment bypass (fixed)

**The bug.** Four routes activate a school's subscription or registration
purely on "Paystack confirms *some* transaction with this school_id in
its metadata succeeded" — with no check that the transaction actually
came from the subscription or registration flow, and no check that the
amount was sufficient.

`metadata.school_id` is also present on parent school-fee payments (see
`/api/payments/initialize/route.ts`). That means **any real, successful
transaction on the platform — including a parent paying ₦100 in school
fees — carries everything these four routes were checking for.** Taking
that transaction's reference and hitting either callback URL directly
(`/api/subscription/callback?reference=...` or
`/api/schools/payment-callback?reference=...`, both public GETs, no
signature required) activated the subscription/school for whatever tiny
amount that unrelated transaction happened to be. The two POST webhook
variants have the same gap, just gated behind a real Paystack signature
instead of nothing.

**The fix.** Both flows already generate their references server-side
with a fixed, distinct prefix (`SCOS-` for renewal, `SCH-REG-` for
registration) that a parent-fee reference (`SCHOS-`) can never match.
- `activateSubscription()` (`subscription/callback/route.ts`) now refuses
  any reference without the `SCOS-` prefix, then requires a matching row
  in `subscription_payments` keyed by that exact reference — the pre-log
  row `renew/route.ts` already writes before redirecting to Paystack —
  and uses *that* row's amount/plan/student-count as the source of truth
  rather than trusting Paystack's echoed-back metadata. The Paystack-
  confirmed amount must meet or exceed what was expected.
- `activateSchool()` (`lib/activateSchool.ts`) now refuses any reference
  without the `SCH-REG-` prefix.
- Both now return `{ activated, reason? }` instead of assuming success;
  all four call sites (`subscription/callback`, `webhooks/paystack`,
  `schools/paystack-webhook`, `schools/payment-callback`) redirect to a
  failure state or ack-without-activating on refusal, rather than
  silently treating a blocked forgery attempt as success.

Also noted, not touched: `webhooks/paystack/route.ts` and
`subscription/callback/route.ts` are two separately-configured webhook
URLs both driving the same `activateSubscription()` — genuine
duplication, probably worth collapsing to one in a cleanup pass, but not
a correctness issue once both call the hardened function.

## 2. Wrong subscription pricing tiers (fixed)

`renew/route.ts` and `SubscriptionClient.tsx` each had their own copy of
the tier thresholds, and both were wrong: **150 / 250 instead of the
spec's 250 / 500.** Every school with 151–500 active students was being
quoted and charged roughly double the correct rate. The two copies had
also already drifted from each other (different tier-label strings),
which is what duplicated pricing logic does over time.

Fixed by centralizing into `src/lib/billing.ts` — `getSubscriptionTier()`
— with the correct 250/500 breakpoints, imported by both files. Neither
file defines pricing locally anymore.

## 3. Uncapped platform fee on school-fee payments (fixed)

The parent-fee-payment split (`create-subaccount/route.ts`) configures a
flat 3% `percentage_charge` on the school's Paystack subaccount. A flat
percentage has no way to express the spec's ₦10,000 cap — on a ₦500,000
fee payment, 3% is ₦15,000, exceeding it by 50%. There was also no
per-payment audit record of what fee was actually taken; the split
happened silently inside Paystack.

Fixed in `src/lib/billing.ts` (`computePlatformFee`) and wired into
`/api/payments/initialize/route.ts`, which now computes the capped fee
server-side and passes it as an explicit `transaction_charge` on each
transaction — this overrides the subaccount's flat default for that one
payment with the correct capped amount. The breakdown is carried through
Paystack metadata and recorded on the `payments` row by the webhook (new
`platform_fee_ngn` / `school_amount_ngn` columns — **migration required,
see below**).

## 4. Subscription lapse jumped straight to full lockout (fixed)

`subscriptionExpiry.ts` moved a school from `active` directly to
`suspended` — no warning, no grace period — the instant `subscription_ends`
passed. The spec is explicit that expiry should mark the subscription,
give a grace period, warn during it, and *only then* restrict.

Added an intermediate `grace_period` status: on lapse, the school gets
`GRACE_PERIOD_DAYS` (7, in `lib/billing.ts`) of continued full access and
a notification to the principal, and only moves to `suspended` — which is
what actually restricts non-principal roles in `lib/subscription.ts` —
once the grace window closes without renewal too.

## Verified, not changed

- `npm ci` + `npx tsc --noEmit` clean across the full ~1300-file project
  after every change in this lane.
- Confirmed all 4 activation call sites updated consistently to the new
  function signatures (grepped for every remaining caller).
- Confirmed renewing during `grace_period` correctly returns a school to
  `active` — `activateSubscription()` already sets status unconditionally
  on success, so no additional change was needed there.
- The subscription admin view (`SubscriptionClient.tsx`) already showed a
  reasonably transparent tier/rate/total breakdown (§18) — now correct
  automatically, since it imports the same fixed `getSubscriptionTier()`.
  No changes needed there beyond the import.

## Required before deploying this lane

**`docs/lane2-subscription-billing-payment-enforcement/migration.sql`** —
adds `platform_fee_ngn`/`school_amount_ngn` to `payments`. Not optional:
the webhook insert will fail without these columns existing first.

## Explicitly out of scope this pass — real spec items, not built

The full spec (§12-25) is a large surface; this pass prioritized the
security bypass and the two live financial-correctness bugs over
building new capability. Still open:

- **Yearly billing checkout flow.** `computeSubscriptionAmount()` in
  `lib/billing.ts` already implements the 3-term/20%-discount math
  correctly, but nothing in `renew/route.ts` or `SubscriptionClient.tsx`
  offers the choice yet — it's only ever termly today.
- **`cancelled` state / principal-initiated cancellation.** No
  "cancel subscription" flow exists anywhere; only expiry-driven
  transitions do.
- **Formal billing snapshots as their own concept.** `subscription_payments`
  functions as one today (pre-logged at initiate, confirmed at
  activation), but nothing generates a locked, principal-visible snapshot
  independent of a payment attempt.
- **Anti-gaming on student count.** The count is honestly server-derived
  at renewal time (good), but nothing prevents e.g. bulk-deactivating
  students right before a renewal and reactivating after — the spec
  raises this as a case worth a deliberate decision, and none has been
  made yet either way.
- **Persistent grace-period warning banner.** The principal gets a
  notification on entering grace period; there's no always-visible banner
  during the window itself (§16 point 3's "show clear warnings" is
  partially, not fully, met).

Any of these is a reasonable next lane on its own — none of them were
live financial-correctness or security bugs the way the four above were,
which is why they were prioritized first.

---

## Follow-up pass: the four items above, built

All four were implemented. Each is a real, working feature end-to-end
(server calculation → API → DB → UI), not a stub.

### Yearly billing checkout

`computeSubscriptionAmount()` already had the math; it's now actually
reachable. `SubscriptionClient.tsx`'s Renew tab has a termly/yearly
toggle — switching it recalculates the displayed total, discount, and
term coverage live (client-side, informational only). `handleRenew()`
sends the chosen `billingCycle` to `/api/subscription/renew`, which
re-derives the amount server-side from it exactly as before (the cycle
choice is the only client input that affects price, and it's a closed
enum, never a number). `activateSubscription()` reads the cycle back
from the pre-logged `subscription_payments` row — never from Paystack
metadata directly — and sets a 12-month expiry for yearly vs. 4 months
for termly.

Also fixed while touching this: the Renew tab's tier-boundary caption
text was still hardcoded to the old wrong 150/250 thresholds even after
the underlying calculation was corrected earlier in this lane — a second
place the same bug could have kept confusing principals from.

### Cancellation (stop / resume auto-renewal)

`POST /api/subscription/cancel` (principal-only) toggles
`subscriptions.cancel_at_period_end`. Cancelling does **not** cut access
immediately — the school keeps everything until the period they already
paid for ends, exactly as if they hadn't cancelled. What changes is what
happens at that point: `evaluateSchoolSubscription` now checks the flag
at the moment of lapse and sends the school straight to a new `cancelled`
status instead of `grace_period` → `suspended`, since offering a grace
period and "please pay" messaging would be wrong for a school that
explicitly asked to stop. `cancelled` is wired into the same billing-lock
set as `expired`/`suspended` in `checkSubscription()`, and
`SubscriptionGate.tsx` has its own copy for it rather than falling back
to the "Expired" wording. Paying again (a normal renewal) clears the flag
automatically — there's deliberately no separate "reactivate" flow to
build or keep in sync.

### Formal billing snapshots

New `subscription_billing_snapshots` table, written once by
`activateSubscription()` at every successful activation (initial or
renewal) — school, cycle, live count, billable count, rate, tier,
amount, discount, period start/end, reference. Never updated after
creation. This is deliberately separate from `subscription_payments`,
which logs payment *attempts* (pre-logged before charge, confirmed
after) — the snapshot is the "what this period cost and why" record,
independent of whether a particular payment attempt succeeded on the
first try. Surfaced in the Subscriptions page's History tab as a new
"Billing Periods" section above the existing payment list, fetched
server-side in `page.tsx` the same way everything else on that page
already is.

### Anti-gaming on student count

`schools.peak_active_student_count` tracks the highest active-student
count seen since the last successful renewal.
`evaluateSchoolSubscription()` (run by both the cron job and
`/api/trial/check`, so it updates regardless of which one happens to run
for a given school) bumps it upward whenever a live count exceeds it.
`renew/route.ts` bills on `Math.max(liveCount, peakCount)`
(`computeBillableStudentCount()` in `lib/billing.ts`) rather than the
instantaneous count alone, so deactivating students right before
renewal and reactivating them after no longer lowers the bill.
`activateSubscription()` resets the peak to the freshly-billed count on
every successful activation, so tracking starts clean for each new
period rather than accumulating forever.

This is a deliberate design choice, not the only valid one — the
alternative the original note raised (flag suspicious drops for manual
super-admin review instead of auto-billing on peak) is more forgiving of
legitimate reasons for a count to drop (mass withdrawal, a data-entry
correction) but requires someone to actually review the flags. Billing
on peak is fully automatic and closes the gaming vector outright, at the
cost of occasionally billing a school for capacity it briefly had and
no longer does. Worth revisiting if that trade-off turns out wrong in
practice.

## Required before deploying this batch

**`docs/lane2-subscription-billing-payment-enforcement/migration-v2.sql`**
— adds `subscriptions.cancel_at_period_end`, `schools.peak_active_student_count`,
`subscription_payments.billing_cycle`, and the new
`subscription_billing_snapshots` table (with RLS). Not optional: renewal,
activation, and cancellation all write to these columns immediately.
Apply alongside `migration.sql` if that hasn't been run yet either.

## Verified

- `npm ci` + `npx tsc --noEmit` clean across the full project after this
  batch too.
- Traced through both directions of the cancel flow (cancel while
  active → lapse → goes to `cancelled`, not `grace_period`; renew while
  `cancel_at_period_end` is set → flag clears, back to normal) by reading
  the code paths, not assumed.
- Confirmed the page-level billing-snapshots query degrades gracefully
  (empty list, not a crash) if `migration-v2.sql` hasn't been applied yet
  — Supabase's client returns a null/error result for an unknown
  table/column rather than throwing, and the prop already defaults to
  `[]`. The *write* paths (renew, activate, cancel) are not similarly
  tolerant, which is why the migration is required rather than optional.
