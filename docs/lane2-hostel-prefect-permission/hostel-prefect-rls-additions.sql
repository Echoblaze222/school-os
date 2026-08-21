-- docs/lane2-hostel-prefect-permission/hostel-prefect-rls-additions.sql
--
-- OPTIONAL, defense-in-depth only. Nothing in this lane's actual feature
-- depends on this file being applied - /api/hostel/roll-call uses
-- createAdminClient() (service role) for every read and write on these
-- tables, and enforces the hostel_prefect scope entirely in application
-- code (see getHostelPrefectScope() usage in that route). That
-- enforcement already works without this file.
--
-- What this adds: e1-hostel-schema.sql's roll_call_sessions_hostel_staff
-- and roll_call_entries_hostel_staff_or_self policies grant SELECT to
-- warden/assistant_warden/house_parent/hostel_administrator and to a
-- student reading their own entry row - they do not mention
-- hostel_prefect. A prefect querying these tables directly through a
-- browser Supabase client (not through the API route above) would today
-- only see their own single entry row, not their hostel's roster, even
-- though the API route already serves them the full roster correctly.
-- These two additional policies close that gap, in case any future code
-- path queries these tables client-side instead of through the route.
--
-- Postgres OR's multiple permissive SELECT policies together, so adding
-- these cannot narrow anyone's existing access - only grant prefects the
-- same scoped read the API already gives them.
--
-- Run the same "list existing policies" query e1/e2's own security notes
-- recommend before applying, to confirm table/policy names still match
-- your live schema:
--   select schemaname, tablename, policyname, cmd
--   from pg_policies
--   where tablename in ('hostel_roll_call_sessions','hostel_roll_call_entries');

create policy roll_call_sessions_hostel_prefect_scoped on public.hostel_roll_call_sessions
  for select using (
    hostel_id in (
      select h.id
      from public.hostels h,
           public.appointments a
      where a.profile_id = auth.uid()
        and a.appointment_type = 'hostel_prefect'
        and a.status = 'active'
        and h.id = any (
          select jsonb_array_elements_text(coalesce(a.scope->'hostel_ids', '[]'::jsonb))::uuid
        )
    )
  );

create policy roll_call_entries_hostel_prefect_scoped on public.hostel_roll_call_entries
  for select using (
    session_id in (
      select rcs.id
      from public.hostel_roll_call_sessions rcs,
           public.appointments a
      where a.profile_id = auth.uid()
        and a.appointment_type = 'hostel_prefect'
        and a.status = 'active'
        and rcs.hostel_id = any (
          select jsonb_array_elements_text(coalesce(a.scope->'hostel_ids', '[]'::jsonb))::uuid
        )
    )
  );
