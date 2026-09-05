-- 2026-09-03-realtime-publication-hostel.sql
--
-- Second batch for the same root cause as 2026-09-03-realtime-publication-fix.sql:
-- wires up realtime for the four hostel feature screens (incidents, rooms,
-- maintenance, roll-call), the most shift/multi-staff-driven corner of the
-- app. Client side, these screens now use the new useRealtimeRefresh hook
-- (src/hooks/useRealtimeRefresh.ts) rather than useRealtimeTable, because
-- their data comes from API routes that join in student/room names -
-- useRealtimeTable's raw payload.new would drop those joined fields.
--
-- Safety: RLS is enabled on all six tables with policies scoped through
-- the hostel -> block -> room -> bed chain to the subscriber's own school
-- (via active `appointments`), or to the student themselves for their own
-- assignment/roll-call rows (verified against pg_policies before applying).
-- Applied directly via the Supabase migration tool; this file mirrors that.

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'hostel_incidents') then
    alter publication supabase_realtime add table public.hostel_incidents;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'hostel_maintenance_requests') then
    alter publication supabase_realtime add table public.hostel_maintenance_requests;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'hostel_beds') then
    alter publication supabase_realtime add table public.hostel_beds;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'hostel_bed_assignments') then
    alter publication supabase_realtime add table public.hostel_bed_assignments;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'hostel_roll_call_sessions') then
    alter publication supabase_realtime add table public.hostel_roll_call_sessions;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'hostel_roll_call_entries') then
    alter publication supabase_realtime add table public.hostel_roll_call_entries;
  end if;
end $$;
