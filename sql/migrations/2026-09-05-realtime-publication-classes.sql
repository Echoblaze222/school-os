-- 2026-09-05-realtime-publication-classes.sql
--
-- Fixes a real functional bug, not just missing realtime: the principal
-- classes screen (create class, assign teacher, remove teacher) never
-- showed any of its own changes. Two separate bugs compounded:
--
--   1. localClasses (the state every mutation updated) was never read
--      by the render - the visible list, stats, and "no class teacher"
--      count all read directly from the server-rendered `classes` prop,
--      which never changes without a full page reload. So creating a
--      class or assigning a teacher genuinely succeeded in the database
--      but looked like nothing happened on screen.
--   2. The client's own ad hoc refetch after each mutation queried
--      `class_teachers(...)` as a raw nested array, not the aggregated
--      class_teacher/subject_teachers/teacher_count shape the render
--      actually expects (computed server-side in page.tsx) - so even if
--      localClasses had been wired to the render, those fields would
--      have come back undefined.
--
-- Fixed client-side (PrincipalClassesClient.tsx): the render now reads
-- localClasses throughout, a refetchClasses() helper reproduces the
-- server's exact aggregation, and useRealtimeTable - imported with a
-- comment claiming it kept multiple admins in sync, but never actually
-- called - has been replaced with a real useRealtimeRefresh subscription.
--
-- Safety: RLS confirmed scoped to school_id (classes) and
-- school_id-or-own-teacher-row (class_teachers) before publishing.

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'classes') then
    alter publication supabase_realtime add table public.classes;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'class_teachers') then
    alter publication supabase_realtime add table public.class_teachers;
  end if;
end $$;
