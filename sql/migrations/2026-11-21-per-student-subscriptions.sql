-- APPLIED to Supabase project "school portal" (hgoasuqnuhltxocbcjnr) as migration
-- `per_student_subscriptions`, then amended by
-- 2026-11-22-per-student-subscriptions-grace.sql (apply both, in order, on any new DB).
--
-- Per-student subscriptions: parents/students pay per student per school term.
-- The school never locks for billing; only an unpaid student locks after the
-- term's grace window. If a principal has not set term dates, a default Nigerian
-- school calendar is created automatically on first use.
--
-- Money visibility: student_subscriptions has NO select policy for staff. Class
-- teachers/bursar get paid/unpaid via an RPC, the principal gets counts only.

create table if not exists public.school_terms (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools(id) on delete cascade,
  academic_year text not null,
  term_name     text not null,
  starts_on     date not null,
  ends_on       date not null,
  grace_days    integer not null default 14 check (grace_days between 0 and 60),
  is_default    boolean not null default false,
  created_at    timestamptz not null default now(),
  check (ends_on > starts_on),
  unique (school_id, academic_year, term_name)
);
create index if not exists idx_school_terms_school_dates on public.school_terms (school_id, starts_on, ends_on);

alter table public.school_terms enable row level security;

drop policy if exists school_terms_read on public.school_terms;
create policy school_terms_read on public.school_terms for select to authenticated
  using (school_id = (select school_id from public.profiles where id = (select auth.uid())));

drop policy if exists school_terms_principal_write on public.school_terms;
create policy school_terms_principal_write on public.school_terms for all to authenticated
  using (
    school_id = (select school_id from public.profiles where id = (select auth.uid()))
    and (select role from public.profiles where id = (select auth.uid())) = 'principal'
  )
  with check (
    school_id = (select school_id from public.profiles where id = (select auth.uid()))
    and (select role from public.profiles where id = (select auth.uid())) = 'principal'
  );

create table if not exists public.student_subscriptions (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null references public.schools(id) on delete cascade,
  student_id         uuid not null references public.profiles(id) on delete cascade,
  term_id            uuid not null references public.school_terms(id) on delete cascade,
  status             text not null default 'pending' check (status in ('pending','paid')),
  amount_ngn         numeric(12,2) not null check (amount_ngn > 0),
  rate_per_student   numeric(12,2) not null,
  tier_label         text not null,
  payer_id           uuid references public.profiles(id),
  paystack_reference text not null unique,
  paid_at            timestamptz,
  created_at         timestamptz not null default now()
);
create unique index if not exists uq_student_sub_paid
  on public.student_subscriptions (student_id, term_id) where status = 'paid';
create index if not exists idx_student_sub_school_term on public.student_subscriptions (school_id, term_id, status);
create index if not exists idx_student_sub_term on public.student_subscriptions (term_id);
create index if not exists idx_student_sub_payer on public.student_subscriptions (payer_id);

alter table public.student_subscriptions enable row level security;

drop policy if exists student_sub_self on public.student_subscriptions;
create policy student_sub_self on public.student_subscriptions for select to authenticated
  using (student_id = (select auth.uid()));

drop policy if exists student_sub_parent on public.student_subscriptions;
create policy student_sub_parent on public.student_subscriptions for select to authenticated
  using (
    student_id in (select p.id from public.profiles p where p.parent_id = (select auth.uid()))
    or student_id in (select l.student_id from public.parent_student_links l where l.parent_id = (select auth.uid()))
  );

-- Current term for a school. If none covers today, materialise the default
-- Nigerian calendar term (First: 8 Sep-19 Dec, Second: 5 Jan-3 Apr,
-- Third: 20 Apr-24 Jul). Between terms (holidays) it returns an empty row, so
-- nobody is locked. A principal-set term always wins because it is looked up first.
create or replace function public._current_term(p_school uuid)
 returns public.school_terms
 language plpgsql volatile security definer set search_path = public as $$
declare
  t public.school_terms;
  d date := current_date;
  y int := extract(year from current_date)::int;
  v_name text; v_year text; v_start date; v_end date;
begin
  select * into t from public.school_terms
   where school_id = p_school and d between starts_on and ends_on
   order by starts_on desc limit 1;
  if t.id is not null then return t; end if;

  if d between make_date(y, 9, 8) and make_date(y, 12, 19) then
    v_name := 'First Term';  v_year := y || '/' || (y + 1);
    v_start := make_date(y, 9, 8);  v_end := make_date(y, 12, 19);
  elsif d between make_date(y, 1, 5) and make_date(y, 4, 3) then
    v_name := 'Second Term'; v_year := (y - 1) || '/' || y;
    v_start := make_date(y, 1, 5);  v_end := make_date(y, 4, 3);
  elsif d between make_date(y, 4, 20) and make_date(y, 7, 24) then
    v_name := 'Third Term';  v_year := (y - 1) || '/' || y;
    v_start := make_date(y, 4, 20); v_end := make_date(y, 7, 24);
  else
    return t; -- holiday gap: no term, nobody locked
  end if;

  insert into public.school_terms (school_id, academic_year, term_name, starts_on, ends_on, is_default)
  values (p_school, v_year, v_name, v_start, v_end, true)
  on conflict (school_id, academic_year, term_name) do nothing;

  select * into t from public.school_terms
   where school_id = p_school and d between starts_on and ends_on
   order by starts_on desc limit 1;
  return t;
end $$;

revoke all on function public._current_term(uuid) from public, anon, authenticated;

-- The remaining functions (current_term_json, my_subscription_lock,
-- subscription_status_for_staff, subscription_stats_for_principal) are defined
-- in 2026-11-22-per-student-subscriptions-grace.sql, which also adds _grace_ends().
-- Their first-pass versions applied here counted grace from the term start;
-- the next file replaces them.
