-- ============================================================
-- SchoolOS - Public Platform Phase 4, Lane C + D
-- Admission Request System (source spec §40-44, 53, 58-59, 65)
--
-- Design rules followed:
--   - One canonical admission table. Replaces the two disconnected
--     legacy tools (public.admissions, public.applications) that
--     existed only inside the Secretary dashboard. Both were
--     staff-entry-only, had no document support, and had no link
--     to a real applicant identity. This file supersedes them.
--   - Global identity vs school tenant (§59): a profile's applicant
--     relationship with a school lives on admission_applications,
--     never on profiles.school_id. profiles.school_id stays null
--     until the person is actually enrolled/employed by a school.
--     One person can hold many admission_applications rows across
--     many schools without ever being tenant-bound to any of them.
--   - Tenant isolation is enforced at the RLS layer, not in
--     application code. A school's RLS policies only ever see rows
--     where admission_applications.school_id = their own school.
--   - Document security (§53): private storage bucket, signed URLs
--     only, no public.getPublicUrl() usage anywhere in this system.
--   - Not yet run against the live database. Review against the
--     actual Supabase schema before applying, same caveat as
--     identity-appointments-schema.sql.
-- ============================================================

-- ---------------------------------------------------------------
-- 1. Per-school admission configuration (§41, 42).
--    A school must explicitly enable applications before receiving
--    any. Each school configures its own fields/documents/fee/
--    deadline rather than a single hardcoded form for every school.
-- ---------------------------------------------------------------
create table if not exists public.admission_settings (
  school_id             uuid primary key references public.schools(id) on delete cascade,
  is_enabled            boolean not null default false,
  application_deadline  date,
  admission_fee         numeric(12,2),
  admission_fee_currency text default 'NGN',
  required_documents    jsonb not null default '[]',   -- [{ key, label, required, accepted_types, max_size_mb }]
  form_fields           jsonb not null default '[]',   -- [{ key, label, type, required, options }]
  eligibility_notes     text,
  requires_interview    boolean not null default false,
  requires_assessment   boolean not null default false,
  acceptance_conditions text,
  updated_at            timestamptz not null default now(),
  updated_by            uuid references public.profiles(id) on delete set null
);

comment on table public.admission_settings is
  'Per-school admission configuration. A school with is_enabled = false does not appear as applicable in public discovery and its admission API rejects new applications.';

-- ---------------------------------------------------------------
-- 2. The canonical application record (§41, 42, 58, 59).
--    applicant_profile_id is the GLOBAL identity (profiles.id).
--    school_id is the per-application tenant scope. A person can
--    have many rows here across many schools; none of them touch
--    profiles.school_id until the school actually admits them and
--    a separate enrollment step (existing onboarding/access-code
--    flow) links the identity to that school as a tenant member.
-- ---------------------------------------------------------------
create table if not exists public.admission_applications (
  id                     uuid primary key default gen_random_uuid(),
  school_id              uuid not null references public.schools(id) on delete cascade,
  applicant_profile_id   uuid not null references public.profiles(id) on delete cascade,

  -- Denormalized applicant snapshot at time of application. Kept
  -- separate from profiles so a school never reads more of the
  -- applicant's global identity than what was submitted to them.
  applicant_name         text not null,
  applicant_email        text,
  applicant_phone        text,
  class_applying_for     text,
  form_responses         jsonb not null default '{}',   -- keyed by admission_settings.form_fields[].key

  status text not null default 'draft' check (status in (
    'draft', 'submitted', 'under_review', 'more_info_required',
    'shortlisted', 'interview_scheduled', 'assessment_scheduled',
    'accepted', 'rejected', 'withdrawn', 'expired'
  )),

  submitted_at           timestamptz,
  reviewed_by            uuid references public.profiles(id) on delete set null,
  reviewed_at            timestamptz,
  decision_notes         text,          -- internal, staff-only, never returned to applicant queries directly
  interview_at           timestamptz,
  assessment_at           timestamptz,

  -- Set only when this application results in enrollment. This is
  -- the one place the applicant/global-identity model reconnects
  -- with the operational school-tenant model, and only after an
  -- explicit staff decision - never automatically.
  linked_student_profile_id uuid references public.profiles(id) on delete set null,

  -- Migration provenance: which legacy row (if any) this replaced.
  migrated_from          text,          -- 'legacy_admissions:<uuid>' | 'legacy_applications:<uuid>' | null

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  unique (school_id, applicant_profile_id, class_applying_for, created_at)
);

create index if not exists idx_admission_applications_school on public.admission_applications(school_id, status);
create index if not exists idx_admission_applications_applicant on public.admission_applications(applicant_profile_id);

comment on table public.admission_applications is
  'Canonical admission record. Superseded public.admissions and public.applications (Secretary-only, staff-entry, no documents). See migration section below.';

-- ---------------------------------------------------------------
-- 3. Status timeline (§43 - applicants see a timeline, not just
--    a current status).
-- ---------------------------------------------------------------
create table if not exists public.admission_status_events (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.admission_applications(id) on delete cascade,
  status         text not null,
  note           text,                 -- applicant-visible note only, e.g. "Interview scheduled for..."
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index if not exists idx_admission_status_events_app on public.admission_status_events(application_id, created_at);

-- ---------------------------------------------------------------
-- 4. Messages between school admission team and applicant (§43).
--    Deliberately separate from the school's internal chat_rooms/
--    chat_messages tables - an applicant is not a tenant member and
--    must never appear in internal school communication surfaces.
-- ---------------------------------------------------------------
create table if not exists public.admission_messages (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.admission_applications(id) on delete cascade,
  sender_profile_id uuid not null references public.profiles(id) on delete cascade,
  sender_is_school boolean not null,   -- true = school staff, false = applicant
  body           text not null,
  created_at     timestamptz not null default now(),
  read_at        timestamptz
);

create index if not exists idx_admission_messages_app on public.admission_messages(application_id, created_at);

-- ---------------------------------------------------------------
-- 5. Documents (§53 - strict authorization, private storage,
--    file type/size limits, cross-school isolation).
--    The actual bytes live in the private 'admission-documents'
--    Supabase Storage bucket (created in the storage policy section
--    below), never in a public bucket, never via getPublicUrl().
-- ---------------------------------------------------------------
create table if not exists public.admission_documents (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.admission_applications(id) on delete cascade,
  document_key   text not null,        -- matches admission_settings.required_documents[].key
  file_name      text not null,
  storage_path   text not null,        -- path inside the private bucket, never a public URL
  mime_type      text not null,
  size_bytes     bigint not null,
  uploaded_by    uuid not null references public.profiles(id) on delete cascade,
  scan_status    text not null default 'pending' check (scan_status in ('pending', 'clean', 'flagged', 'skipped')),
  created_at     timestamptz not null default now(),

  constraint chk_admission_doc_size check (size_bytes > 0 and size_bytes <= 15728640), -- 15MB hard ceiling, tightened per-school via admission_settings at the API layer
  constraint chk_admission_doc_mime check (mime_type in (
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp'
  ))
);

create index if not exists idx_admission_documents_app on public.admission_documents(application_id);

comment on table public.admission_documents is
  'Metadata only. Bytes live in the private admission-documents storage bucket. mime_type/size constraints are a defense-in-depth backstop behind API-layer validation, not a replacement for it.';

-- ---------------------------------------------------------------
-- 6. Audit log entries for admission actions (§53 - "included in
--    audit logs where appropriate"). Reuses the existing
--    portal_audit_log table rather than inventing a new one.
-- ---------------------------------------------------------------
-- No new table: writes to public.portal_audit_log with
-- action = 'admission_application_viewed' | 'admission_document_downloaded' | etc.
-- action_target_id = admission_applications.id, are added at the API layer.

-- ---------------------------------------------------------------
-- 7. updated_at trigger, matching existing convention.
-- ---------------------------------------------------------------
create or replace function public.set_admission_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_admission_applications_updated_at on public.admission_applications;
create trigger trg_admission_applications_updated_at
  before update on public.admission_applications
  for each row execute function public.set_admission_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.admission_settings      enable row level security;
alter table public.admission_applications  enable row level security;
alter table public.admission_status_events enable row level security;
alter table public.admission_messages      enable row level security;
alter table public.admission_documents     enable row level security;

-- admission_settings: publicly readable ONLY where is_enabled = true
-- (needed for the public discovery/apply flow); writable only by
-- principal/secretary of that school.
drop policy if exists admission_settings_public_read on public.admission_settings;
create policy admission_settings_public_read on public.admission_settings
  for select using (is_enabled = true);

drop policy if exists admission_settings_staff_read on public.admission_settings;
create policy admission_settings_staff_read on public.admission_settings
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.school_id = admission_settings.school_id
        and p.role in ('principal', 'secretary')
    )
  );

drop policy if exists admission_settings_staff_write on public.admission_settings;
create policy admission_settings_staff_write on public.admission_settings
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.school_id = admission_settings.school_id
        and p.role in ('principal', 'secretary')
    )
  ) with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.school_id = admission_settings.school_id
        and p.role in ('principal', 'secretary')
    )
  );

-- admission_applications: an applicant sees only their own rows;
-- school staff see only rows scoped to their own school_id. No
-- policy grants cross-school access under any condition - this is
-- the enforcement point for §53's "prevent unauthorized cross-school
-- access" and §59's tenant isolation guarantee.
drop policy if exists admission_applications_applicant_read on public.admission_applications;
create policy admission_applications_applicant_read on public.admission_applications
  for select using (applicant_profile_id = auth.uid());

drop policy if exists admission_applications_applicant_write on public.admission_applications;
create policy admission_applications_applicant_write on public.admission_applications
  for insert with check (applicant_profile_id = auth.uid());

drop policy if exists admission_applications_applicant_update_draft on public.admission_applications;
create policy admission_applications_applicant_update_draft on public.admission_applications
  for update using (applicant_profile_id = auth.uid() and status = 'draft')
  with check (applicant_profile_id = auth.uid());

-- SECURITY: the policy above only checks ROW OWNERSHIP, not the VALUES
-- being written. RLS's WITH CHECK can't do column-level restriction, so
-- on its own that policy would let an applicant call the Supabase
-- client directly (bypassing the app's API route entirely) and set
-- their own row to status = 'accepted', or write arbitrary
-- decision_notes/reviewed_by/interview_at - while the row still
-- satisfies "status = 'draft'" in the USING clause at read time. This
-- is a real self-decision vulnerability, not a theoretical one: found
-- during the adversarial review pass before this went out. Closed here
-- with a trigger, which is the correct layer for value-level
-- restriction and applies no matter which client/path performs the
-- write (session client, direct table call, any future API route).
create or replace function public.guard_applicant_admission_update()
returns trigger as $$
begin
  if auth.uid() = old.applicant_profile_id then
    if old.status <> 'draft' then
      raise exception 'This application has already been submitted and can no longer be edited.';
    end if;
    if new.status not in ('draft', 'submitted') then
      raise exception 'Applicants cannot set this application status directly.';
    end if;
    -- Silently pin every staff-only field back to its prior value
    -- rather than rejecting the whole update - an applicant's own edit
    -- to applicant_name/class_applying_for/form_responses should still
    -- go through even if the payload also (accidentally or otherwise)
    -- included fields they have no business setting.
    new.reviewed_by      := old.reviewed_by;
    new.reviewed_at      := old.reviewed_at;
    new.decision_notes   := old.decision_notes;
    new.interview_at     := old.interview_at;
    new.assessment_at    := old.assessment_at;
    new.school_id        := old.school_id;
    new.applicant_profile_id := old.applicant_profile_id;
    new.migrated_from    := old.migrated_from;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_guard_applicant_admission_update on public.admission_applications;
create trigger trg_guard_applicant_admission_update
  before update on public.admission_applications
  for each row execute function public.guard_applicant_admission_update();

drop policy if exists admission_applications_staff_read on public.admission_applications;
create policy admission_applications_staff_read on public.admission_applications
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.school_id = admission_applications.school_id
        and p.role in ('principal', 'secretary')
    )
  );

drop policy if exists admission_applications_staff_update on public.admission_applications;
create policy admission_applications_staff_update on public.admission_applications
  for update using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.school_id = admission_applications.school_id
        and p.role in ('principal', 'secretary')
    )
  ) with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.school_id = admission_applications.school_id
        and p.role in ('principal', 'secretary')
    )
  );

-- admission_status_events: readable by the applicant who owns the
-- parent application, or staff of that application's school. Never
-- writable directly by the applicant - status transitions happen
-- only through the API layer using the service role, so a malicious
-- applicant can't fabricate an "accepted" event for themselves.
drop policy if exists admission_status_events_read on public.admission_status_events;
create policy admission_status_events_read on public.admission_status_events
  for select using (
    exists (
      select 1 from public.admission_applications a
      where a.id = admission_status_events.application_id
        and (
          a.applicant_profile_id = auth.uid()
          or exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and p.school_id = a.school_id and p.role in ('principal','secretary')
          )
        )
    )
  );

-- admission_messages: both sides can read/insert on an application
-- they're party to; neither side can read the other's applications.
-- SECURITY: the insert check below verifies sender_is_school actually
-- matches which side of the conversation auth.uid() is on - without
-- this, an applicant could insert a message flagged sender_is_school =
-- true and fabricate an "official" reply inside their own thread.
-- Caught during the adversarial review pass.
drop policy if exists admission_messages_rw on public.admission_messages;
create policy admission_messages_rw on public.admission_messages
  for select using (
    exists (
      select 1 from public.admission_applications a
      where a.id = admission_messages.application_id
        and (
          a.applicant_profile_id = auth.uid()
          or exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and p.school_id = a.school_id and p.role in ('principal','secretary')
          )
        )
    )
  );

drop policy if exists admission_messages_insert on public.admission_messages;
create policy admission_messages_insert on public.admission_messages
  for insert with check (
    sender_profile_id = auth.uid()
    and exists (
      select 1 from public.admission_applications a
      where a.id = admission_messages.application_id
        and (
          (sender_is_school = false and a.applicant_profile_id = auth.uid())
          or (sender_is_school = true and exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and p.school_id = a.school_id and p.role in ('principal','secretary')
          ))
        )
    )
  );

-- admission_documents: SECURITY - this was originally a single 'for
-- all' policy with a comment claiming documents are "immutable" for
-- applicants, which was false: 'for all' grants update/delete too.
-- Caught during the adversarial review pass and split into precise
-- per-operation policies below. Also closes a second gap: the old
-- policy let an applicant insert a document METADATA row for a
-- non-draft application even though the storage-layer policy already
-- blocks the underlying file upload once submitted - a caller could
-- have pointed a metadata row at an arbitrary/stale storage path. The
-- insert policy now re-checks status = 'draft' at the table level too.
drop policy if exists admission_documents_rw on public.admission_documents;

drop policy if exists admission_documents_select on public.admission_documents;
create policy admission_documents_select on public.admission_documents
  for select using (
    exists (
      select 1 from public.admission_applications a
      where a.id = admission_documents.application_id
        and (
          a.applicant_profile_id = auth.uid()
          or exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and p.school_id = a.school_id and p.role in ('principal','secretary')
          )
        )
    )
  );

drop policy if exists admission_documents_insert on public.admission_documents;
create policy admission_documents_insert on public.admission_documents
  for insert with check (
    uploaded_by = auth.uid()
    and exists (
      select 1 from public.admission_applications a
      where a.id = admission_documents.application_id
        and a.status = 'draft'
        and (
          a.applicant_profile_id = auth.uid()
          or exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and p.school_id = a.school_id and p.role in ('principal','secretary')
          )
        )
    )
  );

-- No update/delete policy at all, for either side. A document, once
-- its metadata row exists, is genuinely immutable from every client
-- path now - removing a bad upload is a deliberate service-role/admin
-- action (staff support tooling), never a client-side RLS-governed one.

-- ============================================================
-- STORAGE: private bucket + policies for admission documents
-- ============================================================
-- Run once. If the bucket already exists this is a no-op.
insert into storage.buckets (id, name, public)
values ('admission-documents', 'admission-documents', false)
on conflict (id) do update set public = false;  -- defensive: force private even if it already existed as public

-- Storage path convention enforced by policy: <school_id>/<application_id>/<filename>
-- This lets RLS check school/application ownership straight from the
-- object path without a second lookup.

drop policy if exists admission_documents_storage_read on storage.objects;
create policy admission_documents_storage_read on storage.objects
  for select using (
    bucket_id = 'admission-documents'
    and exists (
      select 1 from public.admission_applications a
      where a.id::text = (storage.foldername(name))[2]
        and (
          a.applicant_profile_id = auth.uid()
          or exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and p.school_id = a.school_id and p.role in ('principal','secretary')
          )
        )
    )
  );

drop policy if exists admission_documents_storage_insert on storage.objects;
create policy admission_documents_storage_insert on storage.objects
  for insert with check (
    bucket_id = 'admission-documents'
    and exists (
      select 1 from public.admission_applications a
      where a.id::text = (storage.foldername(name))[2]
        and a.applicant_profile_id = auth.uid()
        and a.status = 'draft'
    )
  );

-- No update/delete policy for applicants: a document, once uploaded
-- to a submitted application, is immutable from the applicant side.
-- Staff-side deletion (e.g. removing a bad upload) goes through the
-- service-role API, not client-side storage calls.

-- ============================================================
-- MIGRATION: legacy public.admissions + public.applications ->
-- public.admission_applications
-- ============================================================
-- Wrapped so it is safe to run even if one or both legacy tables
-- don't exist in a given environment (they were created ad hoc,
-- outside migration history - see identity-appointments-schema.sql).

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'admissions') then
    insert into public.admission_applications
      (school_id, applicant_profile_id, applicant_name, applicant_email, class_applying_for, status, submitted_at, created_at, migrated_from)
    select
      a.school_id,
      -- Legacy rows were staff-entered with no linked identity. We
      -- cannot invent an applicant_profile_id that doesn't exist, so
      -- migrated rows are attributed to the reviewing secretary's
      -- profile as a placeholder owner and flagged via migrated_from
      -- for a manual follow-up pass. This keeps the NOT NULL
      -- constraint honest instead of relaxing it for everyone.
      coalesce(
        (select p.id from public.profiles p where p.school_id = a.school_id and p.role = 'secretary' limit 1),
        (select p.id from public.profiles p where p.school_id = a.school_id and p.role = 'principal' limit 1)
      ),
      a.applicant_name,
      a.applicant_email,
      a.class_applied,
      case a.status
        when 'pending' then 'submitted'
        when 'approved' then 'accepted'
        when 'rejected' then 'rejected'
        when 'waitlisted' then 'shortlisted'
        else 'submitted'
      end,
      a.applied_at,
      a.applied_at,
      'legacy_admissions:' || a.id::text
    from public.admissions a
    where not exists (
      select 1 from public.admission_applications x where x.migrated_from = 'legacy_admissions:' || a.id::text
    )
    and exists (
      select 1 from public.profiles p where p.school_id = a.school_id and p.role in ('secretary','principal')
    );
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'applications') then
    insert into public.admission_applications
      (school_id, applicant_profile_id, applicant_name, class_applying_for, status, decision_notes, created_at, migrated_from)
    select
      ap.school_id,
      coalesce(
        (select p.id from public.profiles p where p.school_id = ap.school_id and p.role = 'secretary' limit 1),
        (select p.id from public.profiles p where p.school_id = ap.school_id and p.role = 'principal' limit 1)
      ),
      ap.applicant_name,
      ap.class_applying_for,
      case ap.status
        when 'pending' then 'submitted'
        when 'admitted' then 'accepted'
        when 'rejected' then 'rejected'
        else 'submitted'
      end,
      ap.notes,
      ap.created_at,
      'legacy_applications:' || ap.id::text
    from public.applications ap
    where not exists (
      select 1 from public.admission_applications x where x.migrated_from = 'legacy_applications:' || ap.id::text
    )
    and exists (
      select 1 from public.profiles p where p.school_id = ap.school_id and p.role in ('secretary','principal')
    );
  end if;
end $$;

-- Legacy tables are intentionally NOT dropped here. Drop them in a
-- follow-up migration only after confirming the Secretary UI has
-- been repointed at admission_applications and the migrated rows
-- above have been spot-checked - dropping now would be irreversible
-- against production data on a first pass.
