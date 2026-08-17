-- ============================================================
-- SchoolOS — Phase 1 Foundation
-- Extended identity / appointment / committee / org-hierarchy model
-- + access-code self-service application pipeline
--
-- Design rules followed (per PHASE-1-FOUNDATION.md):
--   - One user, multiple contexts: `profiles` stays the single identity.
--     Appointments are additive rows, never a second account.
--   - Server-side authorization only: nothing here is a client-trusted flag.
--   - Least privilege / no implied access: scope is explicit per row,
--     never inferred from a title string.
--   - Reuse before inventing: extends `profiles` and reuses
--     `portal_audit_log`; does not duplicate either.
-- Not yet run against the live database. Review against the actual
-- Supabase schema (see audit §4 — this repo has no migration history)
-- before applying.
-- ============================================================

-- ---------------------------------------------------------------
-- 1. Role / appointment enum, as config, not a hardcoded route list.
--    Extends the existing 6-value UserRole with the roles the codebase
--    already promises (librarian, nurse, counselor — see audit §2) plus
--    the new appointment-style titles this phase introduces.
--    Base `profiles.role` stays the 6 structural roles unless you want
--    to promote these to first-class roles too — that's the confirm-with-
--    user item the phase doc itself flags for the admin-issued pathway.
-- ---------------------------------------------------------------
create table if not exists public.appointment_types (
  id            text primary key,           -- e.g. 'vice_principal', 'hod', 'counselor'
  label         text not null,               -- display name
  category      text not null,               -- 'academic' | 'welfare' | 'operations' | 'ict' | 'hostel' | 'student_leadership'
  base_role_scope text[] not null default '{}', -- which base profiles.role values may hold this appointment
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

comment on table public.appointment_types is
  'Config-driven appointment titles (VP, HOD, Counselor, Examination Officer, Warden, Coach, ICT Officer, Head Boy/Girl, etc.). New titles are inserted here, never hardcoded into route logic.';

insert into public.appointment_types (id, label, category, base_role_scope) values
  ('vice_principal',       'Vice Principal',        'academic',           array['teacher','principal']),
  ('hod',                  'Head of Department',    'academic',           array['teacher']),
  ('examination_officer',  'Examination Officer',   'academic',           array['teacher']),
  ('counselor',            'Counselor',             'welfare',            array['teacher']),
  ('nurse',                'School Nurse',          'welfare',            array['teacher']),
  ('librarian',            'Librarian',             'operations',         array['teacher']),
  ('ict_officer',          'ICT Officer',           'ict',                array['teacher']),
  ('warden',               'Hostel Warden',         'hostel',             array['teacher']),
  ('coach',                'Sports Coach',          'operations',         array['teacher']),
  ('head_boy',             'Head Boy',              'student_leadership', array['student']),
  ('head_girl',            'Head Girl',             'student_leadership', array['student']),
  ('class_prefect',        'Class Prefect',         'student_leadership', array['student']),
  ('hostel_prefect',       'Hostel Prefect',        'student_leadership', array['student'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------
-- 2. Organizational hierarchy: department, position, reporting line.
--    Data-driven per the phase doc, not hardcoded routes.
-- ---------------------------------------------------------------
create table if not exists public.departments (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now(),
  unique (school_id, name)
);

-- ---------------------------------------------------------------
-- 3. Appointments: the additive "extra context" a profile can hold.
--    A profile keeps exactly one base `role`. This table is where every
--    senior title, committee seat, and scope-limited authority lives —
--    so "one user, multiple contexts" is enforced structurally, not by
--    convention.
-- ---------------------------------------------------------------
create table if not exists public.appointments (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools(id) on delete cascade,
  profile_id        uuid not null references public.profiles(id) on delete cascade,
  appointment_type  text not null references public.appointment_types(id),
  department_id     uuid references public.departments(id) on delete set null,
  reports_to_profile_id uuid references public.profiles(id) on delete set null,

  -- Scope-based authority: explicit, never implied by title.
  -- e.g. {"class_ids": [...]}, {"hostel_ids": [...]}, {"subject_ids": [...]}
  scope             jsonb not null default '{}'::jsonb,

  status            text not null default 'active' check (status in ('active','revoked','expired')),
  assigned_by       uuid references public.profiles(id),
  assigned_at       timestamptz not null default now(),
  revoked_at        timestamptz,
  revoked_by        uuid references public.profiles(id),

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_appointments_profile on public.appointments(profile_id) where status = 'active';
create index if not exists idx_appointments_school   on public.appointments(school_id);
create index if not exists idx_appointments_type      on public.appointments(appointment_type);

comment on column public.appointments.scope is
  'Explicit scope only. An ICT Officer appointment never implies counseling-record access; a Coach appointment never implies academic-results access. Scope keys are read by the permission layer, never inferred from appointment_type alone.';

-- ---------------------------------------------------------------
-- 4. Committees: many-to-many, for bodies that aren't a single reporting
--    line (disciplinary committee, admissions committee, etc.)
-- ---------------------------------------------------------------
create table if not exists public.committees (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  name        text not null,
  description text,
  created_at  timestamptz not null default now()
);

create table if not exists public.committee_members (
  id            uuid primary key default gen_random_uuid(),
  committee_id  uuid not null references public.committees(id) on delete cascade,
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  role_in_committee text not null default 'member', -- 'chair' | 'secretary' | 'member'
  added_at      timestamptz not null default now(),
  unique (committee_id, profile_id)
);

-- ---------------------------------------------------------------
-- 5. Access-code self-service application pipeline (ICT-managed).
--    Load-bearing security decision, restated from the phase doc:
--    submission writes ONLY this row. No auth account, no default_code,
--    exists until ICT clicks Generate Code — at which point the auth user
--    and the code are created atomically from the password_hash already
--    on file. No half-authenticated "ghost account" ever exists.
-- ---------------------------------------------------------------
create table if not exists public.access_code_applications (
  id                  uuid primary key default gen_random_uuid(),
  school_id           uuid not null references public.schools(id) on delete cascade,

  full_name           text not null,
  email               text not null,
  phone               text,

  role_applied_for    text not null references public.appointment_types(id),
  role_specific_fields jsonb not null default '{}'::jsonb,

  -- Hashed immediately on submit. Never store plaintext, ever, at rest or
  -- in logs. bcrypt/argon2 hash produced server-side before this insert.
  password_hash       text not null,

  verification_method text not null default 'remote' check (verification_method in ('remote','in_person')),
  status               text not null default 'pending'
                        check (status in ('pending','under_review','verified','code_generated','rejected')),

  reviewed_by          uuid references public.profiles(id),
  reviewed_at           timestamptz,
  rejection_reason      text,

  -- Set only at the moment Generate Code runs; this is what atomically
  -- links the application to the real account once one exists.
  resulting_profile_id  uuid references public.profiles(id),

  submitted_at          timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists idx_access_apps_school_status
  on public.access_code_applications(school_id, status);

comment on table public.access_code_applications is
  'Self-service application only. Does NOT create an auth.users row or a profiles row at submission. Both are created together, atomically, when an ICT reviewer clicks Generate Code — see application code, not this schema, for that transaction.';

-- ---------------------------------------------------------------
-- 6. RLS — enable, deny by default, and only allow same-school access
--    through the existing profiles.school_id linkage. Mirrors the pattern
--    already documented in SECURITY_RLS_AUDIT_AND_POLICIES.sql; written
--    against a get_my_school_id()/get_my_role() style helper if one
--    already exists live — confirm the actual helper function names
--    against the live database before applying, since this repo has no
--    migration history to check against directly (see audit §4).
-- ---------------------------------------------------------------
alter table public.appointment_types          enable row level security;
alter table public.departments                enable row level security;
alter table public.appointments               enable row level security;
alter table public.committees                 enable row level security;
alter table public.committee_members          enable row level security;
alter table public.access_code_applications   enable row level security;

-- appointment_types: readable by any authenticated user (it's config, not
-- tenant data), writable by nobody through the client (seed/admin only).
create policy appointment_types_read on public.appointment_types
  for select using (auth.role() = 'authenticated');

-- departments / appointments / committees / committee_members: same-school
-- read for any authenticated member of that school; writes restricted to
-- principal/secretary/admin server routes only (service-role key bypasses
-- RLS by design — these policies are the browser-facing floor, not the
-- only check; every write must still be re-verified server-side per the
-- phase doc's "server-side authorization only" rule).
create policy departments_same_school on public.departments
  for select using (
    school_id in (select school_id from public.profiles where id = auth.uid())
  );

create policy appointments_same_school on public.appointments
  for select using (
    school_id in (select school_id from public.profiles where id = auth.uid())
  );

create policy committees_same_school on public.committees
  for select using (
    school_id in (select school_id from public.profiles where id = auth.uid())
  );

create policy committee_members_same_school on public.committee_members
  for select using (
    committee_id in (
      select id from public.committees
      where school_id in (select school_id from public.profiles where id = auth.uid())
    )
  );

-- access_code_applications: applicants never read this table directly
-- (they get a status via a dedicated, rate-limited API route, not raw
-- table access). Only ICT-appointment holders and principal/secretary at
-- the same school may read.
create policy access_apps_ict_review on public.access_code_applications
  for select using (
    school_id in (
      select a.school_id from public.appointments a
      where a.profile_id = auth.uid()
        and a.appointment_type = 'ict_officer'
        and a.status = 'active'
    )
    or
    school_id in (
      select school_id from public.profiles
      where id = auth.uid() and role in ('principal','secretary')
    )
  );
