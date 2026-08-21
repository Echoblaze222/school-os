-- ============================================================
-- Lane 1: Idempotency-key infrastructure for financial/critical
-- operations (payment confirmation, invoice generation, refunds,
-- webhook re-delivery, bulk notification sends).
--
-- Mirrors the existing check_rate_limit pattern (atomic, single
-- Postgres function, service_role only) for the same reason: an
-- in-memory "have I seen this key" set is not safe across Vercel's
-- multiple serverless instances, and a naive
-- "select then insert" from application code has a race window
-- between two concurrent requests with the same key.
--
-- Usage pattern (see src/lib/idempotency.ts):
--   1. Caller generates or receives an idempotency key (client-
--      supplied header for user-initiated actions, or a
--      deterministic key derived from the webhook's event id for
--      webhook handlers).
--   2. Call reserve_idempotency_key(scope, key) BEFORE performing
--      the side effect.
--   3. If it returns 'new', proceed, then call
--      complete_idempotency_key() with the result to cache it.
--   4. If it returns 'in_progress', reject with 409 (a concurrent
--      duplicate is currently being processed).
--   5. If it returns 'completed', return the cached response
--      instead of redoing the side effect.
-- ============================================================

create table if not exists public.idempotency_keys (
  id           bigint generated always as identity primary key,
  scope        text not null,          -- e.g. 'payment_confirm', 'invoice_generate', 'paystack_webhook'
  key          text not null,          -- caller-supplied or event-derived key
  status       text not null default 'in_progress' check (status in ('in_progress', 'completed', 'failed')),
  response     jsonb,                  -- cached response body to replay on duplicate calls
  created_at   timestamptz not null default now(),
  completed_at timestamptz,
  unique (scope, key)
);

create index if not exists idx_idempotency_scope_key
  on public.idempotency_keys (scope, key);

-- Cheap housekeeping — old completed/failed keys don't need to stay
-- forever. Call from the same hourly cron that cleans up rate-limit
-- attempts. Keep in_progress rows regardless of age; a stuck
-- in_progress row is a signal something crashed mid-request and is
-- worth investigating, not silently deleting.
create or replace function public.cleanup_old_idempotency_keys()
returns void
language sql
as $$
  delete from public.idempotency_keys
  where status in ('completed', 'failed')
    and created_at < now() - interval '7 days';
$$;

-- Atomically reserve a key. Returns:
--   'new'          — no prior row existed, one was inserted as in_progress, caller should proceed.
--   'in_progress'  — a call with this key is currently being processed, caller should reject as 409.
--   'completed'    — this exact call already completed, caller should replay the cached response.
--   'failed'       — the prior attempt failed; treated as retryable, so this call resets it to in_progress.
create or replace function public.reserve_idempotency_key(
  p_scope text,
  p_key   text
) returns table (outcome text, cached_response jsonb)
language plpgsql
security definer
as $$
declare
  v_row public.idempotency_keys%rowtype;
begin
  select * into v_row
  from public.idempotency_keys
  where scope = p_scope and key = p_key
  for update;

  if not found then
    insert into public.idempotency_keys (scope, key, status)
    values (p_scope, p_key, 'in_progress');
    return query select 'new'::text, null::jsonb;
  end if;

  if v_row.status = 'completed' then
    return query select 'completed'::text, v_row.response;
  elsif v_row.status = 'in_progress' then
    return query select 'in_progress'::text, null::jsonb;
  else -- 'failed' — allow retry
    update public.idempotency_keys
      set status = 'in_progress', response = null, completed_at = null
      where id = v_row.id;
    return query select 'new'::text, null::jsonb;
  end if;
end;
$$;

-- Mark a reserved key as completed (or failed) and cache the response
-- so duplicate calls can replay it without redoing the side effect.
create or replace function public.complete_idempotency_key(
  p_scope    text,
  p_key      text,
  p_status   text,   -- 'completed' or 'failed'
  p_response jsonb
) returns void
language plpgsql
security definer
as $$
begin
  update public.idempotency_keys
    set status = p_status,
        response = p_response,
        completed_at = now()
    where scope = p_scope and key = p_key;
end;
$$;

revoke all on function public.reserve_idempotency_key(text, text) from public;
revoke all on function public.complete_idempotency_key(text, text, text, jsonb) from public;
grant execute on function public.reserve_idempotency_key(text, text) to service_role;
grant execute on function public.complete_idempotency_key(text, text, text, jsonb) to service_role;
