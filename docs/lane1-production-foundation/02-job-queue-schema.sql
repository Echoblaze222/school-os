-- ============================================================
-- Lane 1: Minimal durable job queue for bulk/background work —
-- bulk notification sends, report generation, CSV imports,
-- payment reconciliation sweeps.
--
-- Deliberately NOT Redis/BullMQ: this app has no persistent worker
-- process (Vercel serverless + cron), so the queue has to be
-- durable storage that a cron-triggered "drain" endpoint can poll.
-- Postgres is already the source of truth for everything else here,
-- and job volume at this school count doesn't need a dedicated
-- broker yet — revisit if per-minute job volume grows enough that
-- polling latency (see worker cadence below) becomes a problem.
--
-- Jobs are claimed with `for update skip locked` so multiple
-- concurrent invocations of the worker route (Vercel can run more
-- than one instance) never double-process the same job.
-- ============================================================

create table if not exists public.job_queue (
  id            bigint generated always as identity primary key,
  job_type      text not null,             -- e.g. 'bulk_notification', 'report_generate', 'reconciliation'
  payload       jsonb not null default '{}',
  school_id     uuid,                      -- for tenant-scoped jobs; null for platform-level jobs
  status        text not null default 'pending'
                  check (status in ('pending', 'processing', 'completed', 'failed', 'dead_letter')),
  attempts      int not null default 0,
  max_attempts  int not null default 3,
  run_after     timestamptz not null default now(),  -- supports delayed jobs / backoff
  last_error    text,
  created_at    timestamptz not null default now(),
  started_at    timestamptz,
  completed_at  timestamptz
);

create index if not exists idx_job_queue_pending
  on public.job_queue (status, run_after)
  where status = 'pending';

create index if not exists idx_job_queue_school
  on public.job_queue (school_id, created_at desc);

-- Enqueue a job. Called from route handlers instead of doing the work
-- synchronously inline — e.g. a school-wide announcement inserts one
-- 'bulk_notification' job here instead of looping and sending in the
-- request itself (see SMART-UPGRADE-5-LANES.md Lane 3: "bulk-notification
-- safety").
create or replace function public.enqueue_job(
  p_job_type text,
  p_payload  jsonb,
  p_school_id uuid default null,
  p_run_after timestamptz default now(),
  p_max_attempts int default 3
) returns bigint
language sql
security definer
as $$
  insert into public.job_queue (job_type, payload, school_id, run_after, max_attempts)
  values (p_job_type, p_payload, p_school_id, p_run_after, p_max_attempts)
  returning id;
$$;

-- Atomically claim up to p_limit pending jobs whose run_after has
-- passed, marking them 'processing' so a concurrent worker invocation
-- can't also claim them. Returns the claimed rows for the caller to
-- execute.
create or replace function public.claim_pending_jobs(
  p_job_type text,
  p_limit int default 20
) returns setof public.job_queue
language plpgsql
security definer
as $$
begin
  return query
    update public.job_queue
    set status = 'processing', started_at = now(), attempts = attempts + 1
    where id in (
      select id from public.job_queue
      where job_type = p_job_type
        and status = 'pending'
        and run_after <= now()
      order by run_after
      limit p_limit
      for update skip locked
    )
    returning *;
end;
$$;

create or replace function public.complete_job(p_id bigint) returns void
language sql security definer as $$
  update public.job_queue set status = 'completed', completed_at = now() where id = p_id;
$$;

-- Mark a job failed. If it has attempts remaining, requeue with
-- exponential-ish backoff (2^attempts minutes, capped at 60); once
-- max_attempts is exhausted, move to dead_letter so it stops being
-- retried automatically and shows up for manual review instead of
-- retrying forever.
create or replace function public.fail_job(p_id bigint, p_error text) returns void
language plpgsql security definer as $$
declare
  v_attempts int;
  v_max int;
begin
  select attempts, max_attempts into v_attempts, v_max
  from public.job_queue where id = p_id;

  if v_attempts >= v_max then
    update public.job_queue
      set status = 'dead_letter', last_error = p_error, completed_at = now()
      where id = p_id;
  else
    update public.job_queue
      set status = 'pending',
          last_error = p_error,
          run_after = now() + make_interval(mins => least(2 ^ v_attempts, 60))
      where id = p_id;
  end if;
end;
$$;

revoke all on function public.enqueue_job(text, jsonb, uuid, timestamptz, int) from public;
revoke all on function public.claim_pending_jobs(text, int) from public;
revoke all on function public.complete_job(bigint) from public;
revoke all on function public.fail_job(bigint, text) from public;
grant execute on function public.enqueue_job(text, jsonb, uuid, timestamptz, int) to service_role;
grant execute on function public.claim_pending_jobs(text, int) to service_role;
grant execute on function public.complete_job(bigint) to service_role;
grant execute on function public.fail_job(bigint, text) to service_role;
