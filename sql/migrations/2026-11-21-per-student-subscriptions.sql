-- Per-student subscriptions
--
-- Replaces school-level billing locks. Parents (or students) pay per student
-- per school term; the school itself never locks for billing. Unpaid students
-- are locked once the term's grace window has passed.
--
-- Money visibility:
--   * parent  -> sees amounts for their own children (RLS)
--   * student -> sees their own row (RLS)
--   * teacher / bursar -> paid/unpaid STATUS only, via RPC (no amounts)
--   * principal -> aggregate counts only, via RPC (no amounts, no names)
-- student_subscriptions has NO select policy for staff roles on purpose.
--
-- NOT applied automatically. Review, then run in the Supabase SQL editor.

-- ── Terms (school-wide dates; set by the principal) ─────────────────────
create table if not exists public.school_terms (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools(id) on delete cascade,
  academic_year text not null,
  term_name     text not null,
  starts_on     date not null,
  ends_on       date not null,
  grace_days    integer not null default 14 check (grace_days between 0 and 60),
  created_at    timestamptz not null default now(),
  check (ends_on > starts_on),
  unique (school_id, academic_year, term_name)
);
create index if not exists idx_school_terms_school_dates on public.school_terms (school_id, starts_on, ends_on);

alter table public.school_terms enable row level security;

drop policy if exists school_terms_read on public.school_terms;
create policy school_terms_read on public.school_terms for select to authenticated
  using (school_id = (select school_id from public.profiles where id = auth.uid()));

drop policy if exists school_terms_principal_write on public.school_terms;
create policy school_terms_principal_write on public.school_terms for all to authenticated
  using (
    school_id = (select school_id from public.profiles where id = auth.uid())
    and (select role from public.profiles where id = auth.uid()) = 'principal'
  )
  with check (
    school_id = (select school_id from public.profiles where id = auth.uid())
    and (select role from public.profiles where id = auth.uid()) = 'principal'
  );

-- ── Student subscriptions (one row per student per term) ────────────────
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
-- At most one PAID row per student per term (pending attempts may repeat).
create unique index if not exists uq_student_sub_paid
  on public.student_subscriptions (student_id, term_id) where status = 'paid';
create index if not exists idx_student_sub_school_term on public.student_subscriptions (school_id, term_id, status);

alter table public.student_subscriptions enable row level security;

drop policy if exists student_sub_self on public.student_subscriptions;
create policy student_sub_self on public.student_subscriptions for select to authenticated
  using (student_id = auth.uid());

drop policy if exists student_sub_parent on public.student_subscriptions;
create policy student_sub_parent on public.student_subscriptions for select to authenticated
  using (
    student_id in (select p.id from public.profiles p where p.parent_id = auth.uid())
    or student_id in (select l.student_id from public.parent_student_links l where l.parent_id = auth.uid())
  );
-- Writes happen only through the service role (payment routes / webhook).

-- ── Helpers ─────────────────────────────────────────────────────────────
create or replace function public._current_term(p_school uuid)
 returns public.school_terms
 language sql stable security definer set search_path = public as $$
  select t.* from public.school_terms t
  where t.school_id = p_school and current_date between t.starts_on and t.ends_on
  order by t.starts_on desc limit 1;
$$;
revoke all on function public._current_term(uuid) from public, anon, authenticated;

-- Used by middleware for signed-in STUDENTS. Fails open when no term is configured.
create or replace function public.my_subscription_lock()
 returns jsonb
 language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  prof record;
  t public.school_terms;
  paid boolean;
begin
  select role, school_id into prof from public.profiles where id = me;
  if prof.role is distinct from 'student' or prof.school_id is null then
    return jsonb_build_object('locked', false);
  end if;
  t := public._current_term(prof.school_id);
  if t.id is null then
    return jsonb_build_object('locked', false, 'reason', 'no_term');
  end if;
  select exists (
    select 1 from public.student_subscriptions s
    where s.student_id = me and s.term_id = t.id and s.status = 'paid'
  ) into paid;
  return jsonb_build_object(
    'locked', (not paid) and current_date > (t.starts_on + t.grace_days),
    'paid', paid,
    'term_id', t.id,
    'term_name', t.term_name,
    'grace_ends_on', t.starts_on + t.grace_days
  );
end $$;

-- ── Role-scoped status RPCs (never return amounts) ──────────────────────
-- Class teacher (or bursar): paid/unpaid per student, optionally one class.
create or replace function public.subscription_status_for_staff(p_class uuid default null)
 returns jsonb
 language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  prof record;
  t public.school_terms;
  r jsonb;
begin
  select role, school_id into prof from public.profiles where id = me;
  if prof.school_id is null or prof.role not in ('teacher','bursar') then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  t := public._current_term(prof.school_id);
  if t.id is null then
    return jsonb_build_object('term', null, 'students', '[]'::jsonb);
  end if;

  select jsonb_build_object(
    'term', jsonb_build_object('id', t.id, 'name', t.term_name, 'grace_ends_on', t.starts_on + t.grace_days),
    'students', coalesce(jsonb_agg(jsonb_build_object(
        'student_id', st.id, 'name', st.full_name, 'class_id', st.class_id, 'class', c.name,
        'paid', exists (select 1 from public.student_subscriptions s
                        where s.student_id = st.id and s.term_id = t.id and s.status = 'paid')
      ) order by c.name, st.full_name), '[]'::jsonb)
  ) into r
  from public.profiles st
  join public.classes c on c.id = st.class_id
  where st.role = 'student' and st.is_active and st.school_id = prof.school_id
    and (p_class is null or st.class_id = p_class)
    and (
      prof.role = 'bursar'
      or c.class_teacher_id = me
      or c.id in (select class_id from public.class_teachers where teacher_id = me and school_id = prof.school_id)
    );
  return r;
end $$;

-- Principal: counts and percentages only. No names, no amounts.
create or replace function public.subscription_stats_for_principal()
 returns jsonb
 language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  prof record;
  t public.school_terms;
  r jsonb;
begin
  select role, school_id into prof from public.profiles where id = me;
  if prof.school_id is null or prof.role <> 'principal' then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  t := public._current_term(prof.school_id);
  if t.id is null then
    return jsonb_build_object('term', null);
  end if;

  with stu as (
    select st.id, st.class_id,
           exists (select 1 from public.student_subscriptions s
                   where s.student_id = st.id and s.term_id = t.id and s.status = 'paid') as paid
    from public.profiles st
    where st.role = 'student' and st.is_active and st.school_id = prof.school_id
  )
  select jsonb_build_object(
    'term', jsonb_build_object('id', t.id, 'name', t.term_name, 'academic_year', t.academic_year,
                               'starts_on', t.starts_on, 'ends_on', t.ends_on,
                               'grace_ends_on', t.starts_on + t.grace_days),
    'total_students', (select count(*) from stu),
    'paid_students', (select count(*) from stu where paid),
    'unpaid_students', (select count(*) from stu where not paid),
    'paid_percent', (select round(100.0 * count(*) filter (where paid) / nullif(count(*), 0), 1) from stu),
    'by_class', coalesce((select jsonb_agg(jsonb_build_object(
        'class', c.name, 'total', x.total, 'paid', x.paid_n,
        'paid_percent', round(100.0 * x.paid_n / nullif(x.total, 0), 1)) order by c.name)
      from (select class_id, count(*) total, count(*) filter (where paid) paid_n from stu group by class_id) x
      join public.classes c on c.id = x.class_id), '[]'::jsonb)
  ) into r;
  return r;
end $$;

revoke all on function public.my_subscription_lock() from public, anon;
revoke all on function public.subscription_status_for_staff(uuid) from public, anon;
revoke all on function public.subscription_stats_for_principal() from public, anon;
grant execute on function public.my_subscription_lock() to authenticated;
grant execute on function public.subscription_status_for_staff(uuid) to authenticated;
grant execute on function public.subscription_stats_for_principal() to authenticated;
