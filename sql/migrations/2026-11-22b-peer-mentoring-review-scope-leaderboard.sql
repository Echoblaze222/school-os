-- 2026-11-22b Peer mentoring follow-up (already applied to the live Supabase project)
--   1. approvals narrowed to the principal or a teacher assigned to the student's class
--   2. Star Mentor of the Month leaderboard + points
--   3. realtime for the mentoring tables
-- Run AFTER 2026-11-22-peer-mentoring.sql (it replaces review_mentor / review_pairing).

-- Who may approve: principals / vice-principals of the school, or a teacher assigned to the student's CURRENT
-- class. A class nobody is assigned to stays open to every teacher so approvals never get stuck.
CREATE OR REPLACE FUNCTION public.mentoring_can_review(p_school uuid, p_student uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_role text := public.my_role(); v_class uuid;
BEGIN
  IF public.my_school_id() IS DISTINCT FROM p_school THEN RETURN false; END IF;
  IF v_role IN ('principal', 'vice-principal', 'vice_principal') THEN RETURN true; END IF;
  IF v_role IS DISTINCT FROM 'teacher' THEN RETURN false; END IF;
  v_class := public._mentoring_student_class(p_student);
  IF v_class IS NULL THEN RETURN true; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.class_teachers ct WHERE ct.class_id = v_class)
     AND NOT EXISTS (SELECT 1 FROM public.classes c WHERE c.id = v_class AND c.class_teacher_id IS NOT NULL) THEN
    RETURN true;
  END IF;
  RETURN EXISTS (SELECT 1 FROM public.class_teachers ct WHERE ct.class_id = v_class AND ct.teacher_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.classes c WHERE c.id = v_class AND c.class_teacher_id = auth.uid());
END
$fn$;

-- Which mentors / matches the caller may act on (the UI hides the buttons for the rest).
-- Seeing everything in the school, closing a pairing and resolving reports stay open to every teacher.
CREATE OR REPLACE FUNCTION public.mentoring_review_scope()
RETURNS TABLE (kind text, id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT 'mentor'::text, m.id FROM public.mentors m
   WHERE m.school_id = public.my_school_id() AND m.status IN ('pending', 'approved')
     AND public.mentoring_can_review(m.school_id, m.student_id)
  UNION ALL
  SELECT 'pairing'::text, g.id FROM public.mentoring_pairings g
   JOIN public.mentors m ON m.id = g.mentor_id
   WHERE g.school_id = public.my_school_id() AND g.status = 'awaiting_teacher'
     AND (public.mentoring_can_review(g.school_id, g.mentee_id) OR public.mentoring_can_review(g.school_id, m.student_id))
$fn$;

CREATE OR REPLACE FUNCTION public.review_mentor(p_mentor_id uuid, p_decision text, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_uid uuid := auth.uid(); m public.mentors%rowtype; g record; v_subject text;
BEGIN
  IF NOT public.is_mentoring_moderator() THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF p_decision NOT IN ('approved', 'rejected', 'suspended') THEN RAISE EXCEPTION 'Invalid decision'; END IF;
  SELECT * INTO m FROM public.mentors WHERE id = p_mentor_id AND school_id = public.my_school_id();
  IF NOT found THEN RAISE EXCEPTION 'Mentor not found'; END IF;
  IF NOT public.mentoring_can_review(m.school_id, m.student_id) THEN
    RAISE EXCEPTION 'This student is not in one of your classes';
  END IF;
  UPDATE public.mentors
     SET status = p_decision, reviewed_by = v_uid, reviewed_at = now(), review_note = nullif(trim(coalesce(p_note, '')), '')
   WHERE id = p_mentor_id;
  IF p_decision = 'suspended' THEN
    FOR g IN SELECT id FROM public.mentoring_pairings WHERE mentor_id = p_mentor_id AND status IN ('awaiting_teacher', 'active') LOOP
      PERFORM public._mentoring_end_pairing(g.id, v_uid, 'Mentor suspended', false);
    END LOOP;
  END IF;
  SELECT name INTO v_subject FROM public.subjects WHERE id = m.subject_id;
  PERFORM public._mentoring_notify(m.student_id, m.school_id,
    CASE p_decision WHEN 'approved' THEN 'You are now a mentor' WHEN 'rejected' THEN 'Mentor application not approved' ELSE 'Mentoring paused' END,
    CASE p_decision WHEN 'approved' THEN 'Your ' || coalesce(v_subject, '') || ' mentor application was approved.'
                    WHEN 'rejected' THEN 'Your ' || coalesce(v_subject, '') || ' mentor application was not approved.' || coalesce(' ' || nullif(trim(p_note), ''), '')
                    ELSE 'Your mentoring has been paused by a teacher.' END,
    '/dashboard/student/mentoring', m.id, 'mentors');
END
$fn$;

CREATE OR REPLACE FUNCTION public.review_pairing(p_pairing_id uuid, p_approve boolean, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  g public.mentoring_pairings%rowtype;
  v_mentor_student uuid; v_mstatus text; v_subject text; v_room uuid;
BEGIN
  IF NOT public.is_mentoring_moderator() THEN RAISE EXCEPTION 'Not allowed'; END IF;
  SELECT * INTO g FROM public.mentoring_pairings WHERE id = p_pairing_id AND school_id = public.my_school_id() FOR UPDATE;
  IF NOT found THEN RAISE EXCEPTION 'Pairing not found'; END IF;
  IF g.status <> 'awaiting_teacher' THEN RAISE EXCEPTION 'This match was already reviewed'; END IF;
  SELECT m.student_id, m.status INTO v_mentor_student, v_mstatus FROM public.mentors m WHERE m.id = g.mentor_id;
  IF NOT (public.mentoring_can_review(g.school_id, g.mentee_id) OR public.mentoring_can_review(g.school_id, v_mentor_student)) THEN
    RAISE EXCEPTION 'This match is not for one of your classes';
  END IF;
  SELECT name INTO v_subject FROM public.subjects WHERE id = g.subject_id;

  IF NOT p_approve THEN
    UPDATE public.mentoring_pairings
       SET status = 'rejected', reviewed_by = v_uid, reviewed_at = now(), review_note = nullif(trim(coalesce(p_note, '')), '')
     WHERE id = g.id;
    IF g.request_id IS NOT NULL THEN UPDATE public.mentoring_requests SET status = 'pending' WHERE id = g.request_id; END IF;
    PERFORM public._mentoring_notify(g.mentee_id, g.school_id, 'Mentor match not approved',
      'Your ' || coalesce(v_subject, '') || ' match was not approved. Tap request again to find another mentor.', '/dashboard/student/mentoring', g.id, 'mentoring_pairings');
    RETURN jsonb_build_object('status', 'rejected');
  END IF;

  IF v_mstatus <> 'approved' THEN RAISE EXCEPTION 'This mentor is no longer approved'; END IF;

  INSERT INTO public.chat_rooms (school_id, room_type, name, is_group, created_by, posting_mode)
  VALUES (g.school_id, 'peer_group', 'Mentoring: ' || coalesce(v_subject, 'Session'), true, v_uid, 'everyone')
  RETURNING id INTO v_room;
  INSERT INTO public.chat_room_members (room_id, user_id, role)
  VALUES (v_room, v_uid, 'admin'), (v_room, v_mentor_student, 'member'), (v_room, g.mentee_id, 'member');

  UPDATE public.mentoring_pairings
     SET status = 'active', reviewed_by = v_uid, reviewed_at = now(), review_note = nullif(trim(coalesce(p_note, '')), ''),
         chat_room_id = v_room, grade_before = public._mentoring_subject_avg(g.mentee_id, g.subject_id)
   WHERE id = g.id;

  PERFORM public._mentoring_notify(g.mentee_id, g.school_id, 'Your mentor is ready',
    'Your ' || coalesce(v_subject, '') || ' mentoring was approved. You can chat and plan a session now.', '/dashboard/student/mentoring', g.id, 'mentoring_pairings');
  PERFORM public._mentoring_notify(v_mentor_student, g.school_id, 'New mentee',
    'A teacher approved your ' || coalesce(v_subject, '') || ' mentoring match.', '/dashboard/student/mentoring', g.id, 'mentoring_pairings');
  RETURN jsonb_build_object('status', 'active', 'chat_room_id', v_room);
END
$fn$;

-- Leaderboard + points: 10 points per finished session in the month, plus the star rating the mentee gave.
-- Star Mentor of the Month = rank 1 with at least one finished session. Defaults to the current month (Lagos time).
CREATE OR REPLACE FUNCTION public.mentoring_leaderboard(p_month date DEFAULT NULL)
RETURNS TABLE (rank int, mentor_id uuid, student_id uuid, student_name text, subject_name text,
               sessions_done bigint, avg_rating numeric, points bigint, is_star boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  WITH bounds AS (
    SELECT date_trunc('month', coalesce(p_month::timestamp, now() AT TIME ZONE 'Africa/Lagos')) AS d0
  ),
  scored AS (
    SELECT m.id AS mentor_id, m.student_id, p.full_name AS student_name, s.name AS subject_name,
           count(x.id) AS sessions_done,
           round(avg(x.rating), 1) AS avg_rating,
           (count(x.id) * 10 + coalesce(sum(x.rating), 0))::bigint AS points
    FROM public.mentors m
    JOIN public.profiles p ON p.id = m.student_id
    JOIN public.subjects s ON s.id = m.subject_id
    CROSS JOIN bounds b
    LEFT JOIN public.mentoring_pairings g ON g.mentor_id = m.id
    LEFT JOIN public.mentoring_sessions x ON x.pairing_id = g.id AND x.status = 'done'
         AND (x.completed_at AT TIME ZONE 'Africa/Lagos') >= b.d0
         AND (x.completed_at AT TIME ZONE 'Africa/Lagos') < b.d0 + interval '1 month'
    WHERE m.school_id = public.my_school_id() AND m.status = 'approved'
    GROUP BY m.id, m.student_id, p.full_name, s.name
  ),
  ranked AS (
    SELECT row_number() OVER (ORDER BY points DESC, avg_rating DESC NULLS LAST, sessions_done DESC, student_name)::int AS rank, *
    FROM scored WHERE sessions_done > 0
  )
  SELECT rank, mentor_id, student_id, student_name, subject_name, sessions_done, avg_rating, points, rank = 1
  FROM ranked WHERE rank <= 10 ORDER BY rank
$fn$;

-- Live updates for the mentoring pages (realtime applies the SELECT policies per subscriber)
DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['mentors', 'mentoring_requests', 'mentoring_pairings', 'mentoring_sessions', 'mentoring_reports'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END
$do$;

REVOKE ALL ON FUNCTION public.mentoring_can_review(uuid, uuid) FROM public, anon, authenticated;
DO $do$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['mentoring_review_scope()', 'mentoring_leaderboard(date)', 'review_mentor(uuid,text,text)', 'review_pairing(uuid,boolean,text)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM public, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END
$do$;
