-- APPLIED to Supabase project "school portal" (hgoasuqnuhltxocbcjnr) as migration
-- `per_student_subscriptions_grace_from_setup`.
--
-- Grace is counted from the LATER of (term start, the day the term row was
-- created), so switching this feature on mid-term never locks every unpaid
-- student instantly. Defines the four RPCs the app calls.
--
-- Prerequisite: 2026-11-21-per-student-subscriptions.sql.

create or replace function public._grace_ends(t public.school_terms)
 returns date language sql immutable set search_path = public as $$
  select greatest(t.starts_on, t.created_at::date) + t.grace_days;
$$;
revoke all on function public._grace_ends(public.school_terms) from public, anon, authenticated;

create or replace function public.current_term_json(p_school uuid)
 returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare t public.school_terms;
begin
  t := public._current_term(p_school);
  if t.id is null then return null; end if;
  return jsonb_build_object(
    'id', t.id, 'term_name', t.term_name, 'academic_year', t.academic_year,
    'starts_on', t.starts_on, 'ends_on', t.ends_on, 'grace_days', t.grace_days,
    'grace_ends_on', public._grace_ends(t), 'is_default', t.is_default);
end $$;

create or replace function public.my_subscription_lock()
 returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid(); prof record; t public.school_terms; paid boolean;
begin
  select role, school_id into prof from public.profiles where id = me;
  if prof.role is distinct from 'student' or prof.school_id is null then
    return jsonb_build_object('locked', false);
  end if;
  t := public._current_term(prof.school_id);
  if t.id is null then return jsonb_build_object('locked', false, 'reason', 'no_term'); end if;
  select exists (select 1 from public.student_subscriptions s
                 where s.student_id = me and s.term_id = t.id and s.status = 'paid') into paid;
  return jsonb_build_object(
    'locked', (not paid) and current_date > public._grace_ends(t),
    'paid', paid, 'term_id', t.id, 'term_name', t.term_name,
    'grace_ends_on', public._grace_ends(t));
end $$;

create or replace function public.subscription_status_for_staff(p_class uuid default null)
 returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare me uuid := auth.uid(); prof record; t public.school_terms; r jsonb;
begin
  select role, school_id into prof from public.profiles where id = me;
  if prof.school_id is null or prof.role not in ('teacher','bursar') then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  t := public._current_term(prof.school_id);
  if t.id is null then return jsonb_build_object('term', null, 'students', '[]'::jsonb); end if;
  select jsonb_build_object(
    'term', jsonb_build_object('id', t.id, 'name', t.term_name, 'grace_ends_on', public._grace_ends(t)),
    'students', coalesce(jsonb_agg(jsonb_build_object(
        'student_id', st.id, 'name', st.full_name, 'class_id', st.class_id, 'class', c.name,
        'paid', exists (select 1 from public.student_subscriptions s
                        where s.student_id = st.id and s.term_id = t.id and s.status = 'paid')
      ) order by c.name, st.full_name), '[]'::jsonb)
  ) into r
  from public.profiles st join public.classes c on c.id = st.class_id
  where st.role = 'student' and st.is_active and st.school_id = prof.school_id
    and (p_class is null or st.class_id = p_class)
    and (prof.role = 'bursar' or c.class_teacher_id = me
         or c.id in (select class_id from public.class_teachers where teacher_id = me and school_id = prof.school_id));
  return r;
end $$;

create or replace function public.subscription_stats_for_principal()
 returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare me uuid := auth.uid(); prof record; t public.school_terms; r jsonb;
begin
  select role, school_id into prof from public.profiles where id = me;
  if prof.school_id is null or prof.role <> 'principal' then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  t := public._current_term(prof.school_id);
  if t.id is null then return jsonb_build_object('term', null); end if;
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
                               'grace_ends_on', public._grace_ends(t), 'is_default', t.is_default),
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

revoke all on function public.current_term_json(uuid) from public, anon, authenticated;
grant execute on function public.current_term_json(uuid) to service_role;
revoke all on function public.my_subscription_lock() from public, anon;
revoke all on function public.subscription_status_for_staff(uuid) from public, anon;
revoke all on function public.subscription_stats_for_principal() from public, anon;
grant execute on function public.my_subscription_lock() to authenticated;
grant execute on function public.subscription_status_for_staff(uuid) to authenticated;
grant execute on function public.subscription_stats_for_principal() to authenticated;
