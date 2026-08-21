# Paystack webhook consolidation — what was found and what changed

## What was asked

"Which of the three Paystack webhook routes is live, so I can retire
the other two." That question assumed the three files were competing
copies of the same thing. They weren't quite — and the real state was
worse than duplication.

## What was actually found

1. **The three routes serve different purposes**, distinguishable by
   `event.data.metadata` shape:
   - `api/payments/paystack-webhook` → fee/invoice payments (`metadata.invoice_id`)
   - `api/schools/paystack-webhook` → school registration (`metadata.school_id`, `metadata.plan`, calls `activateSchool`)
   - `api/webhooks/paystack` (old version) → subscription renewal (`metadata.school_id`, `metadata.plan_type`, `metadata.student_count`, calls `activateSubscription`)

   So it wasn't "delete two, keep one" — all three code paths are
   needed. Paystack only calls **one** URL per account though, so all
   three needed to live behind that one URL, branching internally.

2. **Checked the Paystack dashboard (screenshot provided)**: Live
   Webhook URL is empty. Test Webhook URL was set to
   `https://school-os-j4bn.vercel.app/api/schools/payment-callback`.

3. **`schools/payment-callback` only exports `GET`.** It's the
   browser-redirect callback route (`?reference=...` query param, calls
   Paystack's verify-transaction API, redirects to a success/failure
   page). Paystack's webhook deliveries are `POST` with a JSON body and
   an `x-paystack-signature` header. A `POST` to a route that only
   exports `GET` gets an automatic `405` from Next.js — so even in test
   mode, no webhook event has ever been successfully processed.

4. **Checked whether `api/payments/paystack-webhook` would even work if
   correctly configured.** It wouldn't have: it's absent from
   `PUBLIC_PATHS` in `src/middleware.ts`, which redirects any
   unauthenticated request to `/login`. Paystack's server-to-server POST
   carries no session cookie, so it would never have reached the route
   handler even with the right URL in the dashboard.

5. **Net effect**: every payment (registration, invoice, renewal) has
   been confirmed exclusively through the browser-redirect callback
   flows (`schools/payment-callback`, `subscription/callback`,
   presumably an invoice-payment equivalent). Each of those routes'
   comments ("webhook may have fired first") assumed a webhook that
   was never actually running. This isn't a security hole — the
   callback flow does re-verify with Paystack's own API before
   activating anything — but it is a reliability gap: if a user's
   browser doesn't make it back to that redirect (closed tab, lost
   signal, crashed app), the payment can go unconfirmed with nothing
   else watching for it.

## What changed

- **New canonical route**: `src/app/api/webhooks/paystack/route.ts`.
  Verifies the signature once, logs the raw event to
  `paystack_webhook_events` once, then branches by metadata shape into
  three handlers (`handleInvoicePayment`, `handleSubscriptionRenewal`,
  `handleSchoolRegistration`) that reuse the existing, working business
  logic from each of the three original files — nothing about *what*
  happens on a successful payment was rewritten, only *how the event
  gets routed to it* and *how duplicate delivery is guarded against*.
- Duplicate-delivery protection now goes through the Lane 1 idempotency
  helper (`withIdempotency`, scoped per payment type + Paystack
  reference) instead of three separate hand-rolled "does a row with
  this reference exist" checks.
- `api/payments/paystack-webhook` and `api/schools/paystack-webhook`
  are now deprecation stubs: still verify the signature and respond
  `200` so nothing breaks if something is still configured to hit them,
  but log a warning and do nothing else. Not deleted outright — see
  "what's left to do."
- This new route was already listed in `PUBLIC_PATHS` in
  `middleware.ts` before this change (the old version of this same
  file was), so no middleware change was needed for it to be reachable.

## What's left to do — and it's on you, not more code

1. In the Paystack dashboard, set **Test Webhook URL** to
   `https://school-os-j4bn.vercel.app/api/webhooks/paystack` and save.
2. Run one real test payment through each flow — register a test
   school, pay a test invoice, renew a test subscription — and confirm
   each one lands correctly (check `paystack_webhook_events` for the
   logged event, and the corresponding table for the activation/
   payment row).
3. Once confirmed, set the same URL as **Live Webhook URL**.
4. After that's been running cleanly for a while, delete
   `api/payments/paystack-webhook/route.ts` and
   `api/schools/paystack-webhook/route.ts` entirely, and remove
   `/api/schools/paystack-webhook` from `PUBLIC_PATHS` in
   `middleware.ts` (leave `/api/webhooks/paystack` there — the
   canonical route needs it).

I can't do steps 1–3 — they're Paystack dashboard configuration, not
code in this repo.
