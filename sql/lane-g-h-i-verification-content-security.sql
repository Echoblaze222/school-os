-- ============================================================================
-- SchoolOS Phase 4 - Lane G (Verification + Fraud/Safety + Moderation),
--                     Lane H (Public Content/Blog),
--                     Lane I (Public platform performance + security)
-- ============================================================================
-- Run this after SECURITY_RLS_AUDIT_AND_POLICIES.sql (depends on
-- public.my_role()/public.my_school_id()) and after
-- sql/admission-system-schema.sql (Lane C/D),
-- sql/lane-e-f-promotions-rankings.sql (Lane E/F), and
-- sql/migrations/2026-08-18-public-platform-lane-a-b.sql (Lane A/B) -
-- this file reports on and extends all three but does not modify any of
-- them directly.
--
-- Everything here is additive: two new tables (content_reports,
-- content_posts). Nothing here touches admission_*, school_promotions,
-- ranking_* or any dashboard table. Reuses public.platform_admins (existing
-- table) and public.portal_audit_log (existing table) rather than inventing
-- parallel ones. (This file originally also added schools.verification_status
-- - retired in favor of Lane B's schools.verified_status; see the note in
-- part 1 below.)
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- LANE G, part 1 - School verification (§51) - SUPERSEDED, see note
-- ────────────────────────────────────────────────────────────────────────────
-- This originally added its own schools.verification_status column (5-state)
-- + school_verification_events audit table + a set_verification_status
-- action on /api/super-admin/manage-school.
--
-- Lane B's delivery (sql/migrations/2026-08-18-public-platform-lane-a-b.sql)
-- independently shipped the same feature first: schools.verified_status
-- (3-state: unverified/pending/verified), protected at the DATABASE level
-- by the prevent_school_protected_field_update trigger (stronger than this
-- file's original approach of just omitting an RLS write policy - a trigger
-- defends even against future code that grants principals broader table
-- access). Found during reconciliation with the Lane A/B delivery: two
-- columns for the same concept is exactly the kind of duplicate system this
-- project has been actively consolidating (see Lane D's own
-- admission_applications vs the old admissions table).
--
-- Resolution: retired entirely in favor of Lane B's verified_status.
-- /api/super-admin/manage-school (set_verified_status action),
-- SchoolDetailClient.tsx (Public Profile Verification card), VerificationBadge.tsx,
-- and every public route that surfaces a badge were all updated to read
-- schools.verified_status instead. If this migration was already run against
-- a live database before this reconciliation, drop the now-unused objects:
--   alter table public.schools drop column if exists verification_status;
--   drop table if exists public.school_verification_events;
-- No production database should have had this run yet as of this delivery -
-- confirm before running the drop.


-- ────────────────────────────────────────────────────────────────────────────
-- LANE G, part 2 - Content moderation / reporting (§52, §62)
-- ────────────────────────────────────────────────────────────────────────────
-- One generic reports table covering every public-facing target this phase
-- introduces (school profiles, promotions, content posts), rather than a
-- separate reports table per lane. A report is intentionally allowed without
-- an account - the applicant deciding whether a school looks fraudulent is
-- exactly the person §52 wants to be able to flag it, and requiring signup
-- first would suppress the reports that matter most (fake schools, fake
-- admission offers).

create table if not exists public.content_reports (
  id                 uuid primary key default gen_random_uuid(),

  target_type        text not null check (target_type in (
                        'school', 'admission_application', 'school_promotion',
                        'content_post'
                      )),
  target_id          uuid not null,

  reason             text not null check (reason in (
                        'fake_school', 'impersonation', 'fake_admission_offer',
                        'fraudulent_payment_request', 'spam', 'misleading_claims',
                        'inappropriate_content', 'copyright_violation',
                        'fake_achievement', 'other'
                      )),
  details            text check (char_length(details) <= 2000),

  -- Optional - a signed-in reporter's identity, never required. Never shown
  -- to the party being reported (see: no policy grants them read access).
  reporter_profile_id uuid references public.profiles(id) on delete set null,
  reporter_contact    text,   -- optional free-text email/phone if not signed in

  status             text not null default 'open' check (status in (
                        'open', 'reviewing', 'actioned', 'dismissed'
                      )),
  resolution_note    text,
  resolved_by        uuid references auth.users(id) on delete set null,
  resolved_at        timestamptz,

  created_at         timestamptz not null default now()
);

create index if not exists idx_content_reports_target on public.content_reports(target_type, target_id);
create index if not exists idx_content_reports_status  on public.content_reports(status, created_at desc);

comment on table public.content_reports is
  'Generic public reporting/takedown queue (§52, §62). Reviewed only via /api/super-admin/reports. Insert is open to anonymous callers (rate-limited at the API layer via checkRateLimit) - select/update are admin-client-only, so a reporter can never see or tamper with the status of their own or anyone else''s report.';

alter table public.content_reports enable row level security;

-- Anyone (including anon) may file a report, but only ever in the initial
-- 'open' state with no resolution fields set - prevents a caller from
-- inserting a pre-resolved or self-actioned row.
drop policy if exists content_reports_public_insert on public.content_reports;
create policy content_reports_public_insert on public.content_reports
  for insert with check (
    status = 'open'
    and resolved_by is null
    and resolved_at is null
    and resolution_note is null
  );

-- No select/update/delete policy for anon or authenticated - intentional.
-- Only the admin client (super-admin routes) can read or resolve reports.


-- ────────────────────────────────────────────────────────────────────────────
-- LANE H - Public content / blog (§54, §55)
-- ────────────────────────────────────────────────────────────────────────────
-- Official SchoolOS editorial content only, in this pass. There is no
-- school-authored-content path yet (would need an explicit authorization
-- flag per §55: "do not allow ordinary school admins to publish as official
-- SchoolOS content unless explicitly authorized") - every row here is
-- necessarily official by construction, since only platform_admins can
-- write to this table (enforced by RLS below and by the API layer using
-- the admin client). See LANE_G_H_I_HANDOFF.md.

create table if not exists public.content_posts (
  id              uuid primary key default gen_random_uuid(),

  title           text not null check (char_length(title) between 3 and 200),
  slug            text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  author_id       uuid references auth.users(id) on delete set null,
  author_name     text not null,   -- denormalized display name, survives author account changes

  category        text not null check (category in (
                     'education_article', 'product_update', 'platform_announcement',
                     'guide', 'success_story', 'education_news', 'tutorial',
                     'feature_announcement'
                   )),
  cover_image_url text,
  excerpt         text check (char_length(excerpt) <= 400),
  body            text not null,
  tags            text[] not null default '{}',

  seo_title       text check (char_length(seo_title) <= 70),
  seo_description text check (char_length(seo_description) <= 200),

  status          text not null default 'draft' check (status in (
                     'draft', 'review', 'scheduled', 'published', 'archived'
                   )),
  publish_at      timestamptz,   -- required once status = 'scheduled' or 'published'
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint chk_content_post_publish_at check (
    status not in ('scheduled', 'published') or publish_at is not null
  )
);

create index if not exists idx_content_posts_public_feed
  on public.content_posts(status, publish_at desc);
create index if not exists idx_content_posts_category on public.content_posts(category);

comment on table public.content_posts is
  'Official SchoolOS editorial content (§54, §55). Write path is exclusively /api/super-admin/content, using the admin client - no INSERT/UPDATE/DELETE policy exists for any client role, so this table cannot be written to directly even by an authenticated platform_admin''s own session client.';

create or replace function public.set_content_post_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_content_posts_updated_at on public.content_posts;
create trigger trg_content_posts_updated_at
  before update on public.content_posts
  for each row execute function public.set_content_post_updated_at();

alter table public.content_posts enable row level security;

-- Public read: only posts that are actually live. A 'scheduled' post whose
-- publish_at has passed is treated as published for read purposes without
-- requiring a cron job to flip its status row first - the status column
-- itself is only ever changed by an explicit super-admin action or the
-- lazy transition performed by /api/super-admin/content on next write.
drop policy if exists content_posts_public_read on public.content_posts;
create policy content_posts_public_read on public.content_posts
  for select using (
    status = 'published'
    or (status = 'scheduled' and publish_at <= now())
  );

-- No insert/update/delete policy - all writes go through the admin client
-- from /api/super-admin/content, after that route's own platform_admins check.


-- ============================================================================
-- LANE I - rate-limit scopes used by the public GET/report endpoints below
-- ============================================================================
-- No new schema needed - reuses public.check_rate_limit() from
-- docs/security-hotfix/hotfix-01-rate-limit-schema.sql (Lane C already
-- depends on this for /api/auth/self-register and
-- /api/admission/applications). Scopes introduced by this lane:
--   'public_school_search', 'public_content_read', 'public_report_submit'
-- No action required here beyond confirming that hotfix has been applied.
