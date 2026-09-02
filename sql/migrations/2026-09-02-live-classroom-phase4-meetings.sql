-- ============================================================================
-- SchoolOS — Live Classroom, Phase 4: embed LiveKit into online_meetings
-- ============================================================================
-- Corrects an earlier version of this phase that created a new, parallel
-- `school_meetings` table without knowing SchoolOS already has a full
-- meetings feature: `online_meetings` (title, description, meeting_url,
-- target_audience, target_class_id, meeting_type, location, agenda,
-- school_id, created_by), with existing UI across six roles (principal
-- creates; teacher/parent/student/bursar/secretary each have their own
-- filtered read-only list). This migration does to `online_meetings`
-- exactly what the Phase 0 migration did to `online_classes`: adds
-- LiveKit columns additively, closes a missing-RLS gap, and leaves the
-- existing external-link (`meeting_url`) flow completely untouched.
--
-- Audience model (from the existing app code, not invented here):
--   target_audience = 'all_parents'   -> role = 'parent'
--   target_audience = 'all_teachers'  -> role = 'teacher'
--   target_audience = 'all_staff'     -> role in
--     ('teacher','principal','bursar','secretary','admin') — confirmed
--     from the existing teacher meetings page query, which includes
--     'all_staff' alongside 'all_teachers': 'all_staff' is NOT the
--     narrower is_staff() set used elsewhere in this codebase, it means
--     everyone employed, teachers included.
--   target_audience = 'specific_class' + target_class_id ->
--     student in that class (student_profiles.class_id), OR a parent
--     whose child (profiles.parent_id) is in that class.
--
-- Idempotent: safe to run more than once.
-- ============================================================================

alter table public.online_meetings
  add column if not exists provider text not null default 'external_link'
    check (provider in ('external_link', 'livekit')),
  add column if not exists livekit_room_name text unique,
  add column if not exists active_egress_id text,
  add column if not exists is_live boolean not null default false,
  add column if not exists started_at timestamp with time zone,
  add column if not exists ended_at timestamp with time zone,
  add column if not exists locked_at timestamp with time zone,
  -- target_class_id: added defensively (IF NOT EXISTS), not assumed to
  -- already exist. It's present in the sql/s.sql schema snapshot this
  -- project ships, but PrincipalMeetingsClient.tsx's own create-meeting
  -- code has a comment stating it was removed from the live database and
  -- explicitly omits it from the INSERT ("target_class_id column removed
  -- - doesn't exist in DB schema"). That comment is the more reliable
  -- signal about the actual production schema — code that hit a real
  -- error beats a snapshot that may be stale, same lesson as this
  -- project's earlier `classes.name` discrepancy. Adding it back here
  -- (IF NOT EXISTS, so this is a no-op if it turns out to already be
  -- there) is required for 'specific_class' meetings — both the
  -- pre-existing audience-targeting feature and the new LiveKit
  -- authorization added by this migration depend on it having a real
  -- value, which it currently never gets (see the PrincipalMeetingsClient
  -- fix that accompanies this migration).
  add column if not exists target_class_id uuid references public.classes(id);

comment on column public.online_meetings.provider is
  'external_link = organizer-pasted Zoom/Meet URL (original behavior, untouched). livekit = embedded video, added Phase 4.';

alter table public.online_meetings enable row level security;
-- Previously had NO RLS policy at all (confirmed absent from both
-- sql/s.sql and SECURITY_RLS_AUDIT_AND_POLICIES.sql during this
-- migration's authoring) — same gap online_classes had before Phase 0,
-- closed here for the same reason: this table is about to carry more
-- sensitive data (who's allowed into a live room) than a scheduling
-- record alone.

-- SELECT: same-school AND audience-appropriate, mirroring the filtering
-- logic each role's page.tsx already does client-query-side today — this
-- makes that filtering DB-enforced too (defense in depth), not a
-- replacement for it; the existing per-role queries keep working exactly
-- as before, RLS just adds a backstop under them.
drop policy if exists "online_meetings_select_audience" on public.online_meetings;
create policy "online_meetings_select_audience" on public.online_meetings
  for select
  using (
    school_id = public.my_school_id()
    and (
      (target_audience = 'all_parents' and public.my_role() = 'parent')
      or (target_audience = 'all_teachers' and public.my_role() = 'teacher')
      or (target_audience = 'all_staff' and public.my_role() in ('teacher', 'principal', 'bursar', 'secretary', 'admin'))
      or (
        target_audience = 'specific_class'
        and (
          -- student in that class
          exists (
            select 1 from public.student_profiles sp
            where sp.id = auth.uid() and sp.class_id = online_meetings.target_class_id
          )
          -- parent whose child is in that class
          or exists (
            select 1 from public.student_profiles sp
            join public.profiles p on p.id = sp.id
            where p.parent_id = auth.uid() and sp.class_id = online_meetings.target_class_id
          )
        )
      )
      or public.my_role() = 'principal' -- principal can always see every meeting in their own school, matching the class-model precedent (Phase 0: principal always gets host on any class session)
    )
  );

-- INSERT/UPDATE: staff-authored today (only the principal's UI creates
-- meetings), but written against is_staff() rather than principal-only —
-- narrower than what the UI currently exposes, wider than nothing. If
-- secretary/bursar UI for creating meetings is added later, the DB
-- already permits it; until then it's simply unused by the app, not a
-- gap the app relies on the DB to close.
drop policy if exists "online_meetings_insert_staff" on public.online_meetings;
create policy "online_meetings_insert_staff" on public.online_meetings
  for insert
  with check (school_id = public.my_school_id() and public.is_staff());

drop policy if exists "online_meetings_update_staff" on public.online_meetings;
create policy "online_meetings_update_staff" on public.online_meetings
  for update
  using (school_id = public.my_school_id() and public.is_staff())
  with check (school_id = public.my_school_id() and public.is_staff());

-- Same room-tamper-prevention trigger as online_classes (Phase 0).
create or replace function public.prevent_online_meeting_room_tamper()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.livekit_room_name is not null
     and new.livekit_room_name is distinct from old.livekit_room_name then
    raise exception 'livekit_room_name cannot be changed once set.';
  end if;
  if new.school_id is distinct from old.school_id then
    raise exception 'Changing school_id on an online_meetings row is not permitted.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_online_meeting_room_tamper on public.online_meetings;
create trigger trg_prevent_online_meeting_room_tamper
  before update on public.online_meetings
  for each row
  execute function public.prevent_online_meeting_room_tamper();

-- Recordings reuse class_recordings (Phase 0/2), same as the corrected
-- design's reasoning — it's already a generic pointer table. Add a
-- nullable online_meeting_id alongside online_class_id, exactly one set.
alter table public.class_recordings
  add column if not exists online_meeting_id uuid references public.online_meetings(id);

alter table public.class_recordings
  alter column online_class_id drop not null;

alter table public.class_recordings
  drop constraint if exists class_recordings_exactly_one_parent;
alter table public.class_recordings
  add constraint class_recordings_exactly_one_parent
  check (
    (online_class_id is not null and online_meeting_id is null)
    or (online_class_id is null and online_meeting_id is not null)
  );

create index if not exists class_recordings_online_meeting_id_idx
  on public.class_recordings (online_meeting_id);
