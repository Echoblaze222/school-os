-- Analytics RPCs for bursar, teacher, student and parent.
-- All derive the school / identity from auth.uid() via public.analytics_guard (see 2026-10-27-analytics-guard.sql).
-- Student and parent data goes through a SECURITY DEFINER core that is NOT granted to API roles; the
-- public wrappers enforce ownership (student = self, parent = linked children only) and hide fees from students.

CREATE OR REPLACE FUNCTION public._student_analytics_core(p_student uuid, p_term text, p_year text, p_days integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  d0 date := current_date - greatest(least(p_days,365),7);
  v_term text := p_term; v_year text := p_year;
  v_class uuid; v_name text; v_cname text; r jsonb;
begin
  select p.class_id, p.full_name, c.name into v_class, v_name, v_cname
  from profiles p left join classes c on c.id = p.class_id where p.id = p_student and p.role = 'student';
  if v_name is null then raise exception 'not authorised' using errcode = '42501'; end if;

  if v_term is null or v_year is null then
    select r.term::text, r.academic_year into v_term, v_year from results r
    where r.student_id = p_student and r.approved order by r.academic_year desc,
      case r.term::text when 'first' then 1 when 'second' then 2 else 3 end desc limit 1;
  end if;

  with mine as (
    select r.class_subject_id, r.term::text term, r.academic_year yr, sub.name subject,
           case when r.max_score>0 then r.score/r.max_score*100 end pct
    from results r join class_subjects cs on cs.id = r.class_subject_id join subjects sub on sub.id = cs.subject_id
    where r.student_id = p_student and r.approved
  ), cls as (
    select r.class_subject_id, r.term::text term, r.academic_year yr, case when r.max_score>0 then r.score/r.max_score*100 end pct
    from results r where r.approved and r.class_subject_id in (select class_subject_id from mine)
  ), att as (
    select * from attendance where student_id = p_student and date > d0
  ), asg as (
    select a.id, a.title, a.subject, a.due_date, a.max_score, sb.status::text sstatus, sb.score
    from assignments a left join assignment_submissions sb on sb.assignment_id = a.id and sb.student_id = p_student
    where a.class_id = v_class and a.status = 'active'
  )
  select jsonb_build_object(
    'student', jsonb_build_object('id', p_student, 'name', v_name, 'class', v_cname),
    'term', v_term, 'year', v_year,
    'terms', coalesce((select jsonb_agg(jsonb_build_object('year', yr, 'term', term) order by yr, tord) from (
        select distinct yr, term, case term when 'first' then 1 when 'second' then 2 else 3 end tord from mine) x),'[]'),
    'average', (select round(avg(pct),1) from mine where term = v_term and yr = v_year),
    'class_average', (select round(avg(pct),1) from cls where term = v_term and yr = v_year),
    'subjects', coalesce((select jsonb_agg(jsonb_build_object('subject', subject, 'mine', m, 'class', c) order by m desc) from (
        select g.subject, g.m,
               (select round(avg(cls.pct),1) from cls where cls.term = v_term and cls.yr = v_year
                  and cls.class_subject_id in (select m2.class_subject_id from mine m2 where m2.subject = g.subject)) c
        from (select subject, round(avg(pct),1) m from mine where term = v_term and yr = v_year group by subject) g) x),'[]'),
    'trend', coalesce((select jsonb_agg(jsonb_build_object('year', yr, 'term', term, 'mine', m, 'class', c) order by yr, tord) from (
        select g.yr, g.term, g.tord, g.m,
               (select round(avg(cls.pct),1) from cls where cls.term = g.term and cls.yr = g.yr) c
        from (select yr, term, case term when 'first' then 1 when 'second' then 2 else 3 end tord, round(avg(pct),1) m
              from mine group by yr, term) g) x),'[]'),
    'attendance', jsonb_build_object(
        'rate', (select round(100.0*count(*) filter (where status in ('present','late'))/nullif(count(*),0),1) from att),
        'present', (select count(*) from att where status='present'), 'late', (select count(*) from att where status='late'),
        'absent', (select count(*) from att where status='absent'),
        'days', coalesce((select jsonb_agg(jsonb_build_object('date', date, 'status', status) order by date) from att),'[]')),
    'assignments', jsonb_build_object(
        'funnel', coalesce((select jsonb_agg(jsonb_build_object('status', s, 'count', c)) from (
            select coalesce(sstatus,'pending') s, count(*) c from asg group by 1) x),'[]'),
        'avg_pct', (select round(avg(score/nullif(max_score,0)*100),1) from asg where sstatus='graded'),
        'to_do', coalesce((select jsonb_agg(jsonb_build_object('title', title, 'subject', subject, 'due', to_char(due_date,'YYYY-MM-DD'), 'overdue', due_date < now()) order by due_date) from (
            select * from asg where coalesce(sstatus,'pending') = 'pending' order by due_date desc limit 6) x),'[]')),
    'quizzes', coalesce((select jsonb_agg(jsonb_build_object('title', title, 'mine', pctm, 'class', pctc) order by starts) from (
        select q.title, q.starts_at starts, qa.percentage pctm,
               (select round(avg(q2.percentage),1) from quiz_attempts q2 where q2.quiz_id = q.id) pctc
        from quiz_attempts qa join quizzes q on q.id = qa.quiz_id where qa.student_id = p_student order by q.starts_at desc limit 8) x),'[]'),
    'fees', jsonb_build_object(
        'billed', coalesce((select sum(amount_due_ngn) from payment_invoices where student_id = p_student),0),
        'paid', coalesce((select sum(amount_paid_ngn) from payment_invoices where student_id = p_student),0),
        'balance', coalesce((select sum(balance_ngn) from payment_invoices where student_id = p_student),0),
        'next_due', (select to_char(min(due_date),'YYYY-MM-DD') from payment_invoices where student_id = p_student and balance_ngn > 0),
        'overdue', coalesce((select sum(balance_ngn) from payment_invoices where student_id = p_student and balance_ngn > 0 and due_date < current_date),0),
        'history', coalesce((select jsonb_agg(jsonb_build_object('month', m, 'amount', v) order by m) from (
            select to_char(date_trunc('month', paid_at),'YYYY-MM') m, sum(amount_paid_ngn) v from payments where student_id = p_student group by 1) x),'[]'))
  ) into r;
  return r;
end $function$;

CREATE OR REPLACE FUNCTION public.bursar_analytics(p_days integer DEFAULT 180)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  s uuid := public.analytics_guard(array['bursar']);
  d0 timestamptz := now() - (greatest(least(p_days,730),7) || ' days')::interval;
  r jsonb;
begin
  select jsonb_build_object(
    'billed',      coalesce((select sum(amount_due_ngn) from payment_invoices where school_id=s),0),
    'collected',   coalesce((select sum(amount_paid_ngn) from payments where school_id=s),0),
    'outstanding', coalesce((select sum(balance_ngn) from payment_invoices where school_id=s),0),
    'collected_window', coalesce((select sum(amount_paid_ngn) from payments where school_id=s and paid_at>=d0),0),
    'expenses_window',  coalesce((select sum(amount) from school_expenses where school_id=s and paid_at>=d0),0),
    'platform_fees_window', coalesce((select sum(platform_fee_ngn) from payments where school_id=s and paid_at>=d0),0),
    'weekly', coalesce((select jsonb_agg(jsonb_build_object('week', w, 'collected', v) order by w) from (
        select to_char(date_trunc('week', paid_at),'YYYY-MM-DD') w, sum(amount_paid_ngn) v
        from payments where school_id=s and paid_at>=d0 group by 1) x),'[]'),
    'cashflow', coalesce((select jsonb_agg(jsonb_build_object('month', m, 'collected', coalesce(c,0), 'expenses', coalesce(e,0)) order by m) from (
        select coalesce(a.m,b.m) m, a.c, b.e from
          (select to_char(date_trunc('month', paid_at),'YYYY-MM') m, sum(amount_paid_ngn) c from payments where school_id=s and paid_at>=d0 group by 1) a
          full join
          (select to_char(date_trunc('month', paid_at),'YYYY-MM') m, sum(amount) e from school_expenses where school_id=s and paid_at>=d0 group by 1) b on a.m=b.m) x),'[]'),
    'by_method', coalesce((select jsonb_agg(jsonb_build_object('method', method, 'amount', v, 'count', c) order by v desc) from (
        select coalesce(payment_method,'unknown') method, sum(amount_paid_ngn) v, count(*) c
        from payments where school_id=s and paid_at>=d0 group by 1) x),'[]'),
    'by_class', coalesce((select jsonb_agg(jsonb_build_object('class', cname, 'billed', b, 'paid', p, 'outstanding', o) order by cname) from (
        select c.name cname, sum(i.amount_due_ngn) b, sum(i.amount_paid_ngn) p, sum(i.balance_ngn) o
        from payment_invoices i join profiles st on st.id=i.student_id join classes c on c.id=st.class_id
        where i.school_id=s group by c.name) x),'[]'),
    'aging', coalesce((select jsonb_agg(jsonb_build_object('bucket', bucket, 'amount', v, 'count', c) order by ord) from (
        select case when due_date >= current_date then 'Not yet due' when current_date-due_date<=30 then '1-30 days'
                    when current_date-due_date<=60 then '31-60 days' else '60+ days' end bucket,
               case when due_date >= current_date then 1 when current_date-due_date<=30 then 2
                    when current_date-due_date<=60 then 3 else 4 end ord, sum(balance_ngn) v, count(*) c
        from payment_invoices where school_id=s and balance_ngn>0 group by 1,2) x),'[]'),
    'top_debtors', coalesce((select jsonb_agg(jsonb_build_object('student', nm, 'class', cname, 'balance', bal, 'days_overdue', od) order by bal desc) from (
        select st.full_name nm, c.name cname, sum(i.balance_ngn) bal, greatest(0, max(current_date - i.due_date)) od
        from payment_invoices i join profiles st on st.id=i.student_id left join classes c on c.id=st.class_id
        where i.school_id=s and i.balance_ngn>0 group by st.id, st.full_name, c.name order by sum(i.balance_ngn) desc limit 8) x),'[]'),
    'invoice_status', coalesce((select jsonb_agg(jsonb_build_object('status', st, 'count', c, 'amount', a)) from (
        select status::text st, count(*) c, sum(amount_due_ngn) a from payment_invoices where school_id=s group by 1) x),'[]'),
    'claims', jsonb_build_object(
        'by_status', coalesce((select jsonb_agg(jsonb_build_object('status', status, 'count', c, 'amount', a)) from (
            select status, count(*) c, sum(amount_claimed) a from payment_claims where school_id=s group by 1) x),'[]'),
        'pending_age', coalesce((select jsonb_agg(jsonb_build_object('bucket', b, 'count', c) order by ord) from (
            select case when now()-created_at < interval '3 days' then '0-2 days' when now()-created_at < interval '8 days' then '3-7 days' else '8+ days' end b,
                   case when now()-created_at < interval '3 days' then 1 when now()-created_at < interval '8 days' then 2 else 3 end ord, count(*) c
            from payment_claims where school_id=s and status='pending' group by 1,2) x),'[]'),
        'avg_review_hours', (select round(avg(extract(epoch from (reviewed_at-created_at))/3600)::numeric,1) from payment_claims where school_id=s and reviewed_at is not null)),
    'reminders', coalesce((select jsonb_agg(jsonb_build_object('channel', ch, 'sent', sent, 'failed', failed, 'pending', pend)) from (
        select fr.channel::text ch, count(*) filter (where fr.status='sent') sent, count(*) filter (where fr.status='failed') failed,
               count(*) filter (where fr.status='pending') pend
        from fee_reminders fr join payment_invoices i on i.id=fr.invoice_id
        where i.school_id=s and fr.created_at>=d0 group by 1) x),'[]'),
    'expenses_by_category', coalesce((select jsonb_agg(jsonb_build_object('category', category, 'amount', v) order by v desc) from (
        select category, sum(amount) v from school_expenses where school_id=s and paid_at>=d0 group by 1) x),'[]')
  ) into r;
  return r;
end $function$;

CREATE OR REPLACE FUNCTION public.student_analytics(p_term text DEFAULT NULL::text, p_year text DEFAULT NULL::text, p_days integer DEFAULT 60)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.analytics_guard(array['student']);
  -- students don't have a fees screen: keep fee data out of their payload
  return public._student_analytics_core(auth.uid(), p_term, p_year, p_days) - 'fees';
end $function$;

CREATE OR REPLACE FUNCTION public.parent_analytics(p_child uuid DEFAULT NULL::uuid, p_term text DEFAULT NULL::text, p_year text DEFAULT NULL::text, p_days integer DEFAULT 60)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare me uuid := auth.uid(); v_child uuid; kids jsonb;
begin
  perform public.analytics_guard(array['parent']);
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name, 'class', c.name) order by p.full_name),'[]') into kids
  from profiles p left join classes c on c.id = p.class_id
  where p.role = 'student' and (p.id in (select student_id from parent_student_links where parent_id = me) or p.parent_id = me);
  if p_child is null then
    v_child := (kids->0->>'id')::uuid;
  else
    if not exists (select 1 from jsonb_array_elements(kids) k where (k->>'id')::uuid = p_child) then
      raise exception 'not authorised' using errcode = '42501';
    end if;
    v_child := p_child;
  end if;
  if v_child is null then return jsonb_build_object('children', kids); end if;
  return public._student_analytics_core(v_child, p_term, p_year, p_days) || jsonb_build_object('children', kids);
end $function$;

CREATE OR REPLACE FUNCTION public.teacher_analytics(p_class uuid DEFAULT NULL::uuid, p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s uuid := public.analytics_guard(array['teacher']);
  me uuid := auth.uid();
  d0 date := current_date - greatest(least(p_days,365),1);
  r jsonb;
begin
  with my_classes as (
    select c.id, c.name from classes c
    where c.school_id = s and (
      c.class_teacher_id = me
      or c.id in (select class_id from class_teachers where teacher_id = me and school_id = s)
      or c.id in (select class_id from class_subjects where teacher_id = me))
      and (p_class is null or c.id = p_class)
  ), home as (
    select c.id from classes c where c.school_id = s and (c.class_teacher_id = me
      or c.id in (select class_id from class_teachers where teacher_id = me and school_id = s))
  ), my_cs as (
    select cs.id, cs.class_id, sub.name subject from class_subjects cs
    join subjects sub on sub.id = cs.subject_id
    where cs.class_id in (select id from my_classes)
      and (cs.teacher_id = me or cs.class_id in (select id from home))
  ), res as (
    select r.*, cs.class_id, cs.subject, mc.name cname,
           case when r.max_score > 0 then r.score / r.max_score * 100 end pct
    from results r join my_cs cs on cs.id = r.class_subject_id join my_classes mc on mc.id = cs.class_id
    where r.school_id = s
  ), stud as (
    select p.id, p.full_name, mc.name cname, p.class_id from profiles p join my_classes mc on mc.id = p.class_id
    where p.role = 'student' and p.school_id = s
  ), att as (
    select a.* from attendance a where a.school_id = s and a.date > d0 and a.class_id in (select id from my_classes)
  ), asg as (
    select a.* from assignments a where a.school_id = s and a.class_id in (select id from my_classes)
      and (a.teacher_id = me or a.class_id in (select id from home))
  ), qz as (
    select q.* from quizzes q where q.school_id = s and q.class_id in (select id from my_classes)
      and (q.teacher_id = me or q.class_id in (select id from home))
  )
  select jsonb_build_object(
    'classes', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name) from (
        select c.id, c.name from classes c where c.school_id = s and (
          c.class_teacher_id = me or c.id in (select class_id from class_teachers where teacher_id = me and school_id = s)
          or c.id in (select class_id from class_subjects where teacher_id = me))) x),'[]'),
    'students', (select count(*) from stud),
    'average', (select round(avg(pct),1) from res),
    'pass_rate', (select round(100.0*count(*) filter (where pct>=50)/nullif(count(*),0),1) from res),
    'result_count', (select count(*) from res),
    'by_class_subject', coalesce((select jsonb_agg(jsonb_build_object('class', cname, 'subject', subject, 'average', a, 'pass_rate', pr, 'n', n) order by cname, subject) from (
        select cname, subject, round(avg(pct),1) a, round(100.0*count(*) filter (where pct>=50)/count(*),1) pr, count(*) n from res group by 1,2) x),'[]'),
    'distribution', coalesce((select jsonb_agg(jsonb_build_object('band', band, 'count', c) order by ord) from (
        select case when pct>=70 then '70+' when pct>=60 then '60-69' when pct>=50 then '50-59' when pct>=40 then '40-49' else 'Under 40' end band,
               case when pct>=70 then 1 when pct>=60 then 2 when pct>=50 then 3 when pct>=40 then 4 else 5 end ord, count(*) c
        from res where pct is not null group by 1,2) x),'[]'),
    'term_trend', coalesce((select jsonb_agg(jsonb_build_object('year', yr, 'term', term, 'average', a, 'pass_rate', pr) order by yr, tord) from (
        select academic_year yr, term::text term, case term::text when 'first' then 1 when 'second' then 2 else 3 end tord,
               round(avg(pct),1) a, round(100.0*count(*) filter (where pct>=50)/count(*),1) pr from res group by 1,2,3) x),'[]'),
    'pipeline', jsonb_build_object(
        'posted', (select count(*) from res), 'approved', (select count(*) from res where approved),
        'verified', (select count(*) from res where verified), 'published', (select count(*) from res where published)),
    'at_risk', coalesce((select jsonb_agg(jsonb_build_object('student', nm, 'class', cname, 'average', av, 'attendance', ar) order by av nulls last) from (
        select st.full_name nm, st.cname,
               (select round(avg(pct),1) from res where res.student_id = st.id) av,
               (select round(100.0*count(*) filter (where status in ('present','late'))/nullif(count(*),0),1) from att where att.student_id = st.id) ar
        from stud st) x where av < 45 or ar < 75 limit 10),'[]'),
    'attendance', jsonb_build_object(
        'rate', (select round(100.0*count(*) filter (where status in ('present','late'))/nullif(count(*),0),1) from att),
        'daily', coalesce((select jsonb_agg(jsonb_build_object('date', d, 'rate', rt) order by d) from (
            select date d, round(100.0*count(*) filter (where status in ('present','late'))/count(*),1) rt from att group by date) x),'[]'),
        'weekday', coalesce((select jsonb_agg(jsonb_build_object('dow', dow, 'rate', rt) order by dow) from (
            select extract(isodow from date)::int dow, round(100.0*count(*) filter (where status in ('present','late'))/count(*),1) rt from att group by 1) x),'[]'),
        'by_class', coalesce((select jsonb_agg(jsonb_build_object('class', cname, 'rate', rt) order by cname) from (
            select mc.name cname, round(100.0*count(*) filter (where a.status in ('present','late'))/count(*),1) rt
            from att a join my_classes mc on mc.id = a.class_id group by mc.name) x),'[]')),
    'assignments', jsonb_build_object(
        'total', (select count(*) from asg),
        'funnel', coalesce((select jsonb_agg(jsonb_build_object('status', st, 'count', c) order by ord) from (
            select sb.status::text st, case sb.status::text when 'graded' then 1 when 'submitted' then 2 when 'late' then 3 else 4 end ord, count(*) c
            from assignment_submissions sb join asg on asg.id = sb.assignment_id group by 1,2) x),'[]'),
        'avg_score_pct', (select round(avg(sb.score / nullif(asg.max_score,0) * 100),1) from assignment_submissions sb join asg on asg.id = sb.assignment_id where sb.status='graded'),
        'recent', coalesce((select jsonb_agg(jsonb_build_object('title', title, 'class', cname, 'due', due, 'submitted_pct', sp, 'avg_pct', ap) order by due) from (
            select asg.title, mc.name cname, to_char(asg.due_date,'YYYY-MM-DD') due,
                   round(100.0*count(*) filter (where sb.status<>'pending')/nullif(count(*),0),0) sp,
                   round(avg(sb.score / nullif(asg.max_score,0) * 100) filter (where sb.status='graded'),1) ap
            from asg join my_classes mc on mc.id = asg.class_id join assignment_submissions sb on sb.assignment_id = asg.id
            group by asg.id, asg.title, mc.name, asg.due_date order by asg.due_date desc limit 10) x),'[]')),
    'quizzes', coalesce((select jsonb_agg(jsonb_build_object('title', title, 'class', cname, 'attempts', n, 'participation', part, 'average', av, 'pass_rate', pr) order by starts) from (
        select qz.title, mc.name cname, qz.starts_at starts, count(qa.id) n,
               round(100.0*count(qa.id)/nullif((select count(*) from stud where stud.class_id = qz.class_id),0),0) part,
               round(avg(qa.percentage),1) av, round(100.0*count(*) filter (where qa.passed)/nullif(count(qa.id),0),0) pr
        from qz join my_classes mc on mc.id = qz.class_id left join quiz_attempts qa on qa.quiz_id = qz.id
        group by qz.id, qz.title, mc.name, qz.starts_at, qz.class_id order by qz.starts_at desc limit 10) x),'[]')
  ) into r;
  return r;
end $function$;

-- Grants: the core is internal only.
revoke all on function public._student_analytics_core(uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.bursar_analytics(integer) from public, anon;
revoke all on function public.teacher_analytics(uuid, integer) from public, anon;
revoke all on function public.student_analytics(text, text, integer) from public, anon;
revoke all on function public.parent_analytics(uuid, text, text, integer) from public, anon;
grant execute on function public.bursar_analytics(integer) to authenticated;
grant execute on function public.teacher_analytics(uuid, integer) to authenticated;
grant execute on function public.student_analytics(text, text, integer) to authenticated;
grant execute on function public.parent_analytics(uuid, text, text, integer) to authenticated;
