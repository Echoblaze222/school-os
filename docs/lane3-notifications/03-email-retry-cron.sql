-- docs/lane3-notifications/03-email-retry-cron.sql
--
-- Schedules api/internal/email-retry to run every 5 minutes via pg_cron
-- + pg_net, calling back into the app the same way the push trigger
-- (02-push-trigger.sql) already does - same pattern, same
-- INTERNAL_SECRET env var, no new secret to manage.
--
-- Applied live on this project (not just documented here - confirmed in
-- the PR this file shipped with). If this project is ever rebuilt from
-- scratch, run this file (with the real secret filled in) to restore
-- the schedule.
--
-- Requires pg_cron and pg_net - both already enabled on this project
-- (pg_net already required by the push trigger).

select cron.schedule(
  'email-retry',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := 'https://school-os-j4bn.vercel.app/api/internal/email-retry',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-internal-secret', 'PASTE_YOUR_INTERNAL_SECRET_HERE'
               ),
    body    := '{}'::jsonb
  );
  $$
);

-- To check the job is registered:
--   select * from cron.job where jobname = 'email-retry';
-- To check recent run history:
--   select * from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'email-retry')
--   order by start_time desc limit 20;
-- To remove it entirely:
--   select cron.unschedule('email-retry');
