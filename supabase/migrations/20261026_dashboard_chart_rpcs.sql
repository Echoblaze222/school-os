-- Dashboard chart RPCs.
-- All functions are SECURITY INVOKER, so existing RLS decides which rows each role sees.
-- Not applied anywhere yet. Review, then run in the Supabase SQL editor.
-- Every SELECT body below was dry-run read-only against the live schema and executes without error.

-- Attendance: daily present/absent and rate
create or replace function public.chart_attendance_trend(p_days int default 30)
returns table (day date, present bigint, absent bigint, rate numeric)
language sql stable security invoker set search_path = public as $$
  select a.date as day,
         count(*) filter (where coalesce(a.is_present, false)) as present,
         count(*) filter (where not coalesce(a.is_present, false)) as absent,
         round(100.0 * count(*) filter (where coalesce(a.is_present, false)) / nullif(count(*), 0), 1) as rate
  from attendance a
  where a.date >= current_date - greatest(p_days, 1)
  group by a.date
  order by a.date;
$$;

-- Fees: invoice status split (donut)
create or replace function public.chart_fee_status()
returns table (status text, invoices bigint, amount_due numeric, amount_paid numeric)
language sql stable security invoker set search_path = public as $$
  select pi.status::text, count(*)::bigint,
         coalesce(sum(pi.amount_due_ngn), 0), coalesce(sum(pi.amount_paid_ngn), 0)
  from payment_invoices pi
  group by pi.status;
$$;

-- Fees: revenue per month (area)
create or replace function public.chart_revenue_by_month(p_months int default 12)
returns table (month date, total numeric)
language sql stable security invoker set search_path = public as $$
  select date_trunc('month', p.paid_at)::date, sum(p.amount_paid_ngn)
  from payments p
  where p.paid_at >= date_trunc('month', current_date) - make_interval(months => greatest(p_months, 1) - 1)
  group by 1
  order by 1;
$$;

-- Fees: outstanding balance per class (horizontal bar)
create or replace function public.chart_outstanding_by_class()
returns table (class_name text, outstanding numeric, invoices bigint)
language sql stable security invoker set search_path = public as $$
  select coalesce(c.name, c.section), sum(pi.balance_ngn), count(*)::bigint
  from payment_invoices pi
  join student_profiles sp on sp.id = pi.student_id
  join classes c on c.id = sp.class_id
  where pi.balance_ngn > 0
  group by 1
  order by 2 desc;
$$;

-- Enrollment: students per class (bar)
create or replace function public.chart_enrollment_by_class()
returns table (class_name text, students bigint)
language sql stable security invoker set search_path = public as $$
  select coalesce(c.name, c.section), count(sp.id)::bigint
  from classes c
  left join student_profiles sp on sp.class_id = c.id
  where coalesce(c.is_active, true)
  group by 1
  order by 1;
$$;

-- Results: raw percentage scores for the Histogram component
create or replace function public.chart_score_distribution(p_term text default null, p_year text default null)
returns table (pct numeric)
language sql stable security invoker set search_path = public as $$
  select round(100.0 * r.score / nullif(r.max_score, 0), 1)
  from results r
  where r.score is not null and r.max_score > 0
    and (p_term is null or r.term::text = p_term)
    and (p_year is null or r.academic_year::text = p_year);
$$;

-- Assignments: submission rate for the latest assignments (bar)
create or replace function public.chart_assignment_submission_rate(p_limit int default 8)
returns table (title text, submitted bigint, total_students bigint, rate numeric)
language sql stable security invoker set search_path = public as $$
  select a.title, count(s.id)::bigint, coalesce(a.total_students, 0)::bigint,
         round(100.0 * count(s.id) / nullif(a.total_students, 0), 1)
  from assignments a
  left join assignment_submissions s on s.assignment_id = a.id
  group by a.id, a.title, a.total_students, a.created_at
  order by a.created_at desc
  limit greatest(p_limit, 1);
$$;

-- ICT: tickets by status (donut)
create or replace function public.chart_ict_tickets_by_status()
returns table (status text, n bigint)
language sql stable security invoker set search_path = public as $$
  select t.status::text, count(*)::bigint from ict_tickets t group by 1;
$$;

-- Library: loans per week (area)
create or replace function public.chart_library_loans_weekly()
returns table (week date, loans bigint)
language sql stable security invoker set search_path = public as $$
  select date_trunc('week', l.borrowed_at)::date, count(*)::bigint
  from library_loans l group by 1 order by 1;
$$;

-- Nurse: clinic visits per week (area)
create or replace function public.chart_clinic_visits_weekly()
returns table (week date, visits bigint)
language sql stable security invoker set search_path = public as $$
  select date_trunc('week', v.visited_at)::date, count(*)::bigint
  from clinic_visits v group by 1 order by 1;
$$;

-- Counselor: sessions per week (line)
create or replace function public.chart_counseling_sessions_weekly()
returns table (week date, sessions bigint)
language sql stable security invoker set search_path = public as $$
  select date_trunc('week', s.scheduled_at)::date, count(*)::bigint
  from counseling_sessions s group by 1 order by 1;
$$;

-- Lock down execution: signed-in users only, never anon
revoke all on function public.chart_attendance_trend(int) from public, anon;
revoke all on function public.chart_fee_status() from public, anon;
revoke all on function public.chart_revenue_by_month(int) from public, anon;
revoke all on function public.chart_outstanding_by_class() from public, anon;
revoke all on function public.chart_enrollment_by_class() from public, anon;
revoke all on function public.chart_score_distribution(text, text) from public, anon;
revoke all on function public.chart_assignment_submission_rate(int) from public, anon;
revoke all on function public.chart_ict_tickets_by_status() from public, anon;
revoke all on function public.chart_library_loans_weekly() from public, anon;
revoke all on function public.chart_clinic_visits_weekly() from public, anon;
revoke all on function public.chart_counseling_sessions_weekly() from public, anon;

grant execute on function public.chart_attendance_trend(int) to authenticated;
grant execute on function public.chart_fee_status() to authenticated;
grant execute on function public.chart_revenue_by_month(int) to authenticated;
grant execute on function public.chart_outstanding_by_class() to authenticated;
grant execute on function public.chart_enrollment_by_class() to authenticated;
grant execute on function public.chart_score_distribution(text, text) to authenticated;
grant execute on function public.chart_assignment_submission_rate(int) to authenticated;
grant execute on function public.chart_ict_tickets_by_status() to authenticated;
grant execute on function public.chart_library_loans_weekly() to authenticated;
grant execute on function public.chart_clinic_visits_weekly() to authenticated;
grant execute on function public.chart_counseling_sessions_weekly() to authenticated;
