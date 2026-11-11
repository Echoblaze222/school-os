-- Schedule the job-queue drain with pg_cron (free; works on the Hobby plan).
--
-- RUN THIS ONLY AFTER the branch that adds POST to
-- /api/cron/process-queue is merged and deployed. Before that deploy the
-- route has no POST handler and every call would just return 405.
--
-- Why: src/lib/queue.ts enqueues large bulk notifications (see
-- /api/notifications/send), but nothing was scheduled to drain job_queue.
-- vercel.json only has 3 daily crons and the route's own comment asks for a
-- per-minute Vercel cron, which the Hobby plan does not allow. As of
-- Nov 11, 2026 job_queue is empty, so no notification has been lost yet.
--
-- This reuses the x-internal-secret that the existing `email-retry` job
-- already sends (the INTERNAL_SECRET env var), reading it from that job so it
-- is not typed or pasted anywhere new.

do $$
declare
  secret text;
begin
  select (regexp_match(command, 'x-internal-secret''\s*,\s*''([^'']+)'''))[1]
    into secret
    from cron.job
   where jobname = 'email-retry';

  if secret is null then
    raise exception 'Could not read the secret from the email-retry cron job';
  end if;

  perform cron.schedule(
    'process-queue',
    '*/2 * * * *',
    format(
      $job$select net.http_post(
        url     := 'https://school-os-j4bn.vercel.app/api/cron/process-queue',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', %L),
        body    := '{}'::jsonb
      );$job$,
      secret
    )
  );
end $$;

-- Verify:
-- select jobname, schedule from cron.job where jobname = 'process-queue';
-- select status_code, created from net._http_response order by created desc limit 5;
--
-- ROLLBACK:
-- select cron.unschedule('process-queue');
--
-- NOTE: the secret sits in plain text inside cron.job.command (also true of
-- email-retry). Anyone with SQL access to the project can read it. Rotate
-- INTERNAL_SECRET (Vercel env var plus both cron jobs) when convenient.
