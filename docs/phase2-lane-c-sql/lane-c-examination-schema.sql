-- ============================================================
-- SchoolOS, Phase 2, Lane C: Examination Team System
-- ============================================================
-- Extends Phase 1's appointment model (appointment_types / appointments)
-- and the EXISTING `results` table. Does not fork a second results
-- system, teacher/PostResultsClient.tsx and principal/PrincipalResultsClient.tsx
-- keep working exactly as before; this adds a verification + publication
-- layer on top of the same rows.
--
-- Not yet run against the live database. Review against the actual
-- Supabase schema before applying (this repo has no migration history:
-- see docs/phase1-foundation/01-AUDIT.md §4). Apply in a transaction;
-- every statement is idempotent (if not exists / on conflict do nothing)
-- so it is safe to re-run.
-- ============================================================

begin;

-- ---------------------------------------------------------------
-- 1. New appointment types for the examination committee.
--    'examination_officer' already exists from Phase 1 (the committee
--    lead, matches the §25 permission-matrix row). These six are new.
-- ---------------------------------------------------------------
insert into public.appointment_types (id, label, category, base_role_scope) values
  ('examination_coordinator',      'Examination Coordinator',        'academic', array['teacher']),
  ('examination_secretary',        'Examination Secretary',          'academic', array['teacher']),
  ('exam_setter',                  'Exam Setter',                    'academic', array['teacher']),
  ('invigilator',                  'Invigilator',                    'academic', array['teacher']),
  ('result_officer',               'Result Officer',                 'academic', array['teacher']),
  ('result_verification_officer',  'Result Verification Officer',    'academic', array['teacher'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------
-- 2. Helper functions. Mirror the my_role()/my_school_id() pattern in
--    SECURITY_RLS_AUDIT_AND_POLICIES.sql. SECURITY DEFINER so a policy
--    checking "does this user hold appointment X" doesn't recurse
--    through appointments' own RLS.
-- ---------------------------------------------------------------
create or replace function public.has_active_appointment(p_types text[]) returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from public.appointments
    where profile_id = auth.uid()
      and status = 'active'
      and appointment_type = any(p_types)
  )
$$;

comment on function public.has_active_appointment is
  'Explicit allow-list check only, never infers capability from a job title. Callers pass the exact appointment_type list a given action permits, matching the capability table in src/lib/supabase/examPermissions.ts. Keep both in sync by hand.';

create or replace function public.is_assigned_invigilator(p_exam_timetable_id uuid) returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from public.invigilator_assignments
    where exam_timetable_id = p_exam_timetable_id
      and profile_id = auth.uid()
      and status <> 'cancelled'
  )
$$;

-- Any exam-team appointment at all (used for the "may report an incident"
-- baseline, and for the context-switcher visibility check).
create or replace function public.has_any_exam_appointment() returns boolean
language sql security definer stable
set search_path = public
as $$
  select public.has_active_appointment(array[
    'examination_officer','examination_coordinator','examination_secretary',
    'exam_setter','invigilator','result_officer','result_verification_officer'
  ])
$$;

-- ---------------------------------------------------------------
-- 3. Exam sessions, a sitting/period ("First Term Exam 2025/2026").
-- ---------------------------------------------------------------
create table if not exists public.exam_sessions (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references public.schools(id) on delete cascade,
  name           text not null,
  term           text not null,
  academic_year  text not null,
  start_date     date not null,
  end_date       date not null,
  status         text not null default 'draft'
                 check (status in ('draft','scheduled','ongoing','completed','archived')),
  created_by     uuid references public.profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_exam_sessions_school on public.exam_sessions(school_id);

-- ---------------------------------------------------------------
-- 4. Exam rooms.
-- ---------------------------------------------------------------
create table if not exists public.exam_rooms (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  name        text not null,
  capacity    integer,
  location    text,
  created_at  timestamptz not null default now(),
  unique (school_id, name)
);

-- ---------------------------------------------------------------
-- 5. Exam timetable, one row per subject/class sitting within a session.
-- ---------------------------------------------------------------
create table if not exists public.exam_timetable (
  id                 uuid primary key default gen_random_uuid(),
  exam_session_id    uuid not null references public.exam_sessions(id) on delete cascade,
  school_id          uuid not null references public.schools(id) on delete cascade,
  class_subject_id   uuid not null references public.class_subjects(id),
  exam_date          date not null,
  start_time         time not null,
  end_time           time not null,
  room_id            uuid references public.exam_rooms(id) on delete set null,
  max_score          numeric not null default 100,
  status             text not null default 'scheduled'
                     check (status in ('scheduled','ongoing','completed','cancelled')),
  created_by         uuid references public.profiles(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_exam_timetable_session on public.exam_timetable(exam_session_id);
create index if not exists idx_exam_timetable_school  on public.exam_timetable(school_id);

-- ---------------------------------------------------------------
-- 6. Seating, optional per-candidate seat assignment for an exam sitting.
-- ---------------------------------------------------------------
create table if not exists public.exam_seating (
  id                 uuid primary key default gen_random_uuid(),
  exam_timetable_id  uuid not null references public.exam_timetable(id) on delete cascade,
  student_id         uuid not null references public.profiles(id) on delete cascade,
  room_id            uuid references public.exam_rooms(id) on delete set null,
  seat_number        text,
  created_at         timestamptz not null default now(),
  unique (exam_timetable_id, student_id)
);

-- ---------------------------------------------------------------
-- 7. Invigilator assignments.
-- ---------------------------------------------------------------
create table if not exists public.invigilator_assignments (
  id                 uuid primary key default gen_random_uuid(),
  exam_timetable_id  uuid not null references public.exam_timetable(id) on delete cascade,
  school_id          uuid not null references public.schools(id) on delete cascade,
  profile_id         uuid not null references public.profiles(id) on delete cascade,
  room_id            uuid references public.exam_rooms(id) on delete set null,
  status             text not null default 'assigned'
                     check (status in ('assigned','confirmed','completed','cancelled')),
  assigned_by        uuid references public.profiles(id),
  assigned_at        timestamptz not null default now(),
  unique (exam_timetable_id, profile_id)
);

create index if not exists idx_invigilator_profile on public.invigilator_assignments(profile_id);

-- ---------------------------------------------------------------
-- 8. Exam attendance, candidate present/absent for a sitting.
-- ---------------------------------------------------------------
create table if not exists public.exam_attendance (
  id                 uuid primary key default gen_random_uuid(),
  exam_timetable_id  uuid not null references public.exam_timetable(id) on delete cascade,
  school_id          uuid not null references public.schools(id) on delete cascade,
  student_id         uuid not null references public.profiles(id) on delete cascade,
  status             text not null default 'present' check (status in ('present','absent','excused')),
  marked_by          uuid references public.profiles(id),
  marked_at          timestamptz not null default now(),
  unique (exam_timetable_id, student_id)
);

-- ---------------------------------------------------------------
-- 9. Secure examination document workflow (question papers / marking
--    schemes), custody chain, not just a status flag, so "who has the
--    live paper right now" is always answerable.
-- ---------------------------------------------------------------
create table if not exists public.exam_documents (
  id                   uuid primary key default gen_random_uuid(),
  exam_timetable_id    uuid not null references public.exam_timetable(id) on delete cascade,
  school_id            uuid not null references public.schools(id) on delete cascade,
  doc_type             text not null check (doc_type in ('question_paper','marking_scheme')),
  status               text not null default 'drafting'
                       check (status in (
                         'drafting','submitted','under_review','approved',
                         'printed','distributed','collected','archived'
                       )),
  current_custodian_id uuid references public.profiles(id),
  storage_path         text,
  created_by           uuid references public.profiles(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table if not exists public.exam_document_events (
  id             uuid primary key default gen_random_uuid(),
  document_id    uuid not null references public.exam_documents(id) on delete cascade,
  from_profile_id uuid references public.profiles(id),
  to_profile_id   uuid references public.profiles(id),
  event_type     text not null,   -- 'created' | 'submitted' | 'reviewed' | 'approved' | 'handed_over' | 'printed' | 'distributed' | 'collected' | 'archived'
  notes          text,
  occurred_at    timestamptz not null default now()
);

create index if not exists idx_exam_documents_timetable on public.exam_documents(exam_timetable_id);
create index if not exists idx_exam_doc_events_document  on public.exam_document_events(document_id);

-- ---------------------------------------------------------------
-- 10. Incidents / malpractice records.
-- ---------------------------------------------------------------
create table if not exists public.exam_incidents (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null references public.schools(id) on delete cascade,
  exam_timetable_id  uuid references public.exam_timetable(id) on delete set null,
  reported_by        uuid references public.profiles(id),
  student_id         uuid references public.profiles(id),
  incident_type      text not null check (incident_type in ('malpractice','technical','conduct','other')),
  severity           text not null default 'medium' check (severity in ('low','medium','high','critical')),
  description        text not null,
  status             text not null default 'reported'
                     check (status in ('reported','under_review','resolved','escalated')),
  resolution_notes   text,
  resolved_by        uuid references public.profiles(id),
  resolved_at        timestamptz,
  created_at         timestamptz not null default now()
);

create index if not exists idx_exam_incidents_school on public.exam_incidents(school_id);

-- ---------------------------------------------------------------
-- 11. Results workflow extension, ADDITIVE ONLY. Same table teacher/
--     principal already write to. Order this phase introduces:
--       posted (existing) → verified (new) → approved (existing)
--       → published (new, gates student/parent visibility)
-- ---------------------------------------------------------------
alter table public.results add column if not exists verified     boolean not null default false;
alter table public.results add column if not exists verified_by  uuid references public.profiles(id);
alter table public.results add column if not exists verified_at  timestamptz;
alter table public.results add column if not exists published    boolean not null default false;
alter table public.results add column if not exists published_by uuid references public.profiles(id);
alter table public.results add column if not exists published_at timestamptz;

-- Backfill: today, student/parent result pages show ALL results with no
-- `approved` filter at all (see audit note in the Lane C report, this
-- was a pre-existing gap, not introduced here). Publication is about to
-- become the actual visibility gate, so anything already approved is
-- marked published now to avoid results that are currently visible
-- suddenly disappearing from a parent's screen the moment this ships.
-- Anything not yet approved stays unpublished and goes through the new
-- workflow normally.
update public.results
  set published = true, published_at = coalesce(approved_at, now())
  where approved = true and published = false;

create index if not exists idx_results_published on public.results(school_id, published);

-- ---------------------------------------------------------------
-- 12. RLS, new tables.
-- ---------------------------------------------------------------
alter table public.exam_sessions            enable row level security;
alter table public.exam_rooms               enable row level security;
alter table public.exam_timetable           enable row level security;
alter table public.exam_seating             enable row level security;
alter table public.invigilator_assignments  enable row level security;
alter table public.exam_attendance          enable row level security;
alter table public.exam_documents           enable row level security;
alter table public.exam_document_events     enable row level security;
alter table public.exam_incidents           enable row level security;

-- Appointment types allowed to CREATE/EDIT exam structure (sessions,
-- timetable, rooms): the two coordination-level positions + principal.
-- Matches examPermissions.ts EXAM_CAPABILITIES.manage_exams.
-- exam_sessions
create policy exam_sessions_select on public.exam_sessions
  for select using (school_id = public.my_school_id());

create policy exam_sessions_write on public.exam_sessions
  for all using (
    school_id = public.my_school_id()
    and (public.my_role() = 'principal'
         or public.has_active_appointment(array['examination_officer','examination_coordinator']))
  ) with check (
    school_id = public.my_school_id()
    and (public.my_role() = 'principal'
         or public.has_active_appointment(array['examination_officer','examination_coordinator']))
  );

-- exam_rooms
create policy exam_rooms_select on public.exam_rooms
  for select using (school_id = public.my_school_id());

create policy exam_rooms_write on public.exam_rooms
  for all using (
    school_id = public.my_school_id()
    and (public.my_role() = 'principal'
         or public.has_active_appointment(array['examination_officer','examination_coordinator']))
  ) with check (
    school_id = public.my_school_id()
    and (public.my_role() = 'principal'
         or public.has_active_appointment(array['examination_officer','examination_coordinator']))
  );

-- exam_timetable, read: any staff member of the school (a teacher needs
-- to see when their own class sits an exam). Write: coordination-level
-- + examination_secretary (clerical data entry, per §25 spec) + principal.
create policy exam_timetable_select on public.exam_timetable
  for select using (school_id = public.my_school_id());

create policy exam_timetable_write on public.exam_timetable
  for all using (
    school_id = public.my_school_id()
    and (public.my_role() = 'principal'
         or public.has_active_appointment(array['examination_officer','examination_coordinator','examination_secretary']))
  ) with check (
    school_id = public.my_school_id()
    and (public.my_role() = 'principal'
         or public.has_active_appointment(array['examination_officer','examination_coordinator','examination_secretary']))
  );

-- exam_seating, read: coordination roles, principal, and the assigned
-- invigilator for that sitting (needs to know who sits where). Write:
-- coordination roles + principal only.
create policy exam_seating_select on public.exam_seating
  for select using (
    exam_timetable_id in (select id from public.exam_timetable where school_id = public.my_school_id())
    and (public.my_role() = 'principal'
         or public.has_active_appointment(array['examination_officer','examination_coordinator','examination_secretary'])
         or public.is_assigned_invigilator(exam_timetable_id))
  );

create policy exam_seating_write on public.exam_seating
  for all using (
    exam_timetable_id in (select id from public.exam_timetable where school_id = public.my_school_id())
    and (public.my_role() = 'principal'
         or public.has_active_appointment(array['examination_officer','examination_coordinator']))
  ) with check (
    exam_timetable_id in (select id from public.exam_timetable where school_id = public.my_school_id())
    and (public.my_role() = 'principal'
         or public.has_active_appointment(array['examination_officer','examination_coordinator']))
  );

-- invigilator_assignments, read: coordination roles/principal (all), the
-- assigned invigilator (their own row only). Write (assign): coordination
-- roles + principal. Update own status (confirm/complete): the assigned
-- invigilator, via a separate policy scoped to their own row.
create policy invigilator_assignments_select on public.invigilator_assignments
  for select using (
    school_id = public.my_school_id()
    and (public.my_role() = 'principal'
         or public.has_active_appointment(array['examination_officer','examination_coordinator'])
         or profile_id = auth.uid())
  );

create policy invigilator_assignments_assign on public.invigilator_assignments
  for insert with check (
    school_id = public.my_school_id()
    and (public.my_role() = 'principal'
         or public.has_active_appointment(array['examination_officer','examination_coordinator']))
  );

create policy invigilator_assignments_coordinator_update on public.invigilator_assignments
  for update using (
    school_id = public.my_school_id()
    and (public.my_role() = 'principal'
         or public.has_active_appointment(array['examination_officer','examination_coordinator']))
  );

-- Confirming your own duty deliberately does NOT go through a generic
-- client-side UPDATE policy. A naive "profile_id = auth.uid()" USING/
-- WITH CHECK pair only constrains who owns the row being touched, it
-- does nothing to stop that owner from also rewriting exam_timetable_id
-- or room_id on their one legitimate assignment to point at a totally
-- different sitting they were never assigned to, silently granting
-- themselves invigilator-level access (attendance marking, seating
-- visibility) to an exam they have no business touching. Caught this
-- during the security pass on this file, see confirm_invigilator_duty()
-- below, which is the only way an invigilator can change their own
-- assignment's status, and it can only ever set status to 'confirmed'.
create or replace function public.confirm_invigilator_duty(p_assignment_id uuid) returns void
language plpgsql security definer
set search_path = public
as $$
begin
  update public.invigilator_assignments
  set status = 'confirmed'
  where id = p_assignment_id
    and profile_id = auth.uid()
    and status = 'assigned';

  if not found then
    raise exception 'No matching assigned duty found for this user.';
  end if;
end;
$$;

grant execute on function public.confirm_invigilator_duty(uuid) to authenticated;

create policy invigilator_assignments_delete on public.invigilator_assignments
  for delete using (
    school_id = public.my_school_id()
    and (public.my_role() = 'principal'
         or public.has_active_appointment(array['examination_officer','examination_coordinator']))
  );

-- exam_attendance, write restricted to the invigilator actually assigned
-- to that sitting (or coordination roles/principal as override). This is
-- the literal enforcement of "Invigilator → assigned exams/rooms only".
create policy exam_attendance_select on public.exam_attendance
  for select using (
    school_id = public.my_school_id()
    and (public.my_role() = 'principal'
         or public.has_active_appointment(array['examination_officer','examination_coordinator','result_officer'])
         or public.is_assigned_invigilator(exam_timetable_id))
  );

create policy exam_attendance_write on public.exam_attendance
  for all using (
    school_id = public.my_school_id()
    and (public.my_role() = 'principal'
         or public.has_active_appointment(array['examination_officer','examination_coordinator'])
         or public.is_assigned_invigilator(exam_timetable_id))
  ) with check (
    school_id = public.my_school_id()
    and (public.my_role() = 'principal'
         or public.has_active_appointment(array['examination_officer','examination_coordinator'])
         or public.is_assigned_invigilator(exam_timetable_id))
  );

-- exam_documents / exam_document_events, the most sensitive table here.
-- Read: examination_officer/coordinator/principal (full), exam_setter
-- (only documents they created), current custodian (only while they hold
-- it). Write: exam_setter can create/edit their own drafts; custody
-- transfers happen through the API route (service-role), not raw client
-- writes, see src/app/api/examination/documents/[id]/transfer-custody:
-- so there is no generic client-side UPDATE policy for status/custodian
-- here by design. This is the one Lane C surface where "hidden nav item
-- is not a security boundary" gets enforced by NOT exposing a client
-- write path at all, not just by hiding a button.
create policy exam_documents_select on public.exam_documents
  for select using (
    school_id = public.my_school_id()
    and (public.my_role() = 'principal'
         or public.has_active_appointment(array['examination_officer','examination_coordinator'])
         or created_by = auth.uid()
         or current_custodian_id = auth.uid())
  );

create policy exam_documents_create on public.exam_documents
  for insert with check (
    school_id = public.my_school_id()
    and (public.my_role() = 'principal'
         or public.has_active_appointment(array['examination_officer','examination_coordinator','exam_setter']))
  );

create policy exam_documents_setter_edit_own_draft on public.exam_documents
  for update using (
    school_id = public.my_school_id()
    and created_by = auth.uid()
    and status = 'drafting'
    and public.has_active_appointment(array['exam_setter','examination_officer','examination_coordinator'])
  ) with check (
    school_id = public.my_school_id()
    and created_by = auth.uid()
    and status = 'drafting'
    -- Custody can't be silently reassigned through this path, while a
    -- document is still in drafting, custody stays with its creator by
    -- definition; every later handoff goes through the transfer-custody
    -- API route instead (see exam_documents comment above). Without this
    -- line, a setter's own-draft UPDATE could quietly set
    -- current_custodian_id to anyone, skipping the audit trail entirely.
    and current_custodian_id = auth.uid()
  );

create policy exam_document_events_select on public.exam_document_events
  for select using (
    document_id in (
      select id from public.exam_documents
      where school_id = public.my_school_id()
        and (public.my_role() = 'principal'
             or public.has_active_appointment(array['examination_officer','examination_coordinator'])
             or created_by = auth.uid()
             or current_custodian_id = auth.uid())
    )
  );
-- No client-side insert policy for exam_document_events: every custody
-- event is written by the transfer-custody API route using the
-- service-role key, so the chain can't be forged or skipped from the
-- browser. See rationale on exam_documents above.

-- exam_incidents, read: coordination roles + principal (all), reporter
-- (their own reports only). Insert: any active exam-team appointment
-- holder (baseline reporting right, per has_any_exam_appointment) or any
-- staff role, since a teacher not on the committee can still witness
-- malpractice during their own invigilation duty. Resolve: coordination
-- roles + principal only.
create policy exam_incidents_select on public.exam_incidents
  for select using (
    school_id = public.my_school_id()
    and (public.my_role() in ('principal')
         or public.has_active_appointment(array['examination_officer','examination_coordinator'])
         or reported_by = auth.uid())
  );

create policy exam_incidents_report on public.exam_incidents
  for insert with check (
    school_id = public.my_school_id()
    and reported_by = auth.uid()
  );

create policy exam_incidents_resolve on public.exam_incidents
  for update using (
    school_id = public.my_school_id()
    and (public.my_role() = 'principal'
         or public.has_active_appointment(array['examination_officer','examination_coordinator']))
  ) with check (
    school_id = public.my_school_id()
    and (public.my_role() = 'principal'
         or public.has_active_appointment(array['examination_officer','examination_coordinator']))
  );

-- ---------------------------------------------------------------
-- 13. RLS, `results` table itself has NO policies anywhere in this
--     repo's SQL (confirmed: grep of SECURITY_RLS_AUDIT_AND_POLICIES.sql
--     and sql/s.sql both come back empty for it). PostResultsClient.tsx
--     and PrincipalResultsClient.tsx write to it directly from the
--     browser today, which means, same warning as the RLS audit file:
--     the ENTIRE security boundary for that table is whatever exists
--     (or doesn't) in the live Supabase project. Writing the missing
--     baseline policies here rather than leaving them undefined, since
--     this phase adds two new sensitive actions (verify, publish) to the
--     same table and those need a real boundary, not an assumed one.
--     RUN THE VERIFICATION QUERY IN SECURITY_RLS_AUDIT_AND_POLICIES.sql
--     FIRST to see what already exists live before applying this block:
--     if policies already exist, compare rather than blindly layering.
-- ---------------------------------------------------------------
alter table public.results enable row level security;

-- Select: staff of the school with a legitimate reason to see results
-- (teacher, RLS can't easily scope to "own class only" without a join
-- through class_subjects/class_teachers, so this floor is same-school
-- staff; the UI layer already scopes teachers to their own classes, and
-- nothing in `results` is student-PII-sensitive beyond what teachers of
-- that school already see across the roster) + principal + exam-team
-- appointment holders + the student themselves + that student's parent.
create policy results_select on public.results
  for select using (
    school_id = public.my_school_id()
    and (
      public.my_role() in ('principal','teacher')
      or public.has_any_exam_appointment()
      or student_id = auth.uid()
      or exists (
        -- Parent access confirmed against the same column parent/results
        -- page.tsx already queries (profiles.parent_id -> parent's own
        -- profile id), see src/app/dashboard/parent/results/page.tsx.
        select 1 from public.profiles child
        where child.id = results.student_id and child.parent_id = auth.uid()
      )
    )
  );

-- Insert: only a teacher creating their own posted_by row (matches
-- PostResultsClient.tsx's `.insert(rows)` call, rows always self-posted)
-- or result_officer/examination_officer doing administrative entry.
-- Every new row must start at the bottom of the workflow, approved,
-- verified, and published all false/null on insert, regardless of who
-- creates it, so nobody can hand-craft an insert payload that skips
-- straight to "published" and hits the student's screen immediately.
-- (Caught during the security pass: without this, a result_officer's
-- otherwise-legitimate administrative-entry right could be used to
-- insert a row that's already approved=true/published=true in one call.)
create policy results_insert on public.results
  for insert with check (
    school_id = public.my_school_id()
    and coalesce(approved, false) = false
    and coalesce(verified, false) = false
    and coalesce(published, false) = false
    and (
      (public.my_role() = 'teacher' and posted_by = auth.uid())
      or public.has_active_appointment(array['result_officer','examination_officer'])
    )
  );

-- Update: existing approve/edit stays with teacher (own unapproved rows)
-- + principal (approve). Verify/publish are DELIBERATELY NOT granted
-- here to result_verification_officer/examination_officer/result_officer
--, those actions only ever happen through
-- /api/examination/results/verify and /publish, which use the
-- service-role admin client and write only the verify/publish columns.
-- Granting a raw client-side UPDATE to those appointment types here
-- would let a verifier (whose only intended power is "verify") edit a
-- student's score directly from the browser with nothing stopping them:
-- caught during the security pass on this file, see the comment on
-- verify/route.ts and publish/route.ts for the actual write path.
create policy results_update on public.results
  for update using (
    school_id = public.my_school_id()
    and (
      (public.my_role() = 'teacher' and posted_by = auth.uid() and approved = false)
      or public.my_role() = 'principal'
    )
  ) with check (school_id = public.my_school_id());

commit;

-- ============================================================
-- Rollback (manual, not run automatically):
--   drop table if exists public.exam_document_events, public.exam_documents,
--     public.exam_incidents, public.exam_attendance,
--     public.invigilator_assignments, public.exam_seating,
--     public.exam_timetable, public.exam_rooms, public.exam_sessions cascade;
--   alter table public.results drop column if exists verified,
--     drop column if exists verified_by, drop column if exists verified_at,
--     drop column if exists published, drop column if exists published_by,
--     drop column if exists published_at;
--   drop function if exists public.has_active_appointment(text[]);
--   drop function if exists public.is_assigned_invigilator(uuid);
--   drop function if exists public.has_any_exam_appointment();
--   delete from public.appointment_types where id in (
--     'examination_coordinator','examination_secretary','exam_setter',
--     'invigilator','result_officer','result_verification_officer');
-- ============================================================
