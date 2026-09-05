-- 2026-09-05-perf-duplicate-indexes-and-initplan.sql
--
-- First Phase 4 (Performance) fixes - the two zero-risk categories from
-- the Supabase performance advisor (909 total findings; see the commit
-- message for why the other 907 aren't touched in this pass):
--
-- 1. duplicate_index (15 findings, 16 drops): pairs/sets of indexes on
--    the same table covering the exact same columns. Verified via
--    pg_indexes.indexdef that every pair is byte-for-byte identical on
--    columns before dropping anything - a duplicate index costs write
--    overhead and disk space with zero read benefit over keeping one.
--    Two of these (attendance, message_read_receipts) are backed by
--    named UNIQUE constraints rather than plain indexes, so those use
--    ALTER TABLE ... DROP CONSTRAINT (dropping the index directly would
--    fail while a constraint still owns it); confirmed via pg_constraint
--    that the surviving constraint on each table still enforces the same
--    uniqueness afterward. Also confirmed no application code or SQL
--    migration references any of the dropped names explicitly (no
--    onConflict targeting a specific constraint name).
--
-- 2. auth_rls_initplan (1 finding): the online_meetings_delete_scoped
--    policy re-evaluated auth.uid()/my_school_id()/is_staff() per row.
--    Wrapped each in (select ...) so Postgres evaluates them once per
--    query (InitPlan) instead of once per row - same logical condition,
--    purely a query-planning improvement, zero behavior change.
--
-- Applied directly via the Supabase migration tool; this file mirrors
-- that in version control per repo convention.

alter table public.attendance drop constraint if exists attendance_student_date_class_unique;
alter table public.message_read_receipts drop constraint if exists message_read_receipts_message_user_unique;

drop index if exists public.quiz_attempts_quiz_student_uidx;
drop index if exists public.ai_messages_conv_idx;
drop index if exists public.idx_ann_created_at;
drop index if exists public.idx_ann_school_id;
drop index if exists public.clinic_visits_student_idx;
drop index if exists public.fee_payments_school;
drop index if exists public.fee_payments_student;
drop index if exists public.library_books_school_idx;
drop index if exists public.idx_notifications_user_id;
drop index if exists public.idx_notifications_user;
drop index if exists public.idx_push_subs_user_id;
drop index if exists public.idx_school_fees_school;
drop index if exists public.idx_transfers_dest_school;
drop index if exists public.transfers_destination_idx;

alter policy online_meetings_delete_scoped on public.online_meetings
  using (
    (created_by = (select auth.uid()))
    or ((school_id = (select my_school_id())) and (select is_staff()))
  );
