-- docs/lane2-subscription-billing-payment-enforcement/migration.sql
--
-- REQUIRED before deploying this lane's code changes. Unlike the hostel-
-- prefect lane's RLS additions, this is not optional - the webhook insert
-- in payments/paystack-webhook/route.ts now writes platform_fee_ngn and
-- school_amount_ngn on every payment row, and that insert will fail
-- outright if the columns don't exist yet.
--
-- Run the "confirm current state" query first (this codebase's own
-- established convention for every migration so far) since the exact
-- live schema for `payments` and `schools` wasn't available in this
-- bundle - these statements are written to be safe to run against an
-- unknown starting state (IF NOT EXISTS / DO block) rather than assumed
-- blindly.

-- 1. Payment audit trail: capped platform fee breakdown, per §21.
--    Nullable - existing rows and any payment recorded outside the
--    Paystack online-checkout path (bursar manual entry, bank transfer)
--    simply won't have a platform fee, which is correct, not missing data.
alter table public.payments
  add column if not exists platform_fee_ngn  numeric,
  add column if not exists school_amount_ngn numeric;

-- 2. Allow the new 'grace_period' subscription status. Only needed if
--    `schools.setup_status` actually has a CHECK constraint - this
--    codebase's other status-like columns (role, appointment_type) are
--    plain text validated in application code rather than a DB
--    constraint, and no CHECK constraint on setup_status was found
--    anywhere in this bundle either, so this is likely a no-op. Included
--    defensively in case the live schema differs from what's here.
do $$
begin
  if exists (
    select 1 from information_schema.constraint_column_usage
    where table_name = 'schools' and column_name = 'setup_status'
  ) then
    raise notice 'schools.setup_status has a constraint - verify it allows ''grace_period'' before relying on this migration alone.';
  end if;
end $$;
