-- ============================================================================
-- SchoolOS: Public Platform, Lane A + Lane B (Phase 4)
-- Landing page / brand / theme (Lane A, §38 56 68) and public school
-- discovery + public school profile (Lane B, §39 45).
-- ============================================================================
-- HOW TO APPLY
-- Run this against your live Supabase project (SQL editor or migration
-- runner) BEFORE deploying the app changes in this drop: the new pages
-- query columns/tables this file creates. Safe to re-run: every statement
-- is idempotent (IF NOT EXISTS / CREATE OR REPLACE / DROP...IF EXISTS).
--
-- This does NOT touch: profiles, payments, subscriptions, or anything
-- inside dashboard/ role folders. Lane A/B only reads/writes `schools`
-- (new columns only, no existing column touched), a new `school_inquiries`
-- table, and `school_events` (previously unused by any app code: see the
-- note before that section).
-- ============================================================================


-- ── Helper functions ─────────────────────────────────────────────────────
-- Defined here too (not just assumed from SECURITY_RLS_AUDIT_AND_POLICIES.sql)
-- so this migration is self-contained regardless of whether that draft file
-- was ever applied to the live project. Identical bodies: safe to
-- CREATE OR REPLACE even if they already exist.
create or replace function public.my_role() returns text
language sql security definer stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.my_school_id() returns uuid
language sql security definer stable
set search_path = public
as $$
  select school_id from public.profiles where id = auth.uid()
$$;


-- ============================================================================
-- 1. SCHOOLS: new public-profile columns (§45)
-- ============================================================================
-- Every column is nullable/defaulted so this is a zero-downtime, additive
-- change. `is_publicly_listed` defaults false: no existing school appears
-- in discovery or gets a public profile until its principal opts in from
-- Settings → Public Profile. Nothing about the existing `schools` columns,
-- the login/tenant-selection flow, or billing fields changes.

alter table public.schools
  add column if not exists is_publicly_listed   boolean not null default false,
  add column if not exists description          text,
  add column if not exists cover_image_url       text,
  add column if not exists website_url           text,
  add column if not exists education_levels      text[] not null default '{}',
  add column if not exists is_boarding           boolean not null default false,
  add column if not exists is_day                boolean not null default true,
  add column if not exists verified_status       text not null default 'unverified',
  add column if not exists facilities            text[] not null default '{}',
  add column if not exists programs              text[] not null default '{}',
  add column if not exists public_email          text,
  add column if not exists public_phone          text,
  add column if not exists admission_status      text not null default 'closed',
  add column if not exists application_deadline  date,
  add column if not exists social_links          jsonb not null default '{}'::jsonb,
  add column if not exists founded_year          integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'schools_verified_status_check'
  ) then
    alter table public.schools
      add constraint schools_verified_status_check
      check (verified_status in ('unverified', 'pending', 'verified'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'schools_admission_status_check'
  ) then
    alter table public.schools
      add constraint schools_admission_status_check
      check (admission_status in ('open', 'closed', 'waitlist'));
  end if;
end $$;

comment on column public.schools.is_publicly_listed is
  'Principal opt-in: whether this school appears in public discovery (§39) and has a reachable public profile (§45). Independent of is_platform_active (billing/lock status): a paying school can still choose not to be publicly listed.';
comment on column public.schools.verified_status is
  'Platform-level verification badge. Super-admin only: see prevent_school_protected_field_update trigger below. Schools cannot self-verify.';


-- ── Protect billing/lock/verification columns from client-side writes ────
-- `schools_update_principal_own` (SECURITY_RLS_AUDIT_AND_POLICIES.sql) lets
-- a principal UPDATE their own school row with no column restriction: RLS
-- is row-scoped, not column-scoped. Today that mostly matters for billing
-- fields (setup_status, is_platform_active, paystack_*); this migration
-- adds verified_status to that same sensitive set, since a principal must
-- not be able to self-verify their own school by crafting a direct
-- PATCH against the anon REST endpoint (the app UI never exposes this
-- field, but RLS, not UI, is the real boundary).
--
-- Uses auth.role() (Supabase's JWT-role helper) rather than unconditionally
-- blocking the change, so server-side flows using the service-role client
-- (super-admin verification, Paystack webhook, cron) are unaffected. Only
-- RLS-governed calls made with the anon/authenticated key are restricted.
create or replace function public.prevent_school_protected_field_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if new.verified_status IS DISTINCT FROM old.verified_status then
    raise exception 'verified_status can only be changed by SchoolOS platform review.';
  end if;
  if new.is_platform_active IS DISTINCT FROM old.is_platform_active
     or new.setup_status IS DISTINCT FROM old.setup_status
     or new.paystack_subaccount_code IS DISTINCT FROM old.paystack_subaccount_code
     or new.paystack_subaccount_id IS DISTINCT FROM old.paystack_subaccount_id
     or new.paystack_subaccount_active IS DISTINCT FROM old.paystack_subaccount_active
     or new.subscription_plan IS DISTINCT FROM old.subscription_plan
     or new.subscription_starts IS DISTINCT FROM old.subscription_starts
     or new.subscription_ends IS DISTINCT FROM old.subscription_ends
     or new.trial_ends_at IS DISTINCT FROM old.trial_ends_at
     or new.trial_extended IS DISTINCT FROM old.trial_extended
  then
    raise exception 'Billing and platform-lock fields can only be changed by SchoolOS, not from the school portal.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_school_protected_field_update on public.schools;
create trigger trg_prevent_school_protected_field_update
  before update on public.schools
  for each row
  execute function public.prevent_school_protected_field_update();


-- ── Public directory read performance (§63) ───────────────────────────────
-- Partial indexes: only rows that can ever appear in discovery are indexed,
-- so this stays small and cheap even as the schools table grows with
-- private/unlisted schools.
create index if not exists idx_schools_public_directory
  on public.schools (is_publicly_listed, is_platform_active)
  where is_publicly_listed = true;

create index if not exists idx_schools_public_state
  on public.schools (state)
  where is_publicly_listed = true;

create index if not exists idx_schools_public_type
  on public.schools (school_type)
  where is_publicly_listed = true;


-- ============================================================================
-- 2. SCHOOL_INQUIRIES: lightweight public "request info" capture (§45, §57)
-- ============================================================================
-- Deliberately NOT the full admission-request/application/tracking/document
-- system from §40-43, 53 (Lane C: out of scope here, not requested). This
-- is a simple, rate-limited inbox: a visitor on a public school profile can
-- send a short message, the school's principal/secretary see it inside
-- their portal, and the underlying `applications`/`admissions` tables Lane
-- C would build stay untouched.
create table if not exists public.school_inquiries (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  full_name   text not null,
  email       text not null,
  phone       text,
  message     text not null,
  source      text not null default 'profile_apply',
  ip_hash     text,
  status      text not null default 'new',
  created_at  timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'school_inquiries_status_check'
  ) then
    alter table public.school_inquiries
      add constraint school_inquiries_status_check
      check (status in ('new', 'contacted', 'closed'));
  end if;
end $$;

create index if not exists idx_school_inquiries_school
  on public.school_inquiries (school_id, created_at desc);

alter table public.school_inquiries enable row level security;

-- Inserts happen only through the server route (service-role client, after
-- rate limiting + validation): see /api/public/schools/[slug]/inquiries.
-- This policy is defense-in-depth in case anything ever calls the table
-- directly with the anon key: still requires the target school to actually
-- be publicly listed and active, so inquiries can't be planted against a
-- private/suspended school by guessing its id.
drop policy if exists "school_inquiries_insert_public_school_only" on public.school_inquiries;
create policy "school_inquiries_insert_public_school_only" on public.school_inquiries
  for insert
  with check (
    exists (
      select 1 from public.schools s
      where s.id = school_id
        and s.is_publicly_listed = true
        and s.is_platform_active = true
    )
  );

drop policy if exists "school_inquiries_select_school_staff" on public.school_inquiries;
create policy "school_inquiries_select_school_staff" on public.school_inquiries
  for select
  using (
    school_id = public.my_school_id()
    and public.my_role() in ('principal', 'secretary')
  );

drop policy if exists "school_inquiries_update_school_staff" on public.school_inquiries;
create policy "school_inquiries_update_school_staff" on public.school_inquiries
  for update
  using (
    school_id = public.my_school_id()
    and public.my_role() in ('principal', 'secretary')
  )
  with check (
    school_id = public.my_school_id()
    and public.my_role() in ('principal', 'secretary')
  );

-- No delete policy: inquiries are kept for the school's own record; RLS
-- denies DELETE outright for anon/authenticated callers by default with no
-- matching policy, which is the intended behavior here.


-- ============================================================================
-- 3. SCHOOL_EVENTS: fix pre-existing FK bug + wire up for the public
--    profile's Events section (§45)
-- ============================================================================
-- FOUND DURING THIS PASS: school_events.school_id currently references
-- public.school_branding(id), not public.schools(id): school_branding is
-- a separate, mostly-legacy table with its own unrelated id space (see
-- school_branding's own primary key; it has no school_id column linking it
-- back to `schools` at all). No application code reads or writes
-- school_events today (repo-wide search confirms zero references outside
-- this schema file), so this is corrected here rather than left for a
-- separate migration: there is no existing data or running feature that
-- depends on the current (wrong) target, and leaving it wrong would make
-- every insert against real school ids fail FK validation the first time
-- anything (this profile page, or a future events-management screen)
-- actually tries to use the table.
--
-- If your live database already has rows in school_events, verify none of
-- them would violate the corrected constraint before this runs (they
-- would only be valid today if their school_id happened to match a real
-- school_branding.id, which: given no code path ever wrote through that
-- relationship: should not be the case).
alter table public.school_events
  drop constraint if exists school_events_school_id_fkey;

alter table public.school_events
  add constraint school_events_school_id_fkey
  foreign key (school_id) references public.schools(id) on delete cascade;

-- Privacy: an event must be explicitly marked public before it can appear
-- on the public profile: internal-only events (staff meetings, exam
-- schedules) stay portal-only by default, per §39's "do not publish
-- private... internal school information."
alter table public.school_events
  add column if not exists is_public boolean not null default false;

create index if not exists idx_school_events_public
  on public.school_events (school_id, start_date)
  where is_public = true;

alter table public.school_events enable row level security;

drop policy if exists "school_events_select_school_staff" on public.school_events;
create policy "school_events_select_school_staff" on public.school_events
  for select
  using (school_id = public.my_school_id());

drop policy if exists "school_events_write_school_staff" on public.school_events;
create policy "school_events_write_school_staff" on public.school_events
  for all
  using (school_id = public.my_school_id() and public.my_role() in ('principal', 'secretary'))
  with check (school_id = public.my_school_id() and public.my_role() in ('principal', 'secretary'));


-- ============================================================================
-- 4. school_subscription_summary view: surface the new public-profile
--    columns to the super-admin school detail page
-- ============================================================================
-- This view (defined in src/lib/supabase/trial-subscription-schema.sql)
-- lists its columns explicitly rather than `select *`, so the new
-- `schools` columns from section 1 above do not appear in it
-- automatically. super-admin/school/[id]/page.tsx reads school.verified_status
-- and school.is_publicly_listed through this view (see the Public Profile
-- Verification card in SchoolDetailClient.tsx): without this, that card
-- would always show "Unverified" regardless of the real value underneath.
CREATE OR REPLACE VIEW school_subscription_summary AS
SELECT
  s.id,
  s.name,
  s.slug,
  s.setup_status,
  s.trial_started_at,
  s.trial_ends_at,
  s.trial_active_score,
  EXTRACT(DAY FROM (s.trial_ends_at - now())) AS trial_days_left,
  s.setup_paid_at,
  s.free_month_ends,
  EXTRACT(DAY FROM (s.free_month_ends - now())) AS free_days_left,
  s.subscription_plan,
  s.subscription_ends,
  EXTRACT(DAY FROM (s.subscription_ends - now())) AS sub_days_left,
  s.installment_count,
  s.next_payment_due,
  s.total_students,
  COALESCE(p.total_paid, 0) AS total_paid_ngn,
  s.notes,
  s.verified_status,
  s.is_publicly_listed
FROM schools s
LEFT JOIN (
  SELECT school_id, SUM(amount_ngn) AS total_paid
  FROM school_payments
  GROUP BY school_id
) p ON p.school_id = s.id;

GRANT SELECT ON school_subscription_summary TO authenticated;


-- ============================================================================
-- 5. Defense-in-depth: schools.primary_color / secondary_color / font_family
--    format constraints
-- ============================================================================
-- FOUND DURING THIS PASS: SchoolBrandInjector.tsx renders these three
-- values into an inline <script> tag (sets CSS custom properties before
-- first paint). /api/principal/settings validates primary_color and
-- secondary_color as strict 6-digit hex on that one write path, but
-- schools_update_principal_own (SECURITY_RLS_AUDIT_AND_POLICIES.sql) lets
-- a principal UPDATE their own school row directly via the Supabase REST
-- API with no format check at all, and font_family had no validation on
-- any path. That combination made a stored-XSS payload in font_family (or
-- either color, via a direct REST call bypassing the Next.js route)
-- reachable, and it would have executed for every user of that school's
-- dashboards. SchoolBrandInjector.tsx now sanitizes defensively at the
-- point it actually matters (the rendering side, regardless of what
-- validation exists upstream): these CHECK constraints are the second,
-- database-level layer, since the underlying RLS gap that made the app
-- layer bypassable is not something this pass should leave unaddressed
-- even though it's outside the app-code fix.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'schools_primary_color_format') then
    alter table public.schools
      add constraint schools_primary_color_format
      check (primary_color IS NULL OR primary_color ~ '^#[0-9A-Fa-f]{6}$');
  end if;

  if not exists (select 1 from pg_constraint where conname = 'schools_secondary_color_format') then
    alter table public.schools
      add constraint schools_secondary_color_format
      check (secondary_color IS NULL OR secondary_color ~ '^#[0-9A-Fa-f]{6}$');
  end if;

  if not exists (select 1 from pg_constraint where conname = 'schools_font_family_format') then
    alter table public.schools
      add constraint schools_font_family_format
      check (font_family IS NULL OR font_family ~ '^[A-Za-z0-9 \-]{1,40}$');
  end if;
end $$;
-- NOTE: if this fails with a constraint violation, one or more existing
-- rows already have an out-of-format value in one of these columns:
-- inspect and correct that row before re-running (a bad value already in
-- the table means it has been reaching SchoolBrandInjector unsanitized
-- until the app-code fix in this same drop; the CHECK constraint is
-- exactly what would have prevented it from being written in the first
-- place).


-- ============================================================================
-- Verification queries: run after applying, before trusting this is live
-- ============================================================================
-- select column_name from information_schema.columns
--   where table_name = 'schools' and column_name = 'is_publicly_listed';
--
-- select tablename, rowsecurity from pg_tables
--   where schemaname = 'public' and tablename in ('school_inquiries', 'school_events');
--
-- select policyname, cmd from pg_policies
--   where schemaname = 'public' and tablename in ('school_inquiries', 'school_events', 'schools');
--
-- select column_name from information_schema.columns
--   where table_name = 'school_subscription_summary' and column_name in ('verified_status', 'is_publicly_listed');
--
-- select conname from pg_constraint where conname like 'schools_%_format';
