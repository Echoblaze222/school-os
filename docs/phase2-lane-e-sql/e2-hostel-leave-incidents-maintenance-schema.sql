-- ============================================================
-- Lane E2: Hostel Leave (§18), Incidents (§19), Maintenance (§20),
-- Parent Connection (§21), Phone Policy (§16)
--
-- Depends on Phase 1's appointment schema and Lane E1's hostel schema.
-- Parent notifications reuse the EXISTING notifyUser() helper and
-- `notifications` table: nothing new invented for delivery, only for
-- the hostel-specific records that trigger it.
-- ============================================================

-- ---------------------------------------------------------------
-- 0. §16 phone policy: per-hostel config, not global, since different
--    hostels at the same school can reasonably differ (e.g. a junior vs
--    senior boarding house).
-- ---------------------------------------------------------------
alter table public.hostels add column if not exists phone_policy text
  not null default 'not_allowed'
  check (phone_policy in ('not_allowed', 'allowed', 'allowed_hours', 'allowed_groups'));
alter table public.hostels add column if not exists phone_policy_hours text; -- free text, e.g. "6:00pm-8:00pm"
alter table public.hostels add column if not exists phone_policy_groups text[]; -- e.g. appointment_type ids or class levels, school-defined

comment on column public.hostels.phone_policy is
  'Display-only config per §16: "do not invent enforcement mechanisms that require unsupported device surveillance." The boarding dashboard reads and shows this; nothing here polices device usage.';

-- ---------------------------------------------------------------
-- 1. Leave management (§18)
-- ---------------------------------------------------------------
create table if not exists public.hostel_leave_requests (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools(id) on delete cascade,
  hostel_id         uuid not null references public.hostels(id) on delete cascade,
  student_id        uuid not null references public.profiles(id) on delete cascade,

  reason            text not null,
  is_emergency      boolean not null default false,
  destination        text,
  departure_expected  timestamptz not null,
  return_expected     timestamptz not null,

  status            text not null default 'pending'
                     check (status in ('pending','approved','rejected','cancelled')),
  reviewed_by       uuid references public.profiles(id),
  reviewed_at       timestamptz,
  rejection_reason  text,

  departure_actual  timestamptz,
  return_actual     timestamptz,
  -- computed at read-time in the API as (return_actual is not null and
  -- return_actual > return_expected), not stored, so it can never drift
  -- from the two source timestamps it's derived from.

  cancelled_at      timestamptz,
  cancelled_by      uuid references public.profiles(id),

  created_at        timestamptz not null default now()
);

create index if not exists idx_leave_requests_student on public.hostel_leave_requests(student_id);
create index if not exists idx_leave_requests_hostel_status on public.hostel_leave_requests(hostel_id, status);

-- Audit history (§18: "audit history"): every status transition, not
-- just the current state, append-only.
create table if not exists public.hostel_leave_request_events (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references public.hostel_leave_requests(id) on delete cascade,
  event_type   text not null, -- 'submitted' | 'approved' | 'rejected' | 'cancelled' | 'departure_recorded' | 'return_recorded'
  actor_id     uuid references public.profiles(id),
  note         text,
  created_at   timestamptz not null default now()
);

alter table public.hostel_leave_requests       enable row level security;
alter table public.hostel_leave_request_events enable row level security;

create policy leave_requests_own_or_staff on public.hostel_leave_requests
  for select using (
    student_id = auth.uid()
    or
    hostel_id in (
      select h.id from public.hostels h
      where h.school_id in (
        select a.school_id from public.appointments a
        where a.profile_id = auth.uid()
          and a.appointment_type in ('warden','assistant_warden','house_parent','hostel_administrator')
          and a.status = 'active'
      )
    )
    or
    hostel_id in (
      select h.id from public.hostels h
      where h.school_id in (select school_id from public.profiles where id = auth.uid() and role in ('principal','secretary'))
    )
  );

create policy leave_events_via_request on public.hostel_leave_request_events
  for select using (
    request_id in (select id from public.hostel_leave_requests) -- filtered by the base table's own policy on join
  );

-- ---------------------------------------------------------------
-- 2. Incident management (§19): restricted visibility by design.
-- ---------------------------------------------------------------
create table if not exists public.hostel_incidents (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references public.schools(id) on delete cascade,
  hostel_id      uuid not null references public.hostels(id) on delete cascade,

  student_id     uuid references public.profiles(id) on delete set null, -- primary student involved, if any
  location       text,
  occurred_at    timestamptz not null default now(),
  incident_type  text not null, -- school-configured free text, e.g. 'altercation', 'property_damage', 'health'
  description    text not null,
  people_involved jsonb not null default '[]'::jsonb, -- [{ profileId, role }]: kept generic since involvement isn't always a profile with an account
  witnesses       jsonb not null default '[]'::jsonb,

  action_taken   text,
  status         text not null default 'open' check (status in ('open','escalated','resolved')),
  resolution     text,
  resolved_at    timestamptz,
  resolved_by    uuid references public.profiles(id),

  -- §21: "authorized incident notifications": explicit, staff-triggered
  -- opt-in per incident, never automatic. Keeps the raw `description`
  -- (which may contain sensitive detail) from ever being the source text
  -- of a parent-facing message; the API sends a fixed, safe template
  -- instead, only when a staff member explicitly triggers it.
  parent_notified_at timestamptz,
  parent_notified_by uuid references public.profiles(id),

  reported_by    uuid references public.profiles(id),
  created_at     timestamptz not null default now()
);

create table if not exists public.hostel_incident_attachments (
  id           uuid primary key default gen_random_uuid(),
  incident_id  uuid not null references public.hostel_incidents(id) on delete cascade,
  file_url     text not null,
  file_name    text,
  uploaded_by  uuid references public.profiles(id),
  uploaded_at  timestamptz not null default now()
);

create table if not exists public.hostel_incident_events (
  id           uuid primary key default gen_random_uuid(),
  incident_id  uuid not null references public.hostel_incidents(id) on delete cascade,
  event_type   text not null, -- 'reported' | 'escalated' | 'resolved' | 'note_added'
  actor_id     uuid references public.profiles(id),
  note         text,
  created_at   timestamptz not null default now()
);

alter table public.hostel_incidents            enable row level security;
alter table public.hostel_incident_attachments enable row level security;
alter table public.hostel_incident_events      enable row level security;

-- §19: "Do not expose sensitive incident records to ordinary students or
-- prefects." No self-access branch here at all, unlike leave/roll-call :
-- hostel staff (warden tier) and principal/secretary only. A prefect
-- appointment is never in this list, deliberately.
create policy incidents_hostel_staff_only on public.hostel_incidents
  for select using (
    hostel_id in (
      select h.id from public.hostels h
      where h.school_id in (
        select a.school_id from public.appointments a
        where a.profile_id = auth.uid()
          and a.appointment_type in ('warden','assistant_warden','house_parent','hostel_administrator')
          and a.status = 'active'
      )
    )
    or
    hostel_id in (
      select h.id from public.hostels h
      where h.school_id in (select school_id from public.profiles where id = auth.uid() and role in ('principal','secretary'))
    )
  );

create policy incident_attachments_via_incident on public.hostel_incident_attachments
  for select using (incident_id in (select id from public.hostel_incidents));

create policy incident_events_via_incident on public.hostel_incident_events
  for select using (incident_id in (select id from public.hostel_incidents));

-- ---------------------------------------------------------------
-- 3. Maintenance (§20). `assigned_to_profile_id` is a plain nullable FK
--    to profiles rather than a hard dependency on a specific ICT
--    ticket-system table, since Lane D's exact schema wasn't visible to
--    this lane: see README for the integration note.
-- ---------------------------------------------------------------
create table if not exists public.hostel_maintenance_requests (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references public.schools(id) on delete cascade,
  hostel_id       uuid not null references public.hostels(id) on delete cascade,
  room_id         uuid references public.hostel_rooms(id) on delete set null,

  issue_type      text not null, -- 'broken_fan' | 'damaged_bed' | 'leaking_pipe' | 'electrical' | 'broken_light' | 'damaged_door' | 'plumbing' | 'other'
  description     text not null,
  status          text not null default 'open' check (status in ('open','in_progress','resolved')),

  reported_by     uuid references public.profiles(id),
  assigned_to_profile_id uuid references public.profiles(id),

  -- If Lane D's ICT/asset helpdesk ships a ticket table, link it here
  -- rather than duplicating status tracking in two places.
  ict_ticket_id   uuid,

  resolved_at     timestamptz,
  resolution_note text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_maintenance_hostel_status on public.hostel_maintenance_requests(hostel_id, status);

alter table public.hostel_maintenance_requests enable row level security;

create policy maintenance_hostel_staff on public.hostel_maintenance_requests
  for select using (
    hostel_id in (
      select h.id from public.hostels h
      where h.school_id in (
        select a.school_id from public.appointments a
        where a.profile_id = auth.uid()
          and a.appointment_type in ('warden','assistant_warden','house_parent','hostel_administrator')
          and a.status = 'active'
      )
    )
    or
    hostel_id in (
      select h.id from public.hostels h
      where h.school_id in (select school_id from public.profiles where id = auth.uid() and role in ('principal','secretary'))
    )
    or
    assigned_to_profile_id = auth.uid()
  );

-- Note: all writes to every table above go through service-role API
-- routes that independently re-verify the caller's appointment, same
-- pattern as Lane E1: these SELECT policies are the browser-facing
-- floor, not the only check.
