-- docs/lane2-subscription-billing-payment-enforcement/migration-v2.sql
--
-- REQUIRED before deploying this batch (yearly billing, cancellation,
-- billing snapshots, anti-gaming peak tracking). Same convention as
-- migration.sql: written defensively (IF NOT EXISTS) since the live
-- schema for `subscriptions`/`schools`/`subscription_payments` wasn't
-- directly inspectable from this bundle. Run alongside, not instead of,
-- migration.sql if that hasn't been applied yet either.

-- 1. Cancellation: a principal can stop auto-renewal without losing
--    access to the period they already paid for. The subscription stays
--    'active' (or 'grace_period') exactly as it would have; only what
--    happens WHEN it lapses changes (see activateSubscription /
--    evaluateSchoolSubscription in the app code - a cancelled-at-period-
--    end subscription goes straight to 'cancelled' on lapse, skipping the
--    grace period, since the school already opted out).
alter table public.subscriptions
  add column if not exists cancel_at_period_end boolean not null default false;

-- 2. Anti-gaming: highest active-student count observed during the
--    current billing period. Reset to the freshly-billed count on every
--    successful activation; updated upward whenever a periodic check
--    (cron or /api/trial/check, both run evaluateSchoolSubscription) sees
--    a higher live count than what's stored.
alter table public.schools
  add column if not exists peak_active_student_count integer;

-- 3. Track which billing cycle a payment attempt was for - needed so
--    activateSubscription can set the correct expiry length (4 months vs
--    12) from the pre-logged row rather than trusting anything echoed
--    back through Paystack metadata.
alter table public.subscription_payments
  add column if not exists billing_cycle text default 'termly';

-- 4. Billing snapshots: a locked, principal-visible record of what a
--    school was billed for a given period, independent of any specific
--    payment attempt or its Paystack reference. subscription_payments
--    logs payment ATTEMPTS (pre-logged before charge, confirmed after);
--    this is the authoritative "what this period cost and why" record,
--    written once at activation and never updated afterward.
create table if not exists public.subscription_billing_snapshots (
  id                      uuid primary key default gen_random_uuid(),
  school_id               uuid not null references public.schools(id) on delete cascade,
  subscription_id         uuid references public.subscriptions(id) on delete set null,
  billing_cycle           text not null,
  live_student_count      integer not null,
  billable_student_count  integer not null,
  rate_per_student        numeric not null,
  tier_label              text not null,
  amount_ngn              numeric not null,
  discount_applied_ngn    numeric not null default 0,
  period_start            date not null,
  period_end              date not null,
  paystack_reference      text,
  created_at              timestamptz not null default now()
);

create index if not exists idx_billing_snapshots_school
  on public.subscription_billing_snapshots(school_id, created_at desc);

alter table public.subscription_billing_snapshots enable row level security;

-- Same-school read (principal/VP viewing their own billing history) -
-- matches the pattern used for appointments/hostels elsewhere in this
-- codebase. No insert/update/delete policy for any authenticated role:
-- only activateSubscription (service-role client) ever writes these, and
-- it never updates a row once written - these are meant to be immutable.
create policy billing_snapshots_same_school on public.subscription_billing_snapshots
  for select using (
    school_id in (select school_id from public.profiles where id = auth.uid())
  );
