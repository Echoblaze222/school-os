-- Cross-school read leak found by impersonating each role against the live database (2026-11-20).
-- NOT applied yet. Review, run in the Supabase SQL editor, then click through the principal pages.
--
-- Problem 1: profiles_select_merged has a clause that lets ANY principal read every other
--   school's principal profiles: (role = 'principal' AND current_role() = 'principal').
--   Verified: principals at Kings College, Nonchalant college and Dr nowhere each see the
--   principal profiles of the other schools.
-- Problem 2: syllabus_topics_select_merged has (... OR current role = 'principal'), which
--   is not scoped to a school, so any principal reads every school's syllabus topics.
--
-- Both fixes only remove the unscoped principal clause. Every other clause is kept as is.

begin;

drop policy if exists profiles_select_merged on public.profiles;
create policy profiles_select_merged on public.profiles
  for select to public
  using (
    id = (select auth.uid())
    or school_id = (select current_school_id())
    or school_id = (select my_school_id())
    or id in (
      select parent_student_links.student_id
      from parent_student_links
      where parent_student_links.parent_id = (select auth.uid())
    )
  );

drop policy if exists syllabus_topics_select_merged on public.syllabus_topics;
create policy syllabus_topics_select_merged on public.syllabus_topics
  for select to public
  using (
    school_id in (
      select p.school_id from profiles p
      where p.id = (select auth.uid())
        and p.role = any (array['teacher'::text, 'principal'::text, 'admin'::text])
    )
    or created_by = (select auth.uid())
    or school_id in (select p.school_id from profiles p where p.id = (select auth.uid()))
    or class_subject_id in (
      select cs.id from class_subjects cs
      where cs.class_id in (
        select sp.class_id from student_profiles sp where sp.id = (select auth.uid())
      )
    )
  );

commit;

-- ROLLBACK (restores the old, leaky policies exactly):
-- drop policy profiles_select_merged on public.profiles;
-- create policy profiles_select_merged on public.profiles for select to public using (
--   ((role = 'principal'::text) and ((select "current_role"()) = 'principal'::text))
--   or ((id = (select auth.uid())) or (school_id = (select current_school_id())))
--   or ((id in (select student_id from parent_student_links where parent_id = (select auth.uid()))) or (id = (select auth.uid())))
--   or ((id = (select auth.uid())) or (school_id = (select my_school_id()))));
-- (syllabus_topics: re-add the clause ((created_by = auth.uid()) or (select role from profiles where id = auth.uid()) = 'principal'))
