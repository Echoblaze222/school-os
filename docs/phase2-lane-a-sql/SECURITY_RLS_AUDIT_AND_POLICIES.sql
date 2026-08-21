-- ============================================================================
-- SchoolOS — Row Level Security audit & draft policies
-- ============================================================================
-- WHY THIS FILE EXISTS
-- ----------------------------------------------------------------------------
-- The app's public NEXT_PUBLIC_SUPABASE_ANON_KEY is bundled into client-side
-- JavaScript, which is normal for Supabase apps. It is only safe because
-- Postgres Row Level Security (RLS) is supposed to enforce who can read/write
-- each row. Several screens in this codebase call supabase.from(...).insert()
-- / .update() directly from the browser (e.g. RecordPaymentClient.tsx,
-- InvoicesClient.tsx, every role's ProfileClient.tsx/SettingsClient.tsx,
-- PaymentClaimClient.tsx), which means the ENTIRE security boundary for
-- those tables is whatever RLS policies exist in the live Supabase project.
--
-- No RLS policies exist anywhere in this codebase's SQL files — sql/s.sql is
-- a schema-only dump with no CREATE POLICY statements. That does not
-- necessarily mean your live database is unprotected (policies are commonly
-- managed by hand in the Supabase dashboard and never checked into git), but
-- it does mean this could not be verified from the code alone.
--
-- STEP 1 — RUN THIS FIRST, before applying anything below, to see what
-- actually exists in your live project:
--
--   select schemaname, tablename, policyname, cmd, qual, with_check
--   from pg_policies
--   where schemaname = 'public'
--   order by tablename;
--
--   select tablename, rowsecurity
--   from pg_tables
--   where schemaname = 'public'
--   order by tablename;
--
-- If `rowsecurity` is false for profiles/payments/payment_invoices/
-- payment_claims/schools, or the policy list above is empty/thin for them,
-- those tables are currently wide open to anyone holding the anon key —
-- i.e. anyone who has ever loaded the app in a browser. Treat that as
-- urgent. If policies already exist, compare them against the intent below
-- rather than blindly running this script — it is a draft matching what the
-- application code assumes, not a verified replacement for your existing
-- setup.
-- ============================================================================


-- ── Helper functions ─────────────────────────────────────────────────────
-- A policy on `profiles` that queries `profiles` again causes infinite
-- recursion. SECURITY DEFINER functions sidestep that by running with the
-- function owner's privileges (bypassing RLS internally) while still only
-- ever returning data about the CURRENT authenticated user.
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

create or replace function public.is_staff() returns boolean
language sql security definer stable
set search_path = public
as $$
  select public.my_role() in ('bursar', 'principal', 'secretary', 'admin')
$$;


-- ── profiles ──────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own_or_school" on public.profiles;
create policy "profiles_select_own_or_school" on public.profiles
  for select
  using (
    id = auth.uid()                                   -- everyone can read their own row
    or school_id = public.my_school_id()               -- staff/students/parents can read others in the same school
  );

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- RLS is row-scoped, not column-scoped — the policy above lets a user
-- update THEIR OWN row, but nothing stops them from also setting
-- role='principal' or school_id=<some other school> in that same request
-- (e.g. secretary/create-user's frontend pattern replayed by hand against
-- profiles directly). A BEFORE UPDATE trigger closes that column-level gap.
create or replace function public.prevent_self_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Service-role/admin calls (server routes using the service key) bypass
  -- RLS entirely and never hit this trigger, so staff-creation flows are
  -- unaffected. This only guards direct, RLS-governed client writes.
  if new.role IS DISTINCT FROM old.role then
    raise exception 'Changing your own role is not permitted.';
  end if;
  if new.school_id IS DISTINCT FROM old.school_id then
    raise exception 'Changing your own school is not permitted.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_self_privilege_escalation on public.profiles;
create trigger trg_prevent_self_privilege_escalation
  before update on public.profiles
  for each row
  execute function public.prevent_self_privilege_escalation();

-- No DELETE policy previously existed for profiles anywhere in this repo's
-- SQL. With RLS enabled and no policy for a given command, Postgres denies
-- that command outright for ordinary (non-service-role) callers — so this
-- was either (a) silently broken (Principal's Staff/Students screens call
-- supabase.from('profiles').delete() directly from the browser and would
-- get 0 rows affected with no policy at all), or (b) covered by a
-- hand-managed policy in the live project not reflected here. Added below
-- so the intent is explicit either way: only a principal/admin may delete
-- a profile, only within their own school, and never a principal/admin
-- row itself (removing a school's own leadership account should go
-- through a deliberate, audited server-side flow, not a same-permission
-- browser delete).
drop policy if exists "profiles_delete_principal_admin_same_school" on public.profiles;
create policy "profiles_delete_principal_admin_same_school" on public.profiles
  for delete
  using (
    school_id = public.my_school_id()
    and public.my_role() in ('principal', 'admin')
    and role not in ('principal', 'admin')
  );



-- ── schools ───────────────────────────────────────────────────────────────
alter table public.schools enable row level security;

drop policy if exists "schools_select_own" on public.schools;
create policy "schools_select_own" on public.schools
  for select
  using (id = public.my_school_id());

-- Only the principal of THIS school may update it directly from the
-- browser (e.g. SettingsClient.tsx branding/colors). Billing/lock fields
-- (setup_status, is_platform_active, paystack_subaccount_*) are intended to
-- change only through server routes using the service-role key — this
-- policy does not need to special-case them since a principal updating
-- their own school row through the UI shouldn't be touching those columns
-- anyway; consider a column-level guard trigger here too if you want the
-- same defense-in-depth as profiles above.
drop policy if exists "schools_update_principal_own" on public.schools;
create policy "schools_update_principal_own" on public.schools
  for update
  using (id = public.my_school_id() and public.my_role() = 'principal')
  with check (id = public.my_school_id() and public.my_role() = 'principal');


-- ── payment_invoices ─────────────────────────────────────────────────────
alter table public.payment_invoices enable row level security;

drop policy if exists "invoices_select_school_or_own_child" on public.payment_invoices;
create policy "invoices_select_school_or_own_child" on public.payment_invoices
  for select
  using (
    school_id = public.my_school_id()
    or student_id = auth.uid()
    or student_id in (
      select student_id from public.parent_student_links where parent_id = auth.uid()
    )
  );

-- Only bursar/principal/secretary may create or edit invoices directly
-- from the browser (InvoicesClient.tsx), and only for their own school.
drop policy if exists "invoices_write_staff_own_school" on public.payment_invoices;
create policy "invoices_write_staff_own_school" on public.payment_invoices
  for all
  using (school_id = public.my_school_id() and public.is_staff())
  with check (school_id = public.my_school_id() and public.is_staff());


-- ── payments ──────────────────────────────────────────────────────────────
alter table public.payments enable row level security;

drop policy if exists "payments_select_school_or_own_child" on public.payments;
create policy "payments_select_school_or_own_child" on public.payments
  for select
  using (
    school_id = public.my_school_id()
    or student_id = auth.uid()
    or student_id in (
      select student_id from public.parent_student_links where parent_id = auth.uid()
    )
  );

-- RecordPaymentClient.tsx inserts here directly as bursar/principal. This
-- is the same class of gap already fixed in confirm-claim/route.ts —
-- without this policy, ANY authenticated user (not just bursars) could
-- insert an arbitrary payments row for any school by calling
-- supabase.from('payments').insert(...) directly in a browser console.
drop policy if exists "payments_insert_staff_own_school" on public.payments;
create policy "payments_insert_staff_own_school" on public.payments
  for insert
  with check (school_id = public.my_school_id() and public.is_staff());

-- Payments should generally be immutable once recorded (edit history should
-- go through a correction workflow, not a silent UPDATE). No update/delete
-- policy is defined here on purpose — that means neither is allowed for
-- ordinary authenticated users; only service-role server routes (which
-- bypass RLS) can adjust them. If the app genuinely needs bursar-side
-- edits, add a scoped update policy rather than leaving this open-ended.


-- ── payment_claims ───────────────────────────────────────────────────────
alter table public.payment_claims enable row level security;

drop policy if exists "claims_select_own_or_school_staff" on public.payment_claims;
create policy "claims_select_own_or_school_staff" on public.payment_claims
  for select
  using (
    parent_id = auth.uid()
    or (school_id = public.my_school_id() and public.is_staff())
  );

-- Parents file claims for their own linked children only.
drop policy if exists "claims_insert_own_parent" on public.payment_claims;
create policy "claims_insert_own_parent" on public.payment_claims
  for insert
  with check (
    parent_id = auth.uid()
    and student_id in (
      select student_id from public.parent_student_links where parent_id = auth.uid()
    )
  );

-- Confirming/rejecting a claim is deliberately NOT exposed as a client-side
-- RLS-governed update — it goes through /api/payments/confirm-claim and
-- /api/payments/reject-claim, both of which now verify the claim's real
-- school_id server-side before touching it (see this session's fixes).
-- No update policy is defined here on purpose, so a direct
-- supabase.from('payment_claims').update(...) call from any browser
-- session is rejected regardless of role.


-- ── report_cards ─────────────────────────────────────────────────────────
-- report-card/generate/route.ts deliberately reads this table with the
-- CALLER'S OWN session (not the service-role client), relying on RLS to
-- enforce that students/parents can only reach an approved report card
-- that is theirs, while staff can preview any status for their own
-- school. That is a correct, well-designed pattern — but it means this
-- route's entire security depends on these policies being right. Verify/
-- adapt rather than assume; exact shape depends on report_cards' real
-- columns (student_id, school_id, status, approved_by, etc. per sql/s.sql).
--
--   alter table public.report_cards enable row level security;
--
--   create policy "report_cards_select_scoped" on public.report_cards
--     for select
--     using (
--       (public.is_staff() and school_id = public.my_school_id())
--       or (student_id = auth.uid() and status = 'approved')
--       or (student_id in (
--            select student_id from public.parent_student_links
--            where parent_id = auth.uid()
--          ) and status = 'approved')
--     );


-- ── Lane 3 tables (Secretary + Student screens) ─────────────────────────────
-- None of these appeared in the payments/profiles pass above, but every one
-- of them is written to directly from the browser (RecordsClient.tsx,
-- LibraryClient.tsx, ApplicationsClient.tsx, AdmissionsClient.tsx,
-- DocumentsClient.tsx, ScheduleClient.tsx), so the same reasoning applies:
-- without a matching policy, RLS silently blocks everything (safe but
-- broken) or a missing "enable row level security" leaves the table fully
-- open to any anon-key holder (broken and dangerous). Verify which case
-- you're in with the pg_policies query at the top of this file before
-- assuming either.

-- study_plans — a student's own private AI-generated/manual study schedule.
-- No staff role ever reads or writes this in the app; scope it to the
-- owning student only.
alter table public.study_plans enable row level security;

drop policy if exists "study_plans_own_student" on public.study_plans;
create policy "study_plans_own_student" on public.study_plans
  for all
  using (student_id = auth.uid())
  with check (student_id = auth.uid() and school_id = public.my_school_id());

-- behaviour_records — secretary/principal/teacher write, student/parent
-- should NOT see these directly (they're staff-facing conduct notes, not
-- published to the student). RecordsClient.tsx is secretary-only in this
-- app, so scope both read and write to staff of the same school.
alter table public.behaviour_records enable row level security;

drop policy if exists "behaviour_records_staff_own_school" on public.behaviour_records;
create policy "behaviour_records_staff_own_school" on public.behaviour_records
  for all
  using (school_id = public.my_school_id() and public.is_staff())
  with check (school_id = public.my_school_id() and public.is_staff());

-- library_books / library_loans — every role reads its own school's
-- catalog (student browses, secretary manages), but only staff add, edit,
-- issue, or delete.
alter table public.library_books enable row level security;

drop policy if exists "library_books_select_own_school" on public.library_books;
create policy "library_books_select_own_school" on public.library_books
  for select
  using (school_id = public.my_school_id());

drop policy if exists "library_books_write_staff_own_school" on public.library_books;
create policy "library_books_write_staff_own_school" on public.library_books
  for insert
  with check (school_id = public.my_school_id() and public.is_staff());

drop policy if exists "library_books_update_staff_own_school" on public.library_books;
create policy "library_books_update_staff_own_school" on public.library_books
  for update
  using (school_id = public.my_school_id() and public.is_staff())
  with check (school_id = public.my_school_id() and public.is_staff());

drop policy if exists "library_books_delete_staff_own_school" on public.library_books;
create policy "library_books_delete_staff_own_school" on public.library_books
  for delete
  using (school_id = public.my_school_id() and public.is_staff());

alter table public.library_loans enable row level security;

drop policy if exists "library_loans_select_scoped" on public.library_loans;
create policy "library_loans_select_scoped" on public.library_loans
  for select
  using (
    (school_id = public.my_school_id() and public.is_staff())
    or student_id = auth.uid()
  );

-- Only staff issue/return loans (StudentsClient/LibraryClient "Issue" and
-- "Mark returned" actions); a student never writes their own loan row.
drop policy if exists "library_loans_write_staff_own_school" on public.library_loans;
create policy "library_loans_write_staff_own_school" on public.library_loans
  for all
  using (school_id = public.my_school_id() and public.is_staff())
  with check (school_id = public.my_school_id() and public.is_staff());

-- applications / admissions — admissions intake, staff-only (secretary
-- reviews/admits/rejects/deletes; applicants aren't authenticated users of
-- this table, they apply through a public form handled elsewhere).
alter table public.applications enable row level security;

drop policy if exists "applications_staff_own_school" on public.applications;
create policy "applications_staff_own_school" on public.applications
  for all
  using (school_id = public.my_school_id() and public.is_staff())
  with check (school_id = public.my_school_id() and public.is_staff());

alter table public.admissions enable row level security;

drop policy if exists "admissions_staff_own_school" on public.admissions;
create policy "admissions_staff_own_school" on public.admissions
  for all
  using (school_id = public.my_school_id() and public.is_staff())
  with check (school_id = public.my_school_id() and public.is_staff());

-- school_documents — staff-authored internal documents (policies, forms,
-- circulars). Scope read to the whole school (any authenticated staff or
-- student at that school may need to open a shared document), write to
-- staff only.
alter table public.school_documents enable row level security;

drop policy if exists "school_documents_select_own_school" on public.school_documents;
create policy "school_documents_select_own_school" on public.school_documents
  for select
  using (school_id = public.my_school_id());

drop policy if exists "school_documents_write_staff_own_school" on public.school_documents;
create policy "school_documents_write_staff_own_school" on public.school_documents
  for all
  using (school_id = public.my_school_id() and public.is_staff())
  with check (school_id = public.my_school_id() and public.is_staff());


-- ============================================================================
-- STEP 2 — after applying, verify nothing above conflicts with policies you
-- already had (re-run the pg_policies query from the top of this file).
-- STEP 3 — test as each role (bursar, principal, parent, student) using the
-- Supabase dashboard's "Impersonate user" / a real session, not just the
-- SQL editor as postgres — the postgres role bypasses RLS entirely and
-- will make broken policies look like they work.
-- ============================================================================
