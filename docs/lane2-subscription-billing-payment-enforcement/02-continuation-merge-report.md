# Lane 2 continuation — merge report

Continuation of the yearly billing / cancellation / billing-snapshots /
anti-gaming work described as in-progress in the previous report. Same
situation as before: this update was built against the *original*
three-separate-webhook design, not my consolidated one, so the webhook
files needed hand-reconciliation again rather than a straight copy.

## What came in clean (no conflicts, copied as-is)

- `lib/billing.ts` — added `computeBillableStudentCount()` (anti-gaming: bills on the higher of live count vs. peak-seen-this-period)
- `lib/subscription.ts` — billing-lock check now also covers the new `cancelled` status
- `lib/subscriptionExpiry.ts` — lapse handling branches to `cancelled` (skipping grace period) when `cancel_at_period_end` was set; also now tracks `peak_active_student_count` on every evaluation run
- `subscription/renew` — now takes a `billingCycle` param (termly/yearly, the only client input that affects price), bills on `computeBillableStudentCount`, pre-logs `billing_cycle` for `activateSubscription` to trust later
- `subscription/callback` (`activateSubscription`) — now sets `cancel_at_period_end: false` on any successful payment, resets the peak-count tracker for the new period, and writes a `subscription_billing_snapshots` row
- `subscription/cancel` (new route) — principal-only toggle for `cancel_at_period_end`, same row both directions ("resume" is just re-toggling before the period ends)
- `SubscriptionGate.tsx`, `SubscriptionClient.tsx`, `subscriptions/page.tsx` — yearly/termly toggle UI, cancellation controls, billing snapshot history display
- `migration-v2.sql` — `subscriptions.cancel_at_period_end`, `schools.peak_active_student_count`, `subscription_payments.billing_cycle`, new `subscription_billing_snapshots` table with RLS (read-only for the owning school, only ever written by the service-role client)

Confirmed via direct diff that `activateSubscription`'s signature I'm
already calling from the canonical webhook (Lane 1/2 merge) didn't
change again — it still takes `{ adminSupabase, school_id, amount_ngn,
reference, principal_id }`, everything else (plan, student count,
billing cycle) is looked up server-side from the pre-logged
`subscription_payments` row. No changes needed to my canonical route's
call site.

## Webhook trio — reconciled again, not overwritten

The incoming `payments/paystack-webhook`, `schools/paystack-webhook`,
and `webhooks/paystack` were each independently updated, still assuming
each is (or could be) *the* configured URL — none of them know about
the single-canonical-route consolidation from the last merge. Diffing
each against what it does confirmed no new business logic beyond one
genuine improvement: the invoice-payment handler now captures the
`paystack_webhook_events` log row's id and updates it with
`processed`/`error_message` afterward, instead of writing it once and
never touching it again. Ported that into the canonical route's
`handleInvoicePayment` path (and its unrecognized-payment/error branches)
— confirmed the `processed`/`error_message` columns actually exist on
that table before using them, rather than assuming.

Everything else in all three incoming webhook files is logic my
canonical route already has (same `activateSchool`/`activateSubscription`
calls, same invoice-payment steps) — nothing else to port. My
`payments/paystack-webhook` and `schools/paystack-webhook` deprecation
stubs are unchanged; the real handlers they used to contain stay folded
into the canonical route only.

## Verification

Full repo `npx tsc --noEmit`: 0 errors, after both this continuation
and the prior five-lane merge.

## Still true, still the top priority

The Paystack dashboard's Webhook URL still needs to be set to
`/api/webhooks/paystack` (Test first, verify, then Live) — nothing in
this continuation changes that. Every payment path described in this
document (registration, fee payment, subscription renewal, and now
cancellation-aware renewal) still depends on that one setting to have
real server-to-server confirmation instead of relying solely on the
browser-redirect callback.
