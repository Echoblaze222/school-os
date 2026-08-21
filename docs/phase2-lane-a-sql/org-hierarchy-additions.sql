-- src/lib/supabase/org-hierarchy-additions.sql
-- Phase 2, Lane A (Vice Principal + Org Hierarchy). Additive only.
--
-- Two nullable columns. Nothing here changes existing query results,
-- existing RLS policies, or existing app behavior until the new Lane A
-- code starts writing to them. Safe to run on a live database.
--
-- Reuses the `departments` and `appointments` tables from
-- identity-appointments-schema.sql (Phase 1) rather than introducing new
-- tables - see §3 "Organizational hierarchy requirements" in the source
-- spec: "Reuse existing structures where safe."
--
-- What this deliberately does NOT add: department objectives, schedules,
-- tasks, reports, or KPI tables, and no department_id on `classes` or a
-- new `subjects` table. Those would touch core academic tables used by
-- every role in the app and aren't required for HOD/department management
-- to work. Left as a follow-up if a future lane needs them.

-- 1. A short department description, shown on the HOD/department
--    management screens. Optional - a department is usable with just a
--    name, same as today.
alter table public.departments
  add column if not exists description text;

-- 2. Which department a teacher belongs to. Nullable: a teacher with no
--    department set is unaffected everywhere else in the app (attendance,
--    results, class assignments, etc. don't read this column). This is
--    what makes "department members" on the VP/HOD screens a real,
--    queryable fact instead of something inferred from an HOD appointment
--    alone.
alter table public.profiles
  add column if not exists department_id uuid references public.departments(id) on delete set null;

create index if not exists idx_profiles_department on public.profiles(department_id) where department_id is not null;

comment on column public.profiles.department_id is
  'Optional. Which department this staff member belongs to. Set via /api/org/assign-department (Principal, or Vice Principal - Edit is unscoped for VP per the §25 permission matrix). Never implies HOD authority by itself - that is a separate `appointments` row with appointment_type = ''hod''.';
