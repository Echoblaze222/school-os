-- ============================================================
-- Lane F — Student Leadership, Boarding Student, context switcher
-- Sections 7, 8, 15, 22, 23.
--
-- Depends on Phase 1's appointment schema and Lane E1's hostel schema
-- (reuses hostel_bed_assignments and hostel_roll_call_entries directly
-- for the Boarding Student dashboard — no parallel tables).
-- ============================================================

-- ---------------------------------------------------------------
-- 1. Remaining §7 leadership positions. Phase 1 already seeded
--    head_boy, head_girl, class_prefect, hostel_prefect — adding the
--    rest of §7's example list here rather than duplicating those four.
-- ---------------------------------------------------------------
insert into public.appointment_types (id, label, category, base_role_scope) values
  ('deputy_head_boy',   'Deputy Headboy',       'student_leadership', array['student']),
  ('deputy_head_girl',  'Deputy Head Girl',     'student_leadership', array['student']),
  ('senior_prefect',    'Senior Prefect',       'student_leadership', array['student']),
  ('house_captain',     'House Captain',        'student_leadership', array['student']),
  ('house_vice_captain','House Vice Captain',   'student_leadership', array['student']),
  ('academic_prefect',  'Academic Prefect',     'student_leadership', array['student']),
  ('sports_prefect',    'Sports Prefect',       'student_leadership', array['student']),
  ('health_prefect',    'Health Prefect',       'student_leadership', array['student']),
  ('library_prefect',   'Library Prefect',      'student_leadership', array['student']),
  ('press_prefect',     'Press/Media Prefect',  'student_leadership', array['student']),
  ('sanitation_prefect','Sanitation Prefect',   'student_leadership', array['student']),
  ('social_prefect',    'Social Prefect',       'student_leadership', array['student'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------
-- 2. Leadership duties. §7 asks for "assigned duties, duty completion,
--    escalation to staff" per leadership dashboard. Announcements reuse
--    the EXISTING `announcements` table (audience: 'all'|'students') —
--    no parallel announcements table here. A duty is different in kind
--    (assigned to one appointment, has a completion state), so it gets
--    its own table.
-- ---------------------------------------------------------------
create table if not exists public.leadership_duties (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references public.schools(id) on delete cascade,
  appointment_id  uuid not null references public.appointments(id) on delete cascade,
  title           text not null,
  description     text,
  due_date        date,
  status          text not null default 'pending' check (status in ('pending','done','escalated')),
  assigned_by     uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  completed_at    timestamptz,
  escalated_at    timestamptz,
  escalation_note text
);

create index if not exists idx_leadership_duties_appointment on public.leadership_duties(appointment_id);
create index if not exists idx_leadership_duties_school on public.leadership_duties(school_id, status);

alter table public.leadership_duties enable row level security;

-- The appointment holder sees their own duties; staff who assigned duties
-- (or principal/secretary) see duties at their school for oversight.
create policy leadership_duties_own_or_staff on public.leadership_duties
  for select using (
    appointment_id in (select id from public.appointments where profile_id = auth.uid())
    or
    school_id in (select school_id from public.profiles where id = auth.uid() and role in ('principal','secretary','teacher'))
  );

comment on table public.leadership_duties is
  'One row per assigned duty per appointment. "Escalation to staff" (§7) is the escalated status + escalation_note, not a separate table.';
