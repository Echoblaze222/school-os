-- ============================================================
-- Hotfix: rate limiting for pre-auth, code-guessable endpoints
-- (/api/auth/first-login, /api/auth/code-signin)
--
-- Generalized so it can be reused anywhere an unauthenticated endpoint
-- needs throttling, not just auth. Mirrors the existing pattern in
-- ai_check_rate_limit (atomic check-and-increment inside one Postgres
-- function, so it's correct across every serverless instance — an
-- in-memory counter is not, since each Vercel invocation can land on a
-- different instance).
-- ============================================================

create table if not exists public.rate_limit_attempts (
  id          bigint generated always as identity primary key,
  scope       text not null,        -- e.g. 'auth_code', 'auth_ip'
  identifier  text not null,        -- the code guessed, or the caller's IP
  attempted_at timestamptz not null default now()
);

-- Only ever queried by (scope, identifier, attempted_at) — no RLS needed
-- since this table is never touched by client-side queries, only by the
-- function below running as the route's admin client.
create index if not exists idx_rate_limit_scope_identifier_time
  on public.rate_limit_attempts (scope, identifier, attempted_at desc);

-- Cheap cleanup so this table doesn't grow forever. Call this from the
-- existing hourly cron (cron/unread-digest already runs hourly) or as its
-- own scheduled job — not required for correctness, just housekeeping.
create or replace function public.cleanup_old_rate_limit_attempts()
returns void
language sql
as $$
  delete from public.rate_limit_attempts
  where attempted_at < now() - interval '24 hours';
$$;

-- Atomic check-and-increment. Returns true if the caller is still under
-- the limit (and records this attempt), false if they've exceeded it
-- (and does NOT record another attempt, so a locked-out caller can't
-- extend their own lockout by hammering the endpoint).
create or replace function public.check_rate_limit(
  p_scope         text,
  p_identifier    text,
  p_limit         int,
  p_window_seconds int
) returns boolean
language plpgsql
security definer
as $$
declare
  v_count int;
begin
  select count(*) into v_count
  from public.rate_limit_attempts
  where scope = p_scope
    and identifier = p_identifier
    and attempted_at > now() - make_interval(secs => p_window_seconds);

  if v_count >= p_limit then
    return false;
  end if;

  insert into public.rate_limit_attempts (scope, identifier)
  values (p_scope, p_identifier);

  return true;
end;
$$;

revoke all on function public.check_rate_limit(text, text, int, int) from public;
grant execute on function public.check_rate_limit(text, text, int, int) to service_role;
