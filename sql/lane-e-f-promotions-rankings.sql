-- ============================================================================
-- SchoolOS Phase 4 - Lane E (School Promotion) & Lane F (Rankings)
-- ============================================================================
-- Run this after SECURITY_RLS_AUDIT_AND_POLICIES.sql, since it depends on
-- the helper functions defined there: public.my_role(), public.my_school_id().
-- If those don't exist yet in your live project, run that file first.
--
-- This migration is additive only. It does not modify any existing table,
-- and nothing here is wired into a cron job automatically - the ranking
-- score computation is a function you call from a scheduled job (see the
-- comment above compute_ranking_scores below), not something that runs on
-- its own.
-- ============================================================================


-- ── school_promotions (Lane E) ──────────────────────────────────────────────
-- A school-authored piece of content the school has chosen to push to the
-- public SchoolOS platform. Nothing here is auto-populated from internal
-- tables (announcements, events, etc.) - a staff member explicitly fills
-- this in, per §46: "Do NOT automatically expose every internal school
-- portal item."

create table if not exists public.school_promotions (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null references public.schools(id) on delete cascade,
  created_by         uuid not null references public.profiles(id),

  promotion_type     text not null check (promotion_type in (
                        'admission', 'open_day', 'scholarship', 'event',
                        'academic_program', 'achievement', 'announcement',
                        'campaign', 'article', 'facility', 'boarding',
                        'application_deadline'
                      )),
  title              text not null check (char_length(title) between 3 and 120),
  summary            text not null check (char_length(summary) between 3 and 400),
  body               text,
  image_url          text,
  external_link      text,

  -- audience/placement (§47) - kept as a plain enum for now; expand this
  -- list rather than freeform text so the public feed's filtering stays
  -- predictable.
  placement          text not null default 'discovery_feed' check (placement in (
                        'discovery_feed', 'school_profile', 'search_highlight'
                      )),

  start_date         date not null,
  end_date           date not null check (end_date >= start_date),

  is_sponsored       boolean not null default false,

  -- §47 workflow states. 'draft' and 'pending_review' are never shown
  -- publicly regardless of dates - enforced again in the RLS policy below,
  -- not just in application code.
  status             text not null default 'draft' check (status in (
                        'draft', 'pending_review', 'approved', 'rejected',
                        'live', 'paused', 'expired'
                      )),
  requires_moderation boolean not null default false,
  reviewed_by        uuid references public.profiles(id),
  reviewed_at        timestamptz,
  rejection_reason   text,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_school_promotions_school   on public.school_promotions(school_id);
create index if not exists idx_school_promotions_status   on public.school_promotions(status);
create index if not exists idx_school_promotions_live_window
  on public.school_promotions(status, start_date, end_date) where status = 'live';

comment on table public.school_promotions is
  'School-submitted content for the public SchoolOS discovery feed (Lane E). '
  'Sponsorship (is_sponsored) never changes organic ranking scores in '
  'school_ranking_scores - see §49.';

-- Sponsored content and the categories most prone to abuse (scholarships,
-- which involve money/promises) require moderation before going live.
-- Everything else can go live immediately once submitted, but every row
-- stays reviewable by super-admin regardless of this flag.
create or replace function public.set_promotion_moderation_flag()
returns trigger
language plpgsql
as $$
begin
  new.requires_moderation := (new.is_sponsored or new.promotion_type = 'scholarship');
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_promotion_moderation_flag on public.school_promotions;
create trigger trg_promotion_moderation_flag
  before insert or update on public.school_promotions
  for each row execute function public.set_promotion_moderation_flag();


-- ── promotion_analytics_events (Lane E, §60) ────────────────────────────────
-- Append-only event log. Deliberately has NO user_id / profile_id / IP /
-- device fingerprint column - §60 requires aggregate analytics without
-- exposing personal data, so the safest way to guarantee that is to never
-- collect it here in the first place, not to remember to filter it out
-- later. `session_ref` is a short-lived, non-reversible token the client
-- generates per browsing session purely to de-duplicate repeat impressions
-- client-side; it is never joined against any identity table.

create table if not exists public.promotion_analytics_events (
  id            uuid primary key default gen_random_uuid(),
  promotion_id  uuid not null references public.school_promotions(id) on delete cascade,
  event_type    text not null check (event_type in (
                  'impression', 'view', 'school_profile_visit',
                  'admission_page_visit', 'application_start',
                  'application_submitted', 'event_interest'
                )),
  session_ref   text,
  occurred_at   timestamptz not null default now()
);

create index if not exists idx_promo_events_promotion_time
  on public.promotion_analytics_events(promotion_id, occurred_at);

comment on table public.promotion_analytics_events is
  'Append-only, anonymous. Never add a user/profile/IP column here - read '
  'through it only via aggregates (see get_promotion_analytics below).';


-- ── ranking_categories (Lane F, §50) ────────────────────────────────────────
create table if not exists public.ranking_categories (
  id                  uuid primary key default gen_random_uuid(),
  key                 text not null unique,
  label               text not null,
  description         text not null,
  methodology_summary text not null,
  min_sample_size     integer not null default 5,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now()
);

comment on table public.ranking_categories is
  'Transparent, named ranking categories (§50) - SchoolOS never ships a '
  'single unexplained universal score. Seed rows for the categories you '
  'can actually measure; leave the rest uncreated rather than faking data.';

-- ── school_ranking_scores (Lane F) ──────────────────────────────────────────
-- Write path is service-role only (see RLS below) - there is intentionally
-- no INSERT/UPDATE policy for authenticated users, including principals.
-- A school cannot edit its own ranking. Scores are computed by
-- compute_ranking_scores() below, called from a scheduled job.

create table if not exists public.school_ranking_scores (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools(id) on delete cascade,
  category_id       uuid not null references public.ranking_categories(id) on delete cascade,
  period_start      date not null,
  period_end        date not null check (period_end >= period_start),
  score             numeric,
  sample_size       integer not null default 0,
  insufficient_data boolean not null default true,
  methodology_version text not null default 'v1',
  computed_at       timestamptz not null default now(),
  unique (school_id, category_id, period_start, period_end)
);

create index if not exists idx_ranking_scores_category_period
  on public.school_ranking_scores(category_id, period_start, period_end);

comment on table public.school_ranking_scores is
  'Organic, data-based scores only (§49). Sponsorship/promotion status '
  'must never feed into this table - see school_promotions.is_sponsored.';


-- ── RLS ──────────────────────────────────────────────────────────────────
alter table public.school_promotions          enable row level security;
alter table public.promotion_analytics_events enable row level security;
alter table public.ranking_categories         enable row level security;
alter table public.school_ranking_scores      enable row level security;

-- school_promotions: staff of the owning school (principal/secretary/admin)
-- can see and manage every status of their own school's rows. Everyone else
-- (including anonymous/public) can only ever see rows that are 'live' AND
-- currently inside [start_date, end_date] - this is enforced here, not just
-- filtered in application code, so a bug in an API route can't leak drafts.
drop policy if exists "promotions_staff_manage_own_school" on public.school_promotions;
create policy "promotions_staff_manage_own_school" on public.school_promotions
  for all
  using (
    school_id = public.my_school_id()
    and public.my_role() in ('principal', 'secretary', 'admin')
  )
  with check (
    school_id = public.my_school_id()
    and public.my_role() in ('principal', 'secretary', 'admin')
  );

drop policy if exists "promotions_public_read_live" on public.school_promotions;
create policy "promotions_public_read_live" on public.school_promotions
  for select
  using (
    status = 'live'
    and current_date between start_date and end_date
  );

-- promotion_analytics_events: nobody reads raw rows through RLS, not even
-- the owning school - they go through get_promotion_analytics() instead,
-- which returns only aggregates. Inserts are allowed from anyone (the
-- public tracking endpoint runs as anon), but ONLY against a promotion that
-- is actually live right now, which stops event-flooding an arbitrary
-- draft/rejected promotion_id to snoop on its existence.
drop policy if exists "promo_events_insert_if_live" on public.promotion_analytics_events;
create policy "promo_events_insert_if_live" on public.promotion_analytics_events
  for insert
  with check (
    exists (
      select 1 from public.school_promotions p
      where p.id = promotion_id
        and p.status = 'live'
        and current_date between p.start_date and p.end_date
    )
  );

-- No select policy at all for promotion_analytics_events - default-deny.
-- Reads happen exclusively through the SECURITY DEFINER function below.

drop policy if exists "ranking_categories_public_read" on public.ranking_categories;
create policy "ranking_categories_public_read" on public.ranking_categories
  for select
  using (is_active = true);

drop policy if exists "ranking_scores_public_read" on public.school_ranking_scores;
create policy "ranking_scores_public_read" on public.school_ranking_scores
  for select
  using (true);
-- Intentionally no insert/update/delete policy for any authenticated role.
-- Writes happen only via compute_ranking_scores(), which runs as the
-- function owner (service role) and bypasses RLS internally.


-- ── get_promotion_analytics (Lane E, §60) ───────────────────────────────────
-- Aggregate-only read path for a school's own promotion analytics.
-- SECURITY DEFINER so it can read promotion_analytics_events (which has no
-- select policy for anyone), but it checks the caller's role/school itself
-- before returning anything, and only ever returns counts - never raw rows,
-- session_ref values, or timestamps finer than the day.
create or replace function public.get_promotion_analytics(p_promotion_id uuid)
returns table (
  event_type text,
  event_date date,
  event_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.school_promotions p
    where p.id = p_promotion_id
      and p.school_id = public.my_school_id()
      and public.my_role() in ('principal', 'secretary', 'admin')
  ) then
    raise exception 'not authorized for this promotion';
  end if;

  return query
    select e.event_type, e.occurred_at::date as event_date, count(*)::bigint
    from public.promotion_analytics_events e
    where e.promotion_id = p_promotion_id
    group by e.event_type, e.occurred_at::date
    order by event_date desc;
end;
$$;


-- ── compute_ranking_scores (Lane F, §50) ────────────────────────────────────
-- Skeleton aggregation function - computes sample_size from a real signal
-- (published, non-withdrawn results-adjacent activity is NOT available
-- generically here, so this starter only wires up "Verified School
-- Activity" from data SchoolOS already has: profile completeness +
-- portal_audit_log volume, as a placeholder metric). Extend the CASE/metric
-- logic per category as real, verifiable signals become available - do not
-- backfill a score for a category with no defensible metric behind it; per
-- §50, leave insufficient_data = true instead.
--
-- This is NOT scheduled automatically. Call it from a cron route (e.g.
-- src/app/api/cron/*) or a Supabase scheduled function, e.g. monthly.
create or replace function public.compute_ranking_scores(
  p_category_key text,
  p_period_start date,
  p_period_end date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_category_id uuid;
  v_min_sample  integer;
begin
  select id, min_sample_size into v_category_id, v_min_sample
  from public.ranking_categories
  where key = p_category_key and is_active = true;

  if v_category_id is null then
    raise exception 'unknown or inactive ranking category: %', p_category_key;
  end if;

  -- Placeholder metric: verified-activity volume per school in the window.
  -- Replace this CTE with the real per-category metric before relying on
  -- the output - this exists so the table/function wiring is real and
  -- testable, not to assert a methodology that hasn't been reviewed.
  insert into public.school_ranking_scores
    (school_id, category_id, period_start, period_end, score, sample_size,
     insufficient_data, methodology_version)
  select
    s.id,
    v_category_id,
    p_period_start,
    p_period_end,
    case when count(l.id) >= v_min_sample
      then least(100, count(l.id))::numeric
      else null
    end,
    count(l.id),
    count(l.id) < v_min_sample,
    'v1'
  from public.schools s
  left join public.portal_audit_log l
    on l.school_id = s.id
    and l.created_at::date between p_period_start and p_period_end
  group by s.id
  on conflict (school_id, category_id, period_start, period_end)
  do update set
    score             = excluded.score,
    sample_size       = excluded.sample_size,
    insufficient_data = excluded.insufficient_data,
    methodology_version = excluded.methodology_version,
    computed_at       = now();
end;
$$;

-- Seed the categories SchoolOS can plausibly measure today. Add more as
-- real metrics are designed - do not add a category here without also
-- deciding its metric in compute_ranking_scores.
insert into public.ranking_categories (key, label, description, methodology_summary, min_sample_size)
values
  ('verified_activity', 'Verified School Activity',
   'How actively the school''s staff keep the portal up to date.',
   'Counts recorded staff actions (attendance, results entry, announcements) in the period, from the portal audit log. Placeholder v1 methodology, subject to revision.',
   5),
  ('admissions_responsiveness', 'Admissions Responsiveness',
   'How quickly the school responds to admission requests.',
   'Median time between an application being submitted and the school recording a first response, once Lane C/D admission tracking is live.',
   5)
on conflict (key) do nothing;
