-- C2 (Sensitive Profile Data Exposure) - Safe profile view
--
-- DRAFT ONLY. Not applied to the database yet - pending review per the
-- same C1/C2 deployment-order discipline (see sql/migrations/2026-09-20-c1a-*
-- and c1b-*). Apply with `supabase db execute` (or the SQL editor) only
-- after Pius reviews.
--
-- WHY
-- `profiles` also holds nin, nin_number, nin_screenshot_url, nin_verified,
-- nin_verified_at, pin_hash, secret_identifier, temp_password, address,
-- date_of_birth, signature_url, admission_number, employee_id and
-- permanent_student_id. profiles_select_merged (the existing RLS policy)
-- is row-scoped - any authenticated user can read every column of any
-- profile row in their own school. That's correct at the row level (lots
-- of legitimate same-school reads: rosters, staff directories) but wrong
-- at the column level for the ~90 call sites that only need "my own
-- name/role/contact/avatar for this page's header," not the sensitive
-- columns. See SELF_PROFILE_SAFE_COLUMNS in
-- src/lib/supabase/profileSelectors.ts, which application code is being
-- migrated to use for that pattern; this view is the DB-level equivalent,
-- for anywhere a view is more appropriate than a client-side column list.
--
-- SECURITY MODEL
-- security_invoker = true means this view carries NO privileges of its
-- own: every query against it runs as the querying user, and
-- profiles_select_merged (or whatever RLS is in force on `profiles` at
-- query time) is evaluated exactly as if the caller had queried
-- `profiles` directly. This view narrows COLUMNS only; it changes
-- nothing about which ROWS are visible to whom - same-school rows stay
-- visible, cross-school rows stay denied, anon stays denied (anon has no
-- auth.uid(), so every profiles_select_merged branch evaluates false).
-- This is deliberately NOT a SECURITY DEFINER view/function - that would
-- run with the view owner's privileges and bypass RLS entirely, which is
-- not needed here and is exactly the kind of privilege escalation C2
-- rule 3 says to avoid.
--
-- The explicit REVOKE/GRANT below is defense-in-depth on top of RLS, not
-- a replacement for it: `profiles` itself currently has table-level
-- GRANT SELECT/INSERT/UPDATE/DELETE to `anon` (Supabase's default grant
-- pattern - RLS is the only thing stopping anon today). That default
-- grant pattern is out of scope for C2 to change on its own since it's
-- almost certainly applied the same way across every table in this
-- project, not a profiles-specific gap - flagged separately in the C2
-- backlog rather than changed here.

create or replace view public.profiles_safe
with (security_invoker = true)
as
select
  id,
  school_id,
  full_name,
  email,
  phone,
  avatar_url,
  role,
  default_code,
  onboarding_stage,
  is_active,
  created_at
from public.profiles;

revoke all on public.profiles_safe from anon;
revoke all on public.profiles_safe from public;
grant select on public.profiles_safe to authenticated;

comment on view public.profiles_safe is
  'C2 remediation: column-restricted, security_invoker view over profiles for '
  'the common "my own profile + school for page header/layout" read pattern. '
  'Excludes nin, nin_number, nin_screenshot_url, nin_verified, nin_verified_at, '
  'pin_hash, secret_identifier, temp_password, address, date_of_birth, '
  'signature_url, admission_number, employee_id, permanent_student_id, gender, '
  'class_level, subject, qualification. Row visibility is inherited unchanged '
  'from profiles RLS (profiles_select_merged) via security_invoker - this view '
  'narrows columns only, never rows. Pages needing address/DOB/gender/etc. for '
  'a specific, deliberate reason (e.g. principal staff/student rosters) should '
  'keep selecting those columns explicitly from profiles directly, not from '
  'this view.';

-- ── Verification queries (run these after applying, before relying on the view) ──
-- 1. Columns exposed - must NOT include any of the excluded list above:
--   select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'profiles_safe';
--
-- 2. anon denied (run as the anon role / via PostgREST with the anon key):
--   select * from public.profiles_safe;  -- expect: 0 rows, not an error
--
-- 3. Same-school authenticated user sees expected rows, cross-school sees none
--    - exercise via the app or PostgREST with two real school_id's, not by
--      impersonating auth.uid() in the SQL editor (that does not reproduce
--      PostgREST's session context faithfully).
