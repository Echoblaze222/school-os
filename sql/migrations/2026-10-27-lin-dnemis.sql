-- sql/migrations/2026-10-27-lin-dnemis.sql
--
-- Learner Identification Number (LIN) + D-NEMIS school ID support.
--
-- Context: the Federal Ministry of Education is rolling out a permanent LIN
-- per learner via D-NEMIS, and states (e.g. Ondo) are already requiring
-- every public AND private school to upload learner records, with students
-- lacking a LIN barred from external exams.
--
-- This migration is additive and idempotent: safe to run more than once.
-- Run it in the Supabase SQL editor for the live project BEFORE deploying
-- the /dashboard/principal/dnemis page, otherwise that page shows a
-- "migration not applied" message instead of data.

alter table public.student_profiles
  add column if not exists lin text;

alter table public.schools
  add column if not exists dnemis_school_id text;

-- A LIN is nationally unique, so enforce it globally (ignoring unassigned).
create unique index if not exists student_profiles_lin_unique
  on public.student_profiles (lin)
  where lin is not null;

-- Format guards. The exact LIN layout is not published in a form we can rely
-- on (reports describe it as 16 characters encoding state, LGA, school and a
-- student code), so the check is deliberately lenient: 8-24 letters, digits
-- or hyphens. Tighten once the official spec is confirmed.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'student_profiles_lin_format'
  ) then
    alter table public.student_profiles
      add constraint student_profiles_lin_format
      check (lin is null or lin ~ '^[A-Z0-9-]{8,24}$');
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'schools_dnemis_school_id_format'
  ) then
    alter table public.schools
      add constraint schools_dnemis_school_id_format
      check (dnemis_school_id is null or dnemis_school_id ~ '^[0-9]{10}$');
  end if;
end
$$;

-- No RLS changes: every read/write of these columns goes through
-- /api/principal/dnemis, which verifies the caller (principal/secretary),
-- derives the school from the caller's own profile, and uses the service
-- role scoped to that school.
