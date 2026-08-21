-- ============================================================
-- Lane E1 — Hostel Dashboard (§13), Room/Bed Management (§14),
-- Roll Call (§17)
--
-- Depends on Phase 1's appointment_types / appointments tables
-- (02-identity-appointments-schema.sql). Not yet run against the live
-- database — review against the actual schema before applying.
-- ============================================================

-- ---------------------------------------------------------------
-- 0. Appointment types this lane needs, beyond what Phase 1 seeded.
--    Phase 1 already added 'warden'. Adding the other three hostel
--    staff titles §13 names explicitly.
-- ---------------------------------------------------------------
insert into public.appointment_types (id, label, category, base_role_scope) values
  ('assistant_warden',     'Assistant Warden',      'hostel', array['teacher']),
  ('house_parent',         'House Parent',          'hostel', array['teacher']),
  ('hostel_administrator', 'Hostel Administrator',  'hostel', array['teacher','principal'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------
-- 1. Hostel hierarchy: hostel -> block -> room -> bed (§14)
-- ---------------------------------------------------------------
create table if not exists public.hostels (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  name        text not null,
  gender      text check (gender in ('male','female','mixed')),
  created_at  timestamptz not null default now(),
  unique (school_id, name)
);

create table if not exists public.hostel_blocks (
  id          uuid primary key default gen_random_uuid(),
  hostel_id   uuid not null references public.hostels(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now(),
  unique (hostel_id, name)
);

create table if not exists public.hostel_rooms (
  id           uuid primary key default gen_random_uuid(),
  block_id     uuid not null references public.hostel_blocks(id) on delete cascade,
  name         text not null,                 -- e.g. 'Room 101'
  capacity     int not null check (capacity > 0),
  supervisor_profile_id uuid references public.profiles(id) on delete set null,
  status       text not null default 'active' check (status in ('active','maintenance','closed')),
  created_at   timestamptz not null default now(),
  unique (block_id, name)
);

create table if not exists public.hostel_beds (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references public.hostel_rooms(id) on delete cascade,
  label        text not null,                 -- e.g. 'Bed 1'
  status       text not null default 'available' check (status in ('available','occupied','maintenance')),
  created_at   timestamptz not null default now(),
  unique (room_id, label)
);

-- A student occupies at most one bed at a time. The partial unique index
-- is what actually prevents double assignment (§14's explicit
-- requirement) — enforced at the database level, not just in the API,
-- since a UI-only check is never a security/integrity boundary.
create table if not exists public.hostel_bed_assignments (
  id            uuid primary key default gen_random_uuid(),
  bed_id        uuid not null references public.hostel_beds(id) on delete cascade,
  student_id    uuid not null references public.profiles(id) on delete cascade,
  assigned_by   uuid references public.profiles(id),
  assigned_at   timestamptz not null default now(),
  vacated_at    timestamptz,
  status        text not null default 'active' check (status in ('active','vacated'))
);

-- Only one active assignment per bed, and only one active assignment per
-- student, at a time.
create unique index if not exists idx_one_active_assignment_per_bed
  on public.hostel_bed_assignments (bed_id) where status = 'active';
create unique index if not exists idx_one_active_assignment_per_student
  on public.hostel_bed_assignments (student_id) where status = 'active';

-- ---------------------------------------------------------------
-- 2. Roll call (§17)
-- ---------------------------------------------------------------
create table if not exists public.hostel_roll_call_sessions (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references public.schools(id) on delete cascade,
  hostel_id    uuid not null references public.hostels(id) on delete cascade,
  session_type text not null check (session_type in ('morning','afternoon','evening','night')),
  session_date date not null default current_date,
  opened_by    uuid references public.profiles(id),
  opened_at    timestamptz not null default now(),
  closed_at    timestamptz,
  status       text not null default 'open' check (status in ('open','closed')),
  unique (hostel_id, session_type, session_date)
);

create table if not exists public.hostel_roll_call_entries (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.hostel_roll_call_sessions(id) on delete cascade,
  student_id   uuid not null references public.profiles(id) on delete cascade,
  status       text not null default 'unknown'
               check (status in ('present','absent','excused','on_leave','late','unknown')),
  recorded_by  uuid references public.profiles(id),
  recorded_at  timestamptz not null default now(),
  note         text,
  unique (session_id, student_id)
);

create index if not exists idx_roll_call_entries_session on public.hostel_roll_call_entries(session_id);
create index if not exists idx_roll_call_entries_status_unknown
  on public.hostel_roll_call_entries(session_id) where status in ('unknown','absent');

comment on table public.hostel_roll_call_entries is
  'A student "expected in hostel but not accounted for" (§17) is any row still unknown/absent once the session is closed — the dashboard summary reads exactly that condition, no separate flag needed.';

-- ---------------------------------------------------------------
-- 3. RLS — same-school scoping, hostel-staff-only writes
-- ---------------------------------------------------------------
alter table public.hostels                    enable row level security;
alter table public.hostel_blocks              enable row level security;
alter table public.hostel_rooms               enable row level security;
alter table public.hostel_beds                enable row level security;
alter table public.hostel_bed_assignments     enable row level security;
alter table public.hostel_roll_call_sessions  enable row level security;
alter table public.hostel_roll_call_entries   enable row level security;

-- Read: same-school authenticated users can see the hostel structure
-- (names/capacity, not sensitive) — matches §17's "don't expose sensitive
-- location info to unauthorized users" by keeping roll-call *entries*
-- read-restricted separately below, while structure itself is low
-- sensitivity.
create policy hostels_same_school on public.hostels
  for select using (school_id in (select school_id from public.profiles where id = auth.uid()));

create policy hostel_blocks_same_school on public.hostel_blocks
  for select using (
    hostel_id in (select id from public.hostels where school_id in
      (select school_id from public.profiles where id = auth.uid()))
  );

create policy hostel_rooms_same_school on public.hostel_rooms
  for select using (
    block_id in (select id from public.hostel_blocks where hostel_id in
      (select id from public.hostels where school_id in
        (select school_id from public.profiles where id = auth.uid())))
  );

create policy hostel_beds_same_school on public.hostel_beds
  for select using (
    room_id in (select id from public.hostel_rooms where block_id in
      (select id from public.hostel_blocks where hostel_id in
        (select id from public.hostels where school_id in
          (select school_id from public.profiles where id = auth.uid()))))
  );

-- Roll call entries: hostel staff (any active hostel appointment) at the
-- same school, or the student's own row (so a boarding student can see
-- their own roll-call status on their dashboard — Lane F consumes this).
create policy roll_call_entries_hostel_staff_or_self on public.hostel_roll_call_entries
  for select using (
    student_id = auth.uid()
    or
    session_id in (
      select rcs.id from public.hostel_roll_call_sessions rcs
      where rcs.school_id in (
        select a.school_id from public.appointments a
        where a.profile_id = auth.uid()
          and a.appointment_type in ('warden','assistant_warden','house_parent','hostel_administrator')
          and a.status = 'active'
      )
    )
  );

create policy roll_call_sessions_hostel_staff on public.hostel_roll_call_sessions
  for select using (
    school_id in (
      select a.school_id from public.appointments a
      where a.profile_id = auth.uid()
        and a.appointment_type in ('warden','assistant_warden','house_parent','hostel_administrator')
        and a.status = 'active'
    )
    or school_id in (select school_id from public.profiles where id = auth.uid() and role in ('principal','secretary'))
  );

create policy bed_assignments_hostel_staff_or_self on public.hostel_bed_assignments
  for select using (
    student_id = auth.uid()
    or
    bed_id in (
      select b.id from public.hostel_beds b
      join public.hostel_rooms r on r.id = b.room_id
      join public.hostel_blocks bl on bl.id = r.block_id
      join public.hostels h on h.id = bl.hostel_id
      where h.school_id in (
        select a.school_id from public.appointments a
        where a.profile_id = auth.uid()
          and a.appointment_type in ('warden','assistant_warden','house_parent','hostel_administrator')
          and a.status = 'active'
      )
    )
  );

-- Note: all INSERT/UPDATE on these tables goes through the service-role
-- client in the API routes below, which re-verifies the caller's active
-- hostel appointment server-side before writing — per "server-side
-- authorization only," these read policies are the browser-facing floor,
-- not the only check.
