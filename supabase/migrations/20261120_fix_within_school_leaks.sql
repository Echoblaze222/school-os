-- Within-school leaks found by impersonating students and parents on the live database (2026-11-20).
-- NOT applied yet. This exact SQL was dry-run inside a transaction that was rolled back, and the
-- results were checked per role (see numbers at the bottom).
--
-- Problem 1: payment_invoices_select_merged contains a bare (school_id = my_school_id()) clause,
--   so every student and parent can read EVERY invoice in their school (Nonchalant: 37 rows,
--   36 belonging to other students).
-- Problem 2: behaviour_records_select_merged ends with a bare
--   (school_id = school of the caller) clause, so every student and parent can read the
--   behaviour records of the whole school.
--
-- Fix: drop the bare school-wide clause. Staff and bursar/principal rules stay. Students see
-- their own rows, parents see their linked children's rows.

begin;

drop policy if exists payment_invoices_select_merged on public.payment_invoices;
create policy payment_invoices_select_merged on public.payment_invoices
  for select to public
  using (
    ((school_id = (select my_school_id())) and (select is_staff()))
    or exists (
      select 1 from profiles
      where profiles.id = (select auth.uid())
        and profiles.school_id = payment_invoices.school_id
        and profiles.role = any (array['bursar', 'principal', 'super_admin'])
    )
    or student_id = (select auth.uid())
    or student_id in (
      select student_id from parent_student_links where parent_id = (select auth.uid())
    )
  );

drop policy if exists behaviour_records_select_merged on public.behaviour_records;
create policy behaviour_records_select_merged on public.behaviour_records
  for select to public
  using (
    (school_id in (
      select profiles.school_id from profiles
      where profiles.id = (select auth.uid())
        and profiles.role = any (array['teacher', 'principal', 'secretary', 'admin'])
    ))
    or ((school_id = (select my_school_id())) and (select is_staff()))
    or student_id = (select auth.uid())
    or student_id in (
      select student_id from parent_student_links where parent_id = (select auth.uid())
    )
  );

commit;

-- Dry-run results with these policies (visible rows / of which own or children):
--   Nonchalant student: invoices 1/1      Kings student: invoices 1/1
--   Kings parent: invoices 4/4, behaviour 1/1
--   Nonchalant bursar and principal: invoices 37 (whole school, unchanged)
--   Kings bursar and principal: invoices 4 (unchanged)
--   Teachers: invoices 0 (before the fix they could read the whole school's invoices;
--   if a teacher page shows fees, it will now be empty)
--
-- Still to review (flagged but not fixed): student_transfers, quiz_attempts, sports_team_members,
-- payment_claims. Students and parents see other students' rows there. Some may be intended
-- (team rosters, leaderboards).
--
-- ROLLBACK: restore the old policies from the pg_policies definitions in git history, or ask Claude.
