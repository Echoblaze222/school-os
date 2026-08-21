# Lane 1 — Production Scaling, Resilience & Observability Foundation
## Status report — 19 Aug 2026

Scope: SMART-UPGRADE-5-LANES.md, Lane 1 (sections 31–55). This lane is
foundational — Lane 2 (payments) and Lane 3 (notifications) build on the
idempotency and queue patterns landed here.

---

## 1. What shipped this pass

| Area | What was built | Files |
|---|---|---|
| Idempotency | Atomic reserve/complete pattern for financial/critical ops, same design as your existing `check_rate_limit` (fails closed — an outage blocks the mutation rather than allowing an unprotected duplicate) | `docs/lane1-production-foundation/01-idempotency-schema.sql`, `src/lib/idempotency.ts` |
| Queue / background jobs | Durable Postgres job queue (`for update skip locked` claiming, exponential backoff, dead-letter after max attempts), a cron-drained worker, and the `bulk_notification` job type wired end to end | `docs/lane1-production-foundation/02-job-queue-schema.sql`, `src/lib/queue.ts`, `src/app/api/cron/process-queue/route.ts` |
| Observability | Structured JSON logger with trace IDs; liveness vs. readiness health checks (readiness pings the DB, liveness doesn't — so a DB blip doesn't get healthy instances restarted) | `src/lib/logger.ts`, `src/app/api/health/live/route.ts`, `src/app/api/health/ready/route.ts` |
| Rate limiting | Extended your existing `checkRateLimit` to 4 endpoints that had none | `schools/search` (IP-keyed, public), `receipts/generate`, `report-card/generate` (both PDF rendering), `bursar/generate-invoices` (bulk financial write) |
| Security review | Hacker-mindset pass — see §3 | — |

Full TypeScript project typecheck (`npx tsc --noEmit`) is clean on the
whole repo, including everything touched this pass.

---

## 2. Rate-limit coverage — before and after

Before this pass, 4 of 98 API routes used `checkRateLimit`: the two
pre-auth code-guessing routes, `apply`, and `examination/results/publish`.
`ai/chat` has its own separate DB-backed limiter (`ai_check_rate_limit`) —
that one's fine as-is, different scope.

Now covered, in addition to the above: `schools/search`,
`receipts/generate`, `report-card/generate`, `bursar/generate-invoices`.

**Not yet covered — flagging, not silently skipping:**
- Most CRUD list/detail endpoints (hostel, ICT, counselor, org) — lower
  priority, these are auth-gated and school-scoped, so the abuse surface
  is "a legitimate staff account hammers their own school's data,"
  not "an anonymous attacker enumerates everything." Worth doing before
  a real launch, not urgent this pass.
- `ai/history` — read-only, low cost, low priority.
- Uploads: `auth/verify-nin` and `ai/chat` accept file-like payloads but
  neither has an explicit size/MIME cap I could find in the route itself
  — that's a §31–55 "file storage: size/MIME limits" item, separate from
  rate limiting, and I didn't touch it this pass. Needs a look before
  this goes to more schools.

---

## 3. Hacker-mindset security review

Went through this the way an attacker would, not just checking boxes.

**No critical findings.** Specifically checked and confirmed clean:
- No hardcoded secrets, API keys, or private key material anywhere in
  `src/`.
- `SUPABASE_SERVICE_ROLE_KEY` is referenced in 24 files, all server-side
  (API routes, `src/lib/supabase/admin.ts`, and one Server Component
  page) — confirmed none of them are `'use client'` files, so the
  service-role key never ships to the browser.
- Every Paystack webhook handler verifies the `x-paystack-signature`
  HMAC-SHA512 header against the raw body before trusting the payload.
- Every `/api/cron/*` route checks `Authorization: Bearer <CRON_SECRET>`
  before doing anything.
- Auth checks consistently use `supabase.auth.getUser()` (server-
  verified) rather than the deprecated, client-side-only `getSession()`
  for anything authorization-relevant — the one earlier `getSession` bug
  your prior audit caught (BUG 7) is confirmed fixed. The remaining
  `getSession()` calls are all in client-side pages using it for UI
  session hints, not for gating access.
- Cross-tenant isolation: spot-checked routes that accept a
  client-supplied resource id (counselor referrals, counseling cases,
  eligible-staff, reports) — every one re-verifies `school_id` server-
  side before acting, rather than trusting the id alone. This is the
  IDOR class of bug and it's consistently guarded against.

**Update, resolved this pass — see `01-webhook-consolidation-followup.md` for the full writeup:**

1. **N+1 query in `bursar/generate-invoices` — fixed.** Replaced the
   per-student × per-fee existence check with one bulk
   `select ... in (...)` up front and an in-memory `Set` for the dedup
   check. Same duplicate-prevention guarantee, no more query count
   scaling with school size.

2. **Paystack webhooks — consolidated, and a bigger issue found
   underneath.** The three-handler duplication turned out to be the
   smaller problem: **none of the three was actually reachable.** The
   Paystack dashboard's Live Webhook URL is empty, the Test Webhook URL
   was pointed at a `GET`-only browser-redirect route (silently 405s on
   Paystack's POST deliveries), and separately
   `api/payments/paystack-webhook` was missing from `PUBLIC_PATHS` in
   `middleware.ts` — so even correctly configured, an unauthenticated
   POST from Paystack would've been redirected to `/login` before
   reaching the handler. Every payment confirmation has been running
   entirely on the browser-redirect callback flows, with no server-to-
   server backstop if a user's browser doesn't make it back after
   paying. Built one canonical webhook at `api/webhooks/paystack`
   (already correctly public in middleware), branching by metadata
   shape to cover all three payment flows and reusing their existing
   business logic. The other two are now deprecation stubs, not
   deleted, pending you repointing the Paystack dashboard. Full detail,
   including the action item that's on you (updating the dashboard
   URL), is in `01-webhook-consolidation-followup.md`.

---

## 4. Production readiness checklist (§55)

Legend: ✅ done · ⚠️ partial / needs attention · ⬜ not started this pass

- ✅ Rate limiting on the sensitive endpoints found this pass (see §2 for what's left)
- ✅ Idempotency-key infrastructure — **now wired into the canonical Paystack webhook**; `payments/confirm-claim` (manual bank-transfer confirmation) still uses its own logic and is a good next candidate
- ✅ Queue/background-job infrastructure — **`bulk_notification` wired; report generation, imports, reconciliation still run synchronously** in their existing routes and haven't been migrated to jobs yet
- ✅ Liveness/readiness health checks
- ✅ Structured logging helper — used throughout the new canonical webhook; not yet swapped in for existing `console.log`/`console.error` calls repo-wide
- ✅ Webhook signature verification — confirmed already correct on all handlers
- ✅ Cron endpoint auth — confirmed already correct
- ✅ Auth pattern (`getUser` vs `getSession`) — confirmed already correct
- ✅ Duplicate webhook handlers — consolidated into one canonical route; see §3 update and the followup doc
- ✅ N+1 in bulk invoice generation — fixed
- ⚠️ **Paystack dashboard Webhook URL — needs your action, not code.** Set to `/api/webhooks/paystack` in both Test and Live, then run one real test payment per flow to confirm.
- ⬜ Database indexes — no schema-wide index audit this pass; needs `EXPLAIN ANALYZE` against a real dataset, not something I can do accurately from static code alone
- ⬜ Connection pooling — depends on your Supabase plan/pooler config (PgBouncer transaction vs. session mode), which lives outside the repo
- ⬜ Caching with tenant isolation — no caching layer exists yet; nothing to isolate until one's built
- ⬜ Multi-tenant isolation testing — RLS policies exist (`SECURITY_RLS_AUDIT_AND_POLICIES.sql`) but I haven't run adversarial cross-tenant test queries against a live DB
- ⬜ Disaster recovery + backup verification — this is a Supabase dashboard/ops task, not code
- ⬜ Business continuity per external dependency (AI, SMS, payment provider) — `ai_check_rate_limit` fails open by design (good), but I haven't audited what happens when Termii (SMS/WhatsApp) or Paystack itself is down mid-request
- ⬜ Deployment safety (staged rollout, rollback plan) — Vercel-config-level, outside this repo pass
- ⬜ Scale testing / failure-injection testing — needs a staging environment, not something to run against production code statically

The ⬜ items are the honest gap list — they're either genuinely
out-of-repo (Supabase/Vercel dashboard config), or need a live database
to do safely and correctly rather than guessing from source alone. I'd
rather tell you that plainly than mark them done.

---

## 5. Suggested next steps, in order

1. **Update the Paystack dashboard Webhook URL** (Test first, then
   Live) to `https://school-os-j4bn.vercel.app/api/webhooks/paystack`
   and run one real payment through each of the three flows to confirm
   end to end. This is the one item only you can do.
2. Wire the idempotency helper into `payments/confirm-claim` (manual
   bank-transfer confirmation) — same double-submission risk, different
   flow.
3. Migrate `report-card` bulk generation and any synchronous
   school-wide notification loop onto the job queue.
4. Once step 1 is confirmed working, delete the two deprecated webhook
   stub files and remove `/api/schools/paystack-webhook` from
   `PUBLIC_PATHS` in `middleware.ts`.
5. Schema-wide index audit — needs a copy of your real query patterns
   or `pg_stat_statements` output from Supabase, not just the source.
