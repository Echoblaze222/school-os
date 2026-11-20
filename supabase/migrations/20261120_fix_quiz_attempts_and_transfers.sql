-- APPLIED to the live project on 2026-11-20 (migration fix_quiz_attempts_and_transfers_leaks).
-- Dry-run verified first, then re-checked per role.
--
-- quiz_attempts_select_merged had a bare (school_id = my_school_id()) clause, so every student
--   and parent could read every quiz attempt (answers and scores) in their school.
-- student_transfers_select_merged let every user at the origin or destination school read all
--   transfers, including outstanding fees, debt notes and rejection reasons.
--
-- Now: students see their own rows, parents their children's, staff (bursar, principal,
--   secretary, admin) their school's, and quiz creators or assigned teachers their quiz attempts.
-- Intentionally left alone: sports_team_members (team rosters visible school-wide) and
--   payment_claims (already limited to the claiming parent and staff).

drop policy if exists quiz_attempts_select_merged on public.quiz_attempts;
create policy quiz_attempts_select_merged on public.quiz_attempts for select to public using (
  ((school_id = (select my_school_id())) and (select is_staff()))
  or student_id = (select auth.uid())
  or student_id in (select student_id from parent_student_links where parent_id = (select auth.uid()))
  or exists (select 1 from quizzes q where q.id = quiz_attempts.quiz_id and (q.created_by = (select auth.uid()) or q.teacher_id = (select auth.uid())))
);

drop policy if exists student_transfers_select_merged on public.student_transfers;
create policy student_transfers_select_merged on public.student_transfers for select to public using (
  student_id = (select auth.uid())
  or student_id in (select student_id from parent_student_links where parent_id = (select auth.uid()))
  or ((origin_school_id = (select my_school_id()) or destination_school_id = (select my_school_id())) and (select is_staff()))
);
