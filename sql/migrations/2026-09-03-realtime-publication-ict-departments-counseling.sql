-- 2026-09-03-realtime-publication-ict-departments-counseling.sql
--
-- Third batch, same root cause as the previous two realtime-publication
-- migrations. Covers the next three items on the priority list:
--
--   - ict_tickets, ict_account_requests: small ICT team working the
--     same queue (TicketsClient, AccountRequestsClient - both needed a
--     new load() added since they previously only hydrated from a
--     server-rendered prop with no client-side refetch path at all).
--   - department_objectives, department_tasks, department_reports,
--     department_schedule_items: department head <-> VP handoffs
--     (report submitted -> VP acknowledges) on DepartmentDetailClient.
--   - counseling_referrals: the teacher/staff -> counselor handoff
--     moment on ReferralsClient. Deliberately NOT touching
--     counseling_cases/notes/sessions/follow_ups in this batch - their
--     RLS scopes every row to exactly one assigned counselor
--     (verified via pg_policies), so there's no second concurrent
--     viewer for realtime to help with; lower priority, still queued.
--
-- Safety: RLS + policies checked via pg_policies for every table before
-- applying, same as the previous two batches - all properly scoped
-- (school-wide staff read for department_*, strictly per-user for
-- ict_*/counseling_referrals). Applied directly via the Supabase
-- migration tool; this file mirrors that in version control.

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'ict_tickets') then
    alter publication supabase_realtime add table public.ict_tickets;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'ict_account_requests') then
    alter publication supabase_realtime add table public.ict_account_requests;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'department_objectives') then
    alter publication supabase_realtime add table public.department_objectives;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'department_tasks') then
    alter publication supabase_realtime add table public.department_tasks;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'department_reports') then
    alter publication supabase_realtime add table public.department_reports;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'department_schedule_items') then
    alter publication supabase_realtime add table public.department_schedule_items;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'counseling_referrals') then
    alter publication supabase_realtime add table public.counseling_referrals;
  end if;
end $$;
