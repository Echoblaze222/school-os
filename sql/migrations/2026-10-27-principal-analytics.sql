-- Principal analytics RPCs. Applied to production as migrations
-- `principal_analytics_rpcs` and `principal_attendance_rpc_definer`.
-- School is always derived from auth.uid(); only principals may call these.

create or replace function public.analytics_principal_school()
returns uuid language plpgsql stable security invoker set search_path = public as $$
declare v_school uuid; v_role text;
begin
  select school_id, role into v_school, v_role from profiles where id = auth.uid();
  if v_school is null or v_role <> 'principal' then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  return v_school;
end $$;

create or replace function public.principal_analytics_finance()
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare s uuid := public.analytics_principal_school(); r jsonb;
begin
  select jsonb_build_object(
    'billed',      coalesce((select sum(amount_due_ngn) from payment_invoices where school_id=s),0),
    'collected',   coalesce((select sum(amount_paid_ngn) from payments where school_id=s),0),
    'outstanding', coalesce((select sum(balance_ngn) from payment_invoices where school_id=s),0),
    'invoice_count', (select count(*) from payment_invoices where school_id=s),
    'monthly', coalesce((select jsonb_agg(jsonb_build_object('month', m, 'collected', v) order by m)
        from (select to_char(date_trunc('month', paid_at),'YYYY-MM') m, sum(amount_paid_ngn) v
              from payments where school_id=s and paid_at >= date_trunc('month', now()) - interval '11 months'
              group by 1) x),'[]'),
    'by_method', coalesce((select jsonb_agg(jsonb_build_object('method', method, 'amount', v, 'count', c) order by v desc)
        from (select coalesce(payment_method,'unknown') method, sum(amount_paid_ngn) v, count(*) c
              from payments where school_id=s group by 1) x),'[]'),
    'by_class', coalesce((select jsonb_agg(jsonb_build_object('class', cname, 'billed', b, 'paid', p, 'outstanding', o) order by cname)
        from (select c.name cname, sum(i.amount_due_ngn) b, sum(i.amount_paid_ngn) p, sum(i.balance_ngn) o
              from payment_invoices i join profiles st on st.id=i.student_id join classes c on c.id=st.class_id
              where i.school_id=s group by c.name) x),'[]'),
    'aging', coalesce((select jsonb_agg(jsonb_build_object('bucket', bucket, 'amount', v, 'count', c) order by ord)
        from (select case when due_date >= current_date then 'Not yet due'
                          when current_date - due_date <= 30 then '1-30 days'
                          when current_date - due_date <= 60 then '31-60 days'
                          else '60+ days' end bucket,
                     case when due_date >= current_date then 1 when current_date - due_date <= 30 then 2
                          when current_date - due_date <= 60 then 3 else 4 end ord,
                     sum(balance_ngn) v, count(*) c
              from payment_invoices where school_id=s and balance_ngn > 0 group by 1,2) x),'[]'),
    'status_mix', coalesce((select jsonb_agg(jsonb_build_object('status', st, 'count', c))
        from (select status::text st, count(*) c from payment_invoices where school_id=s group by 1) x),'[]')
  ) into r;
  return r;
end $$;

create or replace function public.principal_analytics_academics(p_term text default null, p_year text default null)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare s uuid := public.analytics_principal_school(); r jsonb;
begin
  with base as (
    select r.score, r.max_score, r.term::text term, r.academic_year yr, r.student_id,
           sub.name subject, c.name cname,
           case when r.max_score > 0 then r.score / r.max_score * 100 end pct
    from results r
    join class_subjects cs on cs.id = r.class_subject_id
    join subjects sub on sub.id = cs.subject_id
    join classes c on c.id = cs.class_id
    where r.school_id = s and r.approved = true
  ), scoped as (
    select * from base where (p_term is null or term = p_term) and (p_year is null or yr = p_year)
  )
  select jsonb_build_object(
    'average', (select round(avg(pct),1) from scoped),
    'pass_rate', (select round(100.0 * count(*) filter (where pct >= 50) / nullif(count(*),0),1) from scoped),
    'result_count', (select count(*) from scoped),
    'by_subject', coalesce((select jsonb_agg(jsonb_build_object('subject', subject, 'average', a, 'pass_rate', pr) order by a desc)
        from (select subject, round(avg(pct),1) a, round(100.0*count(*) filter (where pct>=50)/count(*),1) pr from scoped group by subject) x),'[]'),
    'by_class', coalesce((select jsonb_agg(jsonb_build_object('class', cname, 'average', a) order by cname)
        from (select cname, round(avg(pct),1) a from scoped group by cname) x),'[]'),
    'heatmap', coalesce((select jsonb_agg(jsonb_build_object('class', cname, 'subject', subject, 'average', a))
        from (select cname, subject, round(avg(pct),1) a from scoped group by 1,2) x),'[]'),
    'grades', coalesce((select jsonb_agg(jsonb_build_object('band', band, 'count', c) order by ord)
        from (select case when pct>=70 then 'A (70+)' when pct>=60 then 'B (60-69)' when pct>=50 then 'C (50-59)'
                          when pct>=40 then 'D (40-49)' else 'F (<40)' end band,
                     case when pct>=70 then 1 when pct>=60 then 2 when pct>=50 then 3 when pct>=40 then 4 else 5 end ord,
                     count(*) c from scoped where pct is not null group by 1,2) x),'[]'),
    'term_trend', coalesce((select jsonb_agg(jsonb_build_object('year', yr, 'term', term, 'average', a, 'pass_rate', pr) order by yr, term_ord)
        from (select yr, term, case term when 'first' then 1 when 'second' then 2 else 3 end term_ord,
                     round(avg(pct),1) a, round(100.0*count(*) filter (where pct>=50)/count(*),1) pr
              from base group by 1,2) x),'[]')
  ) into r;
  return r;
end $$;

-- SECURITY DEFINER: attendance RLS only exposes rows to teachers/parents/the
-- student, so a principal cannot read them directly. This function is
-- role-guarded, school-scoped and returns aggregates only.
create or replace function public.principal_analytics_attendance(p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s uuid := public.analytics_principal_school(); r jsonb; d0 date := current_date - greatest(least(p_days,365),1);
begin
  select jsonb_build_object(
    'rate', (select round(100.0*count(*) filter (where status in ('present','late'))/nullif(count(*),0),1) from attendance where school_id=s and date>d0),
    'marks', (select count(*) from attendance where school_id=s and date>d0),
    'daily', coalesce((select jsonb_agg(jsonb_build_object('date', d, 'rate', rt) order by d)
        from (select date d, round(100.0*count(*) filter (where status in ('present','late'))/count(*),1) rt
              from attendance where school_id=s and date>d0 group by date) x),'[]'),
    'status_mix', coalesce((select jsonb_agg(jsonb_build_object('status', status, 'count', c))
        from (select status, count(*) c from attendance where school_id=s and date>d0 group by status) x),'[]'),
    'by_class', coalesce((select jsonb_agg(jsonb_build_object('class', cname, 'rate', rt) order by cname)
        from (select c.name cname, round(100.0*count(*) filter (where a.status in ('present','late'))/count(*),1) rt
              from attendance a join classes c on c.id=a.class_id where a.school_id=s and a.date>d0 group by c.name) x),'[]'),
    'weekday', coalesce((select jsonb_agg(jsonb_build_object('dow', dow, 'rate', rt) order by dow)
        from (select extract(isodow from date)::int dow, round(100.0*count(*) filter (where status in ('present','late'))/count(*),1) rt
              from attendance where school_id=s and date>d0 group by 1) x),'[]'),
    'chronic_absentees', (select count(*) from (select student_id from attendance where school_id=s and date>d0
              group by student_id having 100.0*count(*) filter (where status in ('present','late'))/count(*) < 80) x)
  ) into r;
  return r;
end $$;

revoke all on function public.analytics_principal_school() from public, anon;
revoke all on function public.principal_analytics_finance() from public, anon;
revoke all on function public.principal_analytics_academics(text,text) from public, anon;
revoke all on function public.principal_analytics_attendance(int) from public, anon;
grant execute on function public.analytics_principal_school() to authenticated;
grant execute on function public.principal_analytics_finance() to authenticated;
grant execute on function public.principal_analytics_academics(text,text) to authenticated;
grant execute on function public.principal_analytics_attendance(int) to authenticated;
