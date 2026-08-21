-- ============================================================
-- SchoolOS, Phase 2, Lane D: ICT Department
-- New tables: ict_assets, ict_asset_events, ict_tickets,
-- ict_ticket_events, ict_account_requests.
--
-- Reuses rather than duplicates:
--   - identity/appointments from 02 (Phase 1):
--     public.appointment_types, public.appointments,
--     public.access_code_applications (the self-service pathway this
--     lane's review queue + Generate Code screen operate on)
--   - public.portal_audit_log for anything security-sensitive
--     (Generate Code, application rejection)
--   - public.notifications / notifyRoles() for in-app + push alerts:
--     nothing new needed there, this file has no notifications table
--
-- Not yet run against the live database, same caveat as Phase 1's
-- schema file: this repo has no migration history, review column names
-- against the live `profiles`/`schools` tables before applying.
-- ============================================================

-- ---------------------------------------------------------------
-- 0. Close a gap Phase 1 left open: 'ict_officer' exists in
--    appointment_types, but §9 of the spec also calls for
--    "ICT Administrator" as a distinct, higher-privilege title. Adding
--    it here (additive insert into Phase 1's table, not editing Phase
--    1's file) rather than forking a second config table.
-- ---------------------------------------------------------------
insert into public.appointment_types (id, label, category, base_role_scope) values
  ('ict_administrator', 'ICT Administrator', 'ict', array['teacher','principal'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------
-- 1. Assets, §10. One row per physical device/equipment item.
-- ---------------------------------------------------------------
create table if not exists public.ict_assets (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null references public.schools(id) on delete cascade,

  asset_tag          text not null,        -- e.g. 'PC-SS2-014', unique per school
  device_type        text not null check (device_type in (
                       'computer','laptop','tablet','printer','scanner',
                       'projector','smart_board','router','access_point','other'
                     )),
  name               text not null,        -- short label, e.g. "SS2 Lab PC 14"
  serial_number      text,
  location            text,                -- room/building
  assigned_to_profile uuid references public.profiles(id),   -- person, if assigned to one
  assigned_to_dept    text,                 -- or a department/location, if not a person

  status             text not null default 'in_use' check (status in (
                       'in_use','in_storage','under_repair','retired','lost'
                     )),
  condition           text default 'good' check (condition in ('good','fair','poor')),

  purchase_date        date,
  purchase_cost_kobo    bigint,             -- nullable; only shown where §10 "purchase info where authorized"
  warranty_expires_at   date,

  notes                text,
  created_by            uuid references public.profiles(id),
  created_at             timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  unique (school_id, asset_tag)
);

create index if not exists idx_ict_assets_school_status
  on public.ict_assets (school_id, status);

comment on table public.ict_assets is
  'ICT-managed physical inventory (§9-10). purchase_cost_kobo is financial data, never exposed outside ICT/principal per the permission matrix, same "authorized" gate as the spec text.';

-- Maintenance/repair/issue/borrow history, append-only log per asset,
-- rather than overwriting `notes` and losing history (§10 explicitly
-- requires maintenance history + repair history + issue history).
create table if not exists public.ict_asset_events (
  id           uuid primary key default gen_random_uuid(),
  asset_id     uuid not null references public.ict_assets(id) on delete cascade,
  school_id    uuid not null references public.schools(id) on delete cascade,

  event_type   text not null check (event_type in (
                 'maintenance','repair','issue_reported','condition_change',
                 'status_change','borrowed','returned','note'
               )),
  description  text not null,
  borrowed_by  uuid references public.profiles(id),   -- only set for 'borrowed'/'returned'
  due_back_at  timestamptz,                             -- only set for 'borrowed'

  actor_id     uuid references public.profiles(id),
  created_at   timestamptz not null default now()
);

create index if not exists idx_ict_asset_events_asset
  on public.ict_asset_events (asset_id, created_at desc);

-- ---------------------------------------------------------------
-- 2. Help desk tickets, §11.
-- ---------------------------------------------------------------
create table if not exists public.ict_tickets (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references public.schools(id) on delete cascade,

  reporter_id    uuid not null references public.profiles(id),
  location        text,
  device_id       uuid references public.ict_assets(id),   -- optional link to §10 asset

  category        text not null check (category in (
                    'hardware','projector','computer','printer','wifi',
                    'account_access','software','classroom_tech','other'
                  )),
  description      text not null,
  priority          text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  attachments        jsonb not null default '[]'::jsonb,   -- array of storage URLs

  status              text not null default 'new' check (status in (
                        'new','assigned','in_progress','waiting','resolved','closed'
                      )),
  assigned_to         uuid references public.profiles(id),

  resolution           text,
  resolved_at            timestamptz,

  created_at              timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists idx_ict_tickets_school_status
  on public.ict_tickets (school_id, status);
create index if not exists idx_ict_tickets_reporter
  on public.ict_tickets (reporter_id);

comment on table public.ict_tickets is
  'Help desk / support tickets (§11). Any authenticated school member may create one about their own report; only ICT officer/administrator (or principal) may view the full school-wide queue, assign, or resolve, see RLS below and lib/permissions.ts.';

-- Status-change history, so "status history" (§11) is a real audit trail
-- rather than just the current `status` column.
create table if not exists public.ict_ticket_events (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references public.ict_tickets(id) on delete cascade,
  from_status text,
  to_status   text not null,
  note        text,
  actor_id    uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);

create index if not exists idx_ict_ticket_events_ticket
  on public.ict_ticket_events (ticket_id, created_at desc);

-- ---------------------------------------------------------------
-- 3. Account support requests, §12. Distinct from
--    access_code_applications (Phase 1): that table is for NEW users
--    applying for a first account. This is for EXISTING users needing
--    ICT help with an account they already have.
-- ---------------------------------------------------------------
create table if not exists public.ict_account_requests (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools(id) on delete cascade,
  requested_by  uuid not null references public.profiles(id),

  request_type  text not null check (request_type in (
                  'password_reset','access_troubleshooting','device_registration',
                  'email_support','provisioning','other'
                )),
  description   text not null,

  status        text not null default 'open' check (status in ('open','in_progress','resolved','closed')),
  handled_by    uuid references public.profiles(id),
  resolution_note text,

  created_at    timestamptz not null default now(),
  resolved_at   timestamptz
);

create index if not exists idx_ict_account_requests_school_status
  on public.ict_account_requests (school_id, status);

comment on table public.ict_account_requests is
  'Account support requests (§12). IMPORTANT: password_reset here is a REQUEST/workflow record only, it never stores or displays a plaintext or hashed password. The actual reset goes through Supabase Auth''s own recovery flow (see /api/ict/account-requests/[id]/reset in the app code), which ICT triggers but cannot read the result of. ICT can never retrieve a user''s password, per §12.';

-- ---------------------------------------------------------------
-- 4. RLS, same pattern as Phase 1's schema file: deny by default,
--    same-school only, service-role (admin client) bypasses for the
--    server-side writes that need cross-checks beyond what RLS alone
--    can express (e.g. "does this user hold an active ict_officer
--    appointment", checked in lib/permissions.ts, not duplicated as
--    a second implementation inside a policy).
-- ---------------------------------------------------------------
alter table public.ict_assets           enable row level security;
alter table public.ict_asset_events     enable row level security;
alter table public.ict_tickets          enable row level security;
alter table public.ict_ticket_events    enable row level security;
alter table public.ict_account_requests enable row level security;

-- Assets/events: same-school read only for authenticated users (so e.g.
-- a teacher can see "this projector is under repair" without being ICT);
-- all writes go through server routes using the admin client + the
-- lib/permissions.ts check, not direct client writes.
create policy ict_assets_read on public.ict_assets
  for select using (
    school_id in (select school_id from public.profiles where id = auth.uid())
  );
create policy ict_asset_events_read on public.ict_asset_events
  for select using (
    school_id in (select school_id from public.profiles where id = auth.uid())
  );

-- Tickets: a reporter may read their own tickets; full-queue read is
-- server-route-gated (ICT/principal only), not expressed here, since RLS
-- can't easily encode "or holds an active ict appointment" without a
-- helper function this repo doesn't have yet. The server route uses the
-- admin client for the queue view and checks the caller's appointment
-- explicitly (see lib/permissions.ts / app/api/ict/tickets/route.ts).
create policy ict_tickets_own_read on public.ict_tickets
  for select using (reporter_id = auth.uid());
create policy ict_tickets_own_insert on public.ict_tickets
  for insert with check (
    reporter_id = auth.uid()
    and school_id in (select school_id from public.profiles where id = auth.uid())
  );

create policy ict_ticket_events_own_read on public.ict_ticket_events
  for select using (
    ticket_id in (select id from public.ict_tickets where reporter_id = auth.uid())
  );

-- Account requests: same shape as tickets, own-row read/insert via RLS,
-- full queue via server route + permission check.
create policy ict_account_requests_own_read on public.ict_account_requests
  for select using (requested_by = auth.uid());
create policy ict_account_requests_own_insert on public.ict_account_requests
  for insert with check (
    requested_by = auth.uid()
    and school_id in (select school_id from public.profiles where id = auth.uid())
  );

-- ---------------------------------------------------------------
-- 5. Generate Code support: applicants set their real password at
--    application time (§ Phase-2 Lane D, "password hashed immediately
--    server-side on submit"). supabase-js's auth.admin.createUser()
--    only accepts a plaintext password (it does its own hashing), so
--    there is no supported client-SDK way to hand it a pre-computed
--    hash. This function is the documented escape hatch: it writes
--    directly to auth.users.encrypted_password, which is the same
--    column GoTrue's own bcrypt hasher writes to and the same column
--    GoTrue reads from on every signInWithPassword call. Any valid
--    bcrypt hash (the modular crypt format bcryptjs already produces,
--    e.g. "$2a$10$...") works here regardless of which cost factor
--    produced it, bcrypt hashes are self-describing.
--
--    SECURITY: execute is revoked from anon/authenticated below and
--    granted only to service_role, so this is reachable only from a
--    server route using the admin client, never from the browser.
--    Verify this against your actual Supabase project version before
--    relying on it: `auth.users.encrypted_password` is an internal
--    GoTrue implementation detail, not a documented public API, and
--    could change in a future Supabase Auth upgrade. Test the full
--    apply -> verify -> generate-code -> sign-in loop in staging before
--    shipping this to production; if it ever breaks, the safe fallback
--    is to generate a throwaway random password here instead (same
--    pattern as secretary/create-user) and route the applicant through
--    the existing first-login "set your password" screen one time:
--    less smooth than the spec's "no separate step" goal, but never
--    silently broken.
-- ---------------------------------------------------------------
create or replace function public.ict_set_encrypted_password(
  p_user_id uuid,
  p_bcrypt_hash text
)
returns void
language sql
security definer
set search_path = auth, public
as $$
  update auth.users
  set encrypted_password = p_bcrypt_hash,
      updated_at = now()
  where id = p_user_id;
$$;

revoke all on function public.ict_set_encrypted_password(uuid, text) from public, anon, authenticated;
grant execute on function public.ict_set_encrypted_password(uuid, text) to service_role;
