-- src/lib/supabase/department-work-additions.sql
-- Phase 2, Lane A follow-up: department objectives, schedules, tasks,
-- reports (§3's list, deferred at the end of the first Lane A pass
-- because there was no backing table). Additive only, same as
-- org-hierarchy-additions.sql before it.
--
-- Two nullable columns on existing tables, plus four new tables scoped
-- the same way departments/appointments already are: same-school SELECT
-- open to any authenticated staff member, writes only through the
-- service-role client (permission-checked in lib/supabase/departmentWork.ts,
-- never left to RLS alone - matches the existing departments/appointments
-- pattern exactly, see identity-appointments-schema.sql).
--
-- Deliberately NOT built here: a generic "department performance
-- indicators" table. Performance is computed on read, from data that
-- already exists (results -> class_subjects.teacher_id -> profiles with
-- department_id, and results via subjects.department_id) - a stored
-- table would just be a cache of a query that's cheap enough to run live,
-- and would need its own refresh logic to avoid going stale. See
-- lib/supabase/departmentWork.ts getDepartmentPerformance().

-- 1. Which department a subject belongs to (§3: "subjects managed by the
--    department"). Nullable - a subject with no department is unaffected
--    everywhere else results/class_subjects/timetables already use it.
alter table public.subjects
  add column if not exists department_id uuid references public.departments(id) on delete set null;

create index if not exists idx_subjects_department on public.subjects(department_id) where department_id is not null;

-- 2. Department-scoped announcements. Additive alongside the existing
--    `audience`/`target_class_id` columns - an announcement with
--    target_department_id set is understood as "for this department's
--    members" on top of whatever audience filtering already applies.
--    Existing pages that don't set this column are completely unaffected.
alter table public.announcements
  add column if not exists target_department_id uuid references public.departments(id) on delete set null;

create index if not exists idx_announcements_department on public.announcements(target_department_id) where target_department_id is not null;

-- 3. Department objectives
create table if not exists public.department_objectives (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  title         text not null,
  description   text,
  status        text not null default 'not_started' check (status in ('not_started','in_progress','completed')),
  target_date   date,
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_dept_objectives_department on public.department_objectives(department_id);

-- 4. Department tasks. assigned_to is nullable - a task can belong to the
--    department generally (e.g. "submit scheme of work") without a single
--    named owner.
create table if not exists public.department_tasks (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  title         text not null,
  description   text,
  assigned_to   uuid references public.profiles(id) on delete set null,
  status        text not null default 'todo' check (status in ('todo','in_progress','done')),
  due_date      date,
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_dept_tasks_department on public.department_tasks(department_id);
create index if not exists idx_dept_tasks_assignee    on public.department_tasks(assigned_to) where assigned_to is not null;

-- 5. Department reports - the artifact an HOD submits and a Vice
--    Principal/Principal reviews (§3: "department reports", "escalation
--    to senior leadership"). status tracks that escalation explicitly
--    rather than leaving it as an inferred "someone read it eventually."
create table if not exists public.department_reports (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  title         text not null,
  body          text not null,
  period        text,                    -- free text, e.g. "Term 2, 2026" - schools label terms differently
  status        text not null default 'submitted' check (status in ('submitted','acknowledged')),
  submitted_by  uuid references public.profiles(id),
  acknowledged_by uuid references public.profiles(id),
  acknowledged_at timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists idx_dept_reports_department on public.department_reports(department_id);

-- 6. Department schedule - recurring or one-off department meetings/
--    events. Deliberately not wired into the school-wide timetable engine
--    (classes/class_subjects) - that's a teaching-period scheduling
--    system solving a different problem; this is "when does the
--    department meet."
create table if not exists public.department_schedule_items (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  title         text not null,
  day_of_week   int check (day_of_week between 0 and 6),  -- 0=Sunday, for recurring items
  specific_date date,                                       -- for one-off items; one of the two should be set
  start_time    time,
  end_time      time,
  location      text,
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now()
);
create index if not exists idx_dept_schedule_department on public.department_schedule_items(department_id);

-- ── RLS: same-school read, writes locked to service-role only ──────────
-- Identical posture to departments/appointments in
-- identity-appointments-schema.sql - read policy here is the floor
-- (any authenticated same-school staff member can see department work;
-- department_reports additionally excludes students/parents, see its
-- policy below), the actual write permission check lives in
-- lib/supabase/departmentWork.ts, which always uses the service-role
-- client after verifying the caller's appointment server-side.

alter table public.department_objectives     enable row level security;
alter table public.department_tasks          enable row level security;
alter table public.department_reports        enable row level security;
alter table public.department_schedule_items enable row level security;

drop policy if exists "dept_objectives_select_same_school" on public.department_objectives;
create policy "dept_objectives_select_same_school" on public.department_objectives
  for select using (school_id in (select school_id from public.profiles where id = auth.uid()));

drop policy if exists "dept_tasks_select_same_school" on public.department_tasks;
create policy "dept_tasks_select_same_school" on public.department_tasks
  for select using (school_id in (select school_id from public.profiles where id = auth.uid()));

-- department_reports gets one extra restriction the other three don't:
-- staff only. Objectives/tasks/schedule are operational planning info no
-- more sensitive than the department directory itself; a report can carry
-- real commentary about a department's performance or problems, so
-- students/parents are excluded here specifically, not just left to the
-- UI to not show them a page for it.
drop policy if exists "dept_reports_select_same_school" on public.department_reports;
create policy "dept_reports_select_same_school" on public.department_reports
  for select using (
    school_id in (select school_id from public.profiles where id = auth.uid())
    and not exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('student', 'parent')
    )
  );

drop policy if exists "dept_schedule_select_same_school" on public.department_schedule_items;
create policy "dept_schedule_select_same_school" on public.department_schedule_items
  for select using (school_id in (select school_id from public.profiles where id = auth.uid()));

-- No insert/update/delete policy on any of the four tables above, same
-- reasoning as departments/appointments: with RLS enabled and no policy
-- for a command, Postgres denies it outright for ordinary callers, so the
-- service-role client in departmentWork.ts IS the write gate.
--
-- Uses the same inline "school_id in (select ...)" subquery as
-- identity-appointments-schema.sql rather than calling a my_school_id()
-- helper - that file deliberately avoided the helper because it couldn't
-- confirm live which function names actually exist in the database
-- (see its own §6 comment). Matching that choice here rather than
-- introducing a dependency on SECURITY_RLS_AUDIT_AND_POLICIES.sql having
-- been applied first.
