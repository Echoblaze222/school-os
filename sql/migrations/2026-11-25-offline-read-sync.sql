-- SchoolOS offline read-side sync foundation
-- Target project: "school portal" (hgoasuqnuhltxocbcjnr)
-- Idempotent: safe to run twice. Adds columns, triggers, indexes and one new table;
-- no existing data is changed. The app code ships dark behind
-- NEXT_PUBLIC_OFFLINE_READ_SYNC=1: apply this migration BEFORE turning the flag on.
-- (Revision 2: profiles tombstones, NULL school_id guard, idempotent policy, 90-day prune.)
--
-- Why: the app can only pull "rows changed since last sync" if every synced table has
-- a server-maintained updated_at, and can only remove deleted rows locally if deletions
-- are recorded (Realtime does not apply RLS to DELETE events, and a deleted row is
-- simply absent from a normal select).
--
-- Reuses the existing public.set_updated_at() trigger function.
-- All synced tables below have a uuid "id" primary key and a uuid "school_id" (verified).

-- ---------------------------------------------------------------------------
-- 1. updated_at + trigger + (school_id, updated_at) index
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  synced text[] := array[
    'attendance',
    'classes',
    'subjects',
    'results',
    'assignments',
    'announcements',
    'timetable',
    'school_notes',
    'school_terms',
    'syllabus',
    'syllabus_topics',
    'quizzes',
    'events',
    'school_events',
    'meetings',
    'behaviour_records',
    'library_loans'
  ];
begin
  foreach t in array synced loop
    -- Existing rows get now() once; the first client sync is a full pull anyway.
    execute format(
      'alter table public.%I add column if not exists updated_at timestamptz not null default now()', t);

    execute format('drop trigger if exists trg_%s_set_updated_at on public.%I', t, t);
    execute format(
      'create trigger trg_%s_set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t, t);

    execute format(
      'create index if not exists idx_%s_school_updated on public.%I (school_id, updated_at, id)', t, t);
  end loop;
end $$;

-- Already have updated_at (index only, so delta pulls are cheap):
create index if not exists idx_class_teachers_school_updated on public.class_teachers (school_id, updated_at, id);
create index if not exists idx_library_books_school_updated  on public.library_books  (school_id, updated_at, id);
create index if not exists idx_profiles_school_updated       on public.profiles       (school_id, updated_at, id);

-- ---------------------------------------------------------------------------
-- 2. Deletion tombstones
-- ---------------------------------------------------------------------------
create table if not exists public.sync_deletions (
  id          bigint generated always as identity primary key,
  table_name  text        not null,
  row_id      uuid        not null,
  school_id   uuid        not null,
  deleted_at  timestamptz not null default now()
);

create index if not exists idx_sync_deletions_school_time
  on public.sync_deletions (school_id, deleted_at, id);

alter table public.sync_deletions enable row level security;

-- Read-only for clients, same school only. No insert/update/delete policy on purpose:
-- only the SECURITY DEFINER trigger below can write.
drop policy if exists sync_deletions_select_same_school on public.sync_deletions;
create policy sync_deletions_select_same_school
  on public.sync_deletions for select to authenticated
  using (school_id = (select public.my_school_id()));

create or replace function public.record_sync_deletion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Rows without a school can't be scoped to any reader (and school_id is NOT NULL here),
  -- so they are skipped instead of making the DELETE itself fail. A device that still
  -- holds such a row drops it at its next full re-pull (at most every 80 days).
  if old.school_id is not null then
    insert into public.sync_deletions (table_name, row_id, school_id)
    values (tg_table_name, old.id, old.school_id);
  end if;
  return old;
end;
$$;

revoke all on function public.record_sync_deletion() from public, anon, authenticated;

do $$
declare
  t text;
  synced text[] := array[
    'attendance','classes','subjects','results','assignments','announcements',
    'timetable','school_notes','school_terms','syllabus','syllabus_topics',
    'quizzes','events','school_events','meetings','behaviour_records','library_loans',
    'class_teachers','library_books','profiles'
  ];
begin
  foreach t in array synced loop
    execute format('drop trigger if exists trg_%s_record_deletion on public.%I', t, t);
    execute format(
      'create trigger trg_%s_record_deletion after delete on public.%I
         for each row execute function public.record_sync_deletion()', t, t);
  end loop;
end $$;

-- Tombstones older than 90 days are useless: the app does a full re-pull instead of a delta
-- for a device that has been away longer than 80 days. Prune daily when pg_cron exists.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'prune-sync-deletions';
    perform cron.schedule(
      'prune-sync-deletions', '17 3 * * *',
      $cron$delete from public.sync_deletions where deleted_at < now() - interval '90 days'$cron$);
  else
    raise notice 'pg_cron not installed: prune sync_deletions older than 90 days some other way';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. NOT in this migration (needs your decision)
-- ---------------------------------------------------------------------------
-- student_profiles, class_subjects, assignment_submissions, parent_student_links,
-- teacher_profiles have NO school_id, so they cannot be scoped or tombstoned the same
-- way. Options: (a) add a school_id column and backfill it, or (b) sync them through
-- a security-definer RPC that returns the caller's slice. Option (a) is simpler.
--
-- NEVER synced to devices (stay online-only): payments, payment_invoices, fee_*,
-- subscriptions*, counseling_*, student_medical_records, student_health_profiles,
-- medication_administrations, profile_secrets, access_codes, ai_*, platform_admins,
-- idempotency_keys, rate_limit_attempts.
