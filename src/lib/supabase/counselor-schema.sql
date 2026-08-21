-- ============================================================
-- SchoolOS, Phase 2, Lane B: Counselor Dashboard
-- New tables only. Reuses public.profiles (identity), public.appointments
-- (the 'counselor' appointment type already seeded in
-- identity-appointments-schema.sql), public.rate_limit_attempts /
-- public.check_rate_limit (security hotfix), and public.portal_audit_log
-- (existing audit mechanism) rather than inventing parallel versions of
-- any of them.
--
-- Privacy rule this entire file exists to enforce (source spec §5):
-- counseling records are visible to the assigned counselor and to nobody
-- else by default, not teachers, not students, not parents, not
-- prefects, not ICT, not unrelated admins, not even the Principal, unless
-- a specific escalation path (not built here) explicitly grants it. RLS
-- below checks an ACTIVE 'counselor' appointment row for the requesting
-- user, never profiles.role alone, since profiles.role stays 'teacher'
-- for a counselor-appointed staff member (see appointments-types.ts).
--
-- Not yet run against the live database, review against the live schema
-- before applying, same caveat as identity-appointments-schema.sql.
-- ============================================================

-- ---------------------------------------------------------------
-- 1. Counseling cases, one row per student under active or past
--    counseling attention. A student may have at most one OPEN case at a
--    time (enforced by the partial unique index below); closed cases are
--    kept for case history.
-- ---------------------------------------------------------------
create table if not exists public.counseling_cases (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null references public.schools(id) on delete cascade,
  student_profile_id uuid not null references public.profiles(id) on delete cascade,
  counselor_profile_id uuid not null references public.profiles(id) on delete cascade,

  category           text not null default 'general'
                      check (category in ('academic_risk','attendance','behavioral','emotional','family','peer','other','general')),
  risk_level         text not null default 'low' check (risk_level in ('low','moderate','high')),
  status             text not null default 'open' check (status in ('open','monitoring','closed')),

  summary            text, -- short, non-clinical description usable in lists; detail lives in counseling_notes
  opened_by          uuid references public.profiles(id),
  opened_at          timestamptz not null default now(),
  closed_at          timestamptz,
  closed_reason      text,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create unique index if not exists idx_counseling_cases_one_open_per_student
  on public.counseling_cases(student_profile_id)
  where status in ('open','monitoring');

create index if not exists idx_counseling_cases_counselor
  on public.counseling_cases(counselor_profile_id, status);
create index if not exists idx_counseling_cases_school
  on public.counseling_cases(school_id);

comment on table public.counseling_cases is
  'Confidential. Never joined into a general "students" list or exposed to any role other than the assigned counselor without an explicit, separately-built escalation path.';

-- ---------------------------------------------------------------
-- 2. Confidential notes, the actual clinical/support content. Kept in
--    its own table (not a text column on the case) so access can be
--    logged and revoked independently of case metadata later if needed.
-- ---------------------------------------------------------------
create table if not exists public.counseling_notes (
  id            uuid primary key default gen_random_uuid(),
  case_id       uuid not null references public.counseling_cases(id) on delete cascade,
  school_id     uuid not null references public.schools(id) on delete cascade,
  author_profile_id uuid not null references public.profiles(id),
  note          text not null,
  created_at    timestamptz not null default now()
);

create index if not exists idx_counseling_notes_case
  on public.counseling_notes(case_id, created_at desc);

comment on table public.counseling_notes is
  'The most sensitive table in this module. RLS restricts read/write to the case''s assigned counselor only, see policies below. Notes are never editable after creation (append-only case history); no UPDATE policy is defined on purpose.';

-- ---------------------------------------------------------------
-- 3. Counseling appointments (sessions), distinct from the
--    school-wide `appointments` table (org appointments like "Counselor"
--    itself); this is a scheduled meeting between counselor and student.
-- ---------------------------------------------------------------
create table if not exists public.counseling_sessions (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null references public.schools(id) on delete cascade,
  case_id            uuid references public.counseling_cases(id) on delete set null,
  counselor_profile_id uuid not null references public.profiles(id) on delete cascade,
  student_profile_id uuid not null references public.profiles(id) on delete cascade,

  scheduled_at       timestamptz not null,
  duration_minutes   integer not null default 30 check (duration_minutes > 0),
  location           text,
  status             text not null default 'scheduled'
                      check (status in ('scheduled','completed','cancelled','no_show')),
  session_summary    text, -- brief, filled in after the session; still counselor-only

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_counseling_sessions_counselor_time
  on public.counseling_sessions(counselor_profile_id, scheduled_at);
create index if not exists idx_counseling_sessions_case
  on public.counseling_sessions(case_id);

-- ---------------------------------------------------------------
-- 4. Referrals, how a case starts. Any authenticated staff member or a
--    student's linked parent may submit one; only the receiving counselor
--    (and, for tracking their own submission, the referrer) may read it.
--    Submitting a referral never grants ongoing access to the resulting
--    case or notes.
-- ---------------------------------------------------------------
create table if not exists public.counseling_referrals (
  id                    uuid primary key default gen_random_uuid(),
  school_id             uuid not null references public.schools(id) on delete cascade,
  student_profile_id    uuid not null references public.profiles(id) on delete cascade,
  referred_by_profile_id uuid not null references public.profiles(id),
  referred_to_profile_id uuid references public.profiles(id), -- specific counselor, or null = school's counseling queue

  reason                text not null,
  urgency               text not null default 'normal' check (urgency in ('normal','elevated','urgent')),
  status                text not null default 'pending'
                        check (status in ('pending','accepted','declined','converted_to_case')),

  resulting_case_id     uuid references public.counseling_cases(id),
  decline_reason        text,
  reviewed_by           uuid references public.profiles(id),
  reviewed_at           timestamptz,

  created_at            timestamptz not null default now()
);

create index if not exists idx_counseling_referrals_school_status
  on public.counseling_referrals(school_id, status);
create index if not exists idx_counseling_referrals_referrer
  on public.counseling_referrals(referred_by_profile_id);

comment on table public.counseling_referrals is
  'The reason field is written by the referrer and is visible to the receiving counselor and to the referrer themselves only, never to other staff, never to the student or other parents.';

-- ---------------------------------------------------------------
-- 5. Follow-ups, scheduled check-ins tied to a case, surfaced as
--    reminders on the counselor's dashboard.
-- ---------------------------------------------------------------
create table if not exists public.counseling_follow_ups (
  id            uuid primary key default gen_random_uuid(),
  case_id       uuid not null references public.counseling_cases(id) on delete cascade,
  school_id     uuid not null references public.schools(id) on delete cascade,
  counselor_profile_id uuid not null references public.profiles(id) on delete cascade,

  due_at        timestamptz not null,
  note          text not null,
  status        text not null default 'pending' check (status in ('pending','done','cancelled')),
  completed_at  timestamptz,

  created_at    timestamptz not null default now()
);

create index if not exists idx_counseling_followups_counselor_due
  on public.counseling_follow_ups(counselor_profile_id, status, due_at);
create index if not exists idx_counseling_followups_case
  on public.counseling_follow_ups(case_id);

-- ---------------------------------------------------------------
-- 6. RLS, deny by default. Every policy below checks an ACTIVE
--    'counselor' appointment for the requesting user via public.appointments,
--    scoped to the same school AND (where applicable) to rows where that
--    specific counselor is the one assigned, never a school-wide read.
--    Client-side writes are additionally re-verified server-side by the
--    API routes in src/app/api/counselor/* per the "server-side
--    authorization only" rule; these policies are the browser-facing
--    floor, not the only check.
-- ---------------------------------------------------------------
alter table public.counseling_cases      enable row level security;
alter table public.counseling_notes      enable row level security;
alter table public.counseling_sessions   enable row level security;
alter table public.counseling_referrals  enable row level security;
alter table public.counseling_follow_ups enable row level security;

-- Helper predicate, inlined per-policy (Postgres RLS can't call a
-- SECURITY DEFINER function and rely on it for the *identity* check the
-- same way a plain subquery can be planned/indexed): "does auth.uid()
-- hold an active counselor appointment at this school_id".
-- Reproduced in each policy below rather than factored into a function,
-- so every policy is independently auditable without chasing a
-- cross-reference.

create policy counseling_cases_owner on public.counseling_cases
  for select using (
    counselor_profile_id = auth.uid()
    and exists (
      select 1 from public.appointments a
      where a.profile_id = auth.uid()
        and a.appointment_type = 'counselor'
        and a.status = 'active'
        and a.school_id = counseling_cases.school_id
    )
  );

create policy counseling_cases_owner_write on public.counseling_cases
  for insert with check (
    counselor_profile_id = auth.uid()
    and exists (
      select 1 from public.appointments a
      where a.profile_id = auth.uid()
        and a.appointment_type = 'counselor'
        and a.status = 'active'
        and a.school_id = counseling_cases.school_id
    )
  );

create policy counseling_cases_owner_update on public.counseling_cases
  for update using (
    counselor_profile_id = auth.uid()
    and exists (
      select 1 from public.appointments a
      where a.profile_id = auth.uid()
        and a.appointment_type = 'counselor'
        and a.status = 'active'
        and a.school_id = counseling_cases.school_id
    )
  );

create policy counseling_notes_owner on public.counseling_notes
  for select using (
    exists (
      select 1 from public.counseling_cases c
      where c.id = counseling_notes.case_id
        and c.counselor_profile_id = auth.uid()
    )
    and exists (
      select 1 from public.appointments a
      where a.profile_id = auth.uid()
        and a.appointment_type = 'counselor'
        and a.status = 'active'
        and a.school_id = counseling_notes.school_id
    )
  );

create policy counseling_notes_owner_insert on public.counseling_notes
  for insert with check (
    author_profile_id = auth.uid()
    and exists (
      select 1 from public.counseling_cases c
      where c.id = counseling_notes.case_id
        and c.counselor_profile_id = auth.uid()
    )
    and exists (
      select 1 from public.appointments a
      where a.profile_id = auth.uid()
        and a.appointment_type = 'counselor'
        and a.status = 'active'
        and a.school_id = counseling_notes.school_id
    )
  );
-- No UPDATE/DELETE policy: notes are append-only by design (see comment above).

create policy counseling_sessions_owner on public.counseling_sessions
  for select using (
    counselor_profile_id = auth.uid()
    and exists (
      select 1 from public.appointments a
      where a.profile_id = auth.uid()
        and a.appointment_type = 'counselor'
        and a.status = 'active'
        and a.school_id = counseling_sessions.school_id
    )
  );

create policy counseling_sessions_owner_write on public.counseling_sessions
  for insert with check (
    counselor_profile_id = auth.uid()
    and exists (
      select 1 from public.appointments a
      where a.profile_id = auth.uid()
        and a.appointment_type = 'counselor'
        and a.status = 'active'
        and a.school_id = counseling_sessions.school_id
    )
  );

create policy counseling_sessions_owner_update on public.counseling_sessions
  for update using (
    counselor_profile_id = auth.uid()
    and exists (
      select 1 from public.appointments a
      where a.profile_id = auth.uid()
        and a.appointment_type = 'counselor'
        and a.status = 'active'
        and a.school_id = counseling_sessions.school_id
    )
  );

-- Referrals: the counselor queue (any active counselor at the school may
-- see an unassigned or assigned-to-them referral, so a school with
-- several counselors still has a shared intake queue) OR the original
-- referrer reading back their own submission's status. Neither branch
-- exposes the row to anyone else.
create policy counseling_referrals_read on public.counseling_referrals
  for select using (
    referred_by_profile_id = auth.uid()
    or (
      (referred_to_profile_id = auth.uid() or referred_to_profile_id is null)
      and exists (
        select 1 from public.appointments a
        where a.profile_id = auth.uid()
          and a.appointment_type = 'counselor'
          and a.status = 'active'
          and a.school_id = counseling_referrals.school_id
      )
    )
  );

-- Any authenticated same-school staff member or the student's linked
-- parent may submit a referral. Client-side this is a floor; the API
-- route additionally rate-limits submissions per user.
create policy counseling_referrals_insert on public.counseling_referrals
  for insert with check (
    referred_by_profile_id = auth.uid()
    and school_id in (select school_id from public.profiles where id = auth.uid())
  );

create policy counseling_referrals_update on public.counseling_referrals
  for update using (
    exists (
      select 1 from public.appointments a
      where a.profile_id = auth.uid()
        and a.appointment_type = 'counselor'
        and a.status = 'active'
        and a.school_id = counseling_referrals.school_id
    )
    and (referred_to_profile_id = auth.uid() or referred_to_profile_id is null)
  );

create policy counseling_followups_owner on public.counseling_follow_ups
  for select using (
    counselor_profile_id = auth.uid()
    and exists (
      select 1 from public.appointments a
      where a.profile_id = auth.uid()
        and a.appointment_type = 'counselor'
        and a.status = 'active'
        and a.school_id = counseling_follow_ups.school_id
    )
  );

create policy counseling_followups_owner_write on public.counseling_follow_ups
  for insert with check (
    counselor_profile_id = auth.uid()
    and exists (
      select 1 from public.appointments a
      where a.profile_id = auth.uid()
        and a.appointment_type = 'counselor'
        and a.status = 'active'
        and a.school_id = counseling_follow_ups.school_id
    )
  );

create policy counseling_followups_owner_update on public.counseling_follow_ups
  for update using (
    counselor_profile_id = auth.uid()
    and exists (
      select 1 from public.appointments a
      where a.profile_id = auth.uid()
        and a.appointment_type = 'counselor'
        and a.status = 'active'
        and a.school_id = counseling_follow_ups.school_id
    )
  );
