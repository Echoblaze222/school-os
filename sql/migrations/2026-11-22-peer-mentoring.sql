-- 2026-11-22 Peer mentoring (final state, already applied to the live Supabase project)
--
-- Senior / strong students mentor juniors in a subject. A teacher approves every mentor and every
-- match before the chat opens. Students never write to the mentoring tables directly: every state
-- change goes through a SECURITY DEFINER function that checks who is calling.
--
-- Conventions this file follows (learned from the existing schema):
--   * RLS helpers are my_school_id() / my_role(). get_my_school_id() / get_my_role() are NOT
--     executable by `authenticated`, so policies must not call them.
--   * auth.uid() and helpers are wrapped in (select ...) inside policies (initplan convention).
--   * A student's CURRENT class is student_profiles.class_id -> classes.class_level. profiles.class_id /
--     profiles.class_level go stale on promotion (and class_level sometimes holds the class NAME).
--   * results are approved (not necessarily published); the leaderboard also uses approved.
--   * Mentoring chat = a chat_rooms row of type peer_group created_by the approving teacher, who is
--     therefore its moderator (is_room_moderator / is_room_creator are created_by based).
--
-- Tables: mentors, mentoring_requests, mentoring_pairings, mentoring_sessions, mentoring_reports,
--         mentoring_flag_patterns

-- ── Who may moderate (approve mentors / matches, close pairings, read reports) ─────────────────
CREATE OR REPLACE FUNCTION public.is_mentoring_moderator()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT coalesce(public.my_role() IN ('teacher','principal','vice-principal','vice_principal'), false)
$fn$;

-- ── Tables ──────────────────────────────────────────────────────────────────────
CREATE TABLE public.mentors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  class_levels text[] NOT NULL,                       -- class_level values they can mentor (JSS1, SSS2...)
  available_days text[] NOT NULL DEFAULT '{}',
  available_note text,
  bio text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','suspended')),
  max_mentees smallint NOT NULL DEFAULT 3 CHECK (max_mentees BETWEEN 1 AND 3),
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, subject_id),
  CHECK (cardinality(class_levels) > 0),
  CHECK (available_days <@ ARRAY['mon','tue','wed','thu','fri','sat','sun']::text[])
);

CREATE TABLE public.mentoring_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  mentee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  class_level text NOT NULL,
  topic text NOT NULL,
  preferred_day text CHECK (preferred_day IN ('mon','tue','wed','thu','fri','sat','sun')),
  preferred_time text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','matched','done','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- A match between a mentor and a mentee. Needs teacher approval before the chat room exists.
CREATE TABLE public.mentoring_pairings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  request_id uuid REFERENCES public.mentoring_requests(id) ON DELETE SET NULL,
  mentor_id uuid NOT NULL REFERENCES public.mentors(id) ON DELETE CASCADE,
  mentee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'awaiting_teacher' CHECK (status IN ('awaiting_teacher','active','rejected','closed','completed')),
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text,
  closed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  closed_reason text,
  chat_room_id uuid REFERENCES public.chat_rooms(id) ON DELETE SET NULL,
  grade_before numeric,                               -- mentee's subject average when approved
  grade_after numeric,                                -- ... and when completed
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX mentoring_pairings_open_uniq
  ON public.mentoring_pairings (mentor_id, mentee_id, subject_id)
  WHERE status IN ('awaiting_teacher','active');

CREATE TABLE public.mentoring_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  pairing_id uuid NOT NULL REFERENCES public.mentoring_pairings(id) ON DELETE CASCADE,
  session_date timestamptz NOT NULL,
  goals text,
  notes text,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','done','cancelled')),
  completed_at timestamptz,
  rating smallint CHECK (rating BETWEEN 1 AND 5),
  rating_comment text,
  rated_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.mentoring_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  pairing_id uuid NOT NULL REFERENCES public.mentoring_pairings(id) ON DELETE CASCADE,
  reported_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,   -- NULL = flagged automatically
  source text NOT NULL DEFAULT 'user' CHECK (source IN ('user','auto')),
  reason text NOT NULL,
  message_id uuid,
  message_text text,                                  -- snapshot: students can delete their own messages
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Auto-flag rules for mentoring chats (regex, case-insensitive). Edit rows to tune; not readable by clients.
CREATE TABLE public.mentoring_flag_patterns (
  id serial PRIMARY KEY,
  pattern text NOT NULL,
  reason text NOT NULL
);
INSERT INTO public.mentoring_flag_patterns (pattern, reason) VALUES
  ('\y(whatsapp|telegram|snapchat|instagram|tiktok)\y', 'Mentions an outside app (keep chats in the app)'),
  ('(\+?\d[\s.-]?){10,}', 'Looks like a phone number'),
  ('\y(fuck\w*|shit\w*|bitch\w*|bastard|asshole|idiot|stupid|mumu|olodo)\y', 'Possible bad language');

CREATE INDEX mentors_school_subject_idx ON public.mentors (school_id, subject_id, status);
CREATE INDEX mentors_student_idx ON public.mentors (student_id);
CREATE INDEX mentors_subject_idx ON public.mentors (subject_id);
CREATE INDEX mentoring_requests_mentee_idx ON public.mentoring_requests (mentee_id, status);
CREATE INDEX mentoring_requests_school_idx ON public.mentoring_requests (school_id);
CREATE INDEX mentoring_requests_subject_idx ON public.mentoring_requests (subject_id);
CREATE INDEX mentoring_pairings_mentor_idx ON public.mentoring_pairings (mentor_id, status);
CREATE INDEX mentoring_pairings_mentee_idx ON public.mentoring_pairings (mentee_id, status);
CREATE INDEX mentoring_pairings_school_idx ON public.mentoring_pairings (school_id, status);
CREATE INDEX mentoring_pairings_subject_idx ON public.mentoring_pairings (subject_id);
CREATE INDEX mentoring_pairings_request_idx ON public.mentoring_pairings (request_id) WHERE request_id IS NOT NULL;
CREATE INDEX mentoring_pairings_room_idx ON public.mentoring_pairings (chat_room_id) WHERE chat_room_id IS NOT NULL;
CREATE INDEX mentoring_sessions_pairing_idx ON public.mentoring_sessions (pairing_id);
CREATE INDEX mentoring_reports_school_idx ON public.mentoring_reports (school_id, status);
CREATE INDEX mentoring_reports_pairing_idx ON public.mentoring_reports (pairing_id);

CREATE TRIGGER mentoring_pairings_updated_at BEFORE UPDATE ON public.mentoring_pairings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ── RLS: read-only for clients; writes go through the functions below ─────────────────────
ALTER TABLE public.mentors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentoring_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentoring_pairings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentoring_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentoring_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentoring_flag_patterns ENABLE ROW LEVEL SECURITY;   -- no policies: definer functions only

-- Students apply (insert own pending row) and may withdraw a pending application.
-- Approve / reject / suspend only happens in review_mentor().
CREATE POLICY mentors_select ON public.mentors FOR SELECT TO authenticated
  USING (school_id = (SELECT public.my_school_id())
         AND (student_id = (SELECT auth.uid()) OR status = 'approved' OR (SELECT public.is_mentoring_moderator())));
CREATE POLICY mentors_insert ON public.mentors FOR INSERT TO authenticated
  WITH CHECK (student_id = (SELECT auth.uid())
              AND school_id = (SELECT public.my_school_id())
              AND (SELECT public.my_role()) = 'student'
              AND status = 'pending'
              AND EXISTS (SELECT 1 FROM public.subjects s WHERE s.id = mentors.subject_id AND s.school_id = mentors.school_id));
CREATE POLICY mentors_delete ON public.mentors FOR DELETE TO authenticated
  USING (student_id = (SELECT auth.uid()) AND status = 'pending');

CREATE POLICY mentoring_requests_select ON public.mentoring_requests FOR SELECT TO authenticated
  USING (mentee_id = (SELECT auth.uid())
         OR (school_id = (SELECT public.my_school_id()) AND (SELECT public.is_mentoring_moderator())));
CREATE POLICY mentoring_pairings_select ON public.mentoring_pairings FOR SELECT TO authenticated
  USING (school_id = (SELECT public.my_school_id())
         AND (mentee_id = (SELECT auth.uid())
              OR EXISTS (SELECT 1 FROM public.mentors m WHERE m.id = mentoring_pairings.mentor_id AND m.student_id = (SELECT auth.uid()))
              OR (SELECT public.is_mentoring_moderator())));
CREATE POLICY mentoring_sessions_select ON public.mentoring_sessions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.mentoring_pairings p WHERE p.id = mentoring_sessions.pairing_id));
CREATE POLICY mentoring_reports_select ON public.mentoring_reports FOR SELECT TO authenticated
  USING (reported_by = (SELECT auth.uid())
         OR (school_id = (SELECT public.my_school_id()) AND (SELECT public.is_mentoring_moderator())));

-- Least privilege
REVOKE ALL ON public.mentors, public.mentoring_requests, public.mentoring_pairings,
              public.mentoring_sessions, public.mentoring_reports, public.mentoring_flag_patterns FROM anon, authenticated;
GRANT SELECT ON public.mentors, public.mentoring_requests, public.mentoring_pairings,
                public.mentoring_sessions, public.mentoring_reports TO authenticated;
GRANT INSERT, DELETE ON public.mentors TO authenticated;

-- ── Internal helpers (not callable by clients) ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._mentoring_student_class(p_student uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT coalesce(sp.class_id, p.class_id)
  FROM public.profiles p LEFT JOIN public.student_profiles sp ON sp.id = p.id
  WHERE p.id = p_student
$fn$;

CREATE OR REPLACE FUNCTION public._mentoring_student_level(p_student uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT coalesce(c.class_level, nullif(p.class_level, ''))
  FROM public.profiles p
  LEFT JOIN public.student_profiles sp ON sp.id = p.id
  LEFT JOIN public.classes c ON c.id = coalesce(sp.class_id, p.class_id)
  WHERE p.id = p_student
$fn$;

-- Average % of a student's approved results in a subject, latest academic year with results
CREATE OR REPLACE FUNCTION public._mentoring_subject_avg(p_student uuid, p_subject uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  WITH mine AS (
    SELECT r.score, r.max_score, r.academic_year
    FROM public.results r
    JOIN public.class_subjects cs ON cs.id = r.class_subject_id
    WHERE r.student_id = p_student AND cs.subject_id = p_subject AND r.approved IS TRUE AND r.score IS NOT NULL
  )
  SELECT round(avg(score / nullif(max_score, 0) * 100)::numeric, 1)
  FROM mine WHERE academic_year = (SELECT max(academic_year) FROM mine)
$fn$;

CREATE OR REPLACE FUNCTION public._mentoring_notify(p_user uuid, p_school uuid, p_title text, p_body text, p_link text, p_ref uuid, p_table text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $fn$
  INSERT INTO public.notifications (user_id, school_id, title, body, type, link_url, reference_id, reference_table)
  VALUES (p_user, p_school, p_title, p_body, 'mentoring', p_link, p_ref, p_table)
$fn$;

-- Notify the class teachers of a student's class; fall back to the principal(s) when none are assigned
CREATE OR REPLACE FUNCTION public._mentoring_notify_staff(p_school uuid, p_class uuid, p_title text, p_body text, p_link text, p_ref uuid, p_table text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_n int := 0;
BEGIN
  IF p_class IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, school_id, title, body, type, link_url, reference_id, reference_table)
    SELECT DISTINCT ct.teacher_id, p_school, p_title, p_body, 'mentoring', p_link, p_ref, p_table
    FROM public.class_teachers ct
    WHERE ct.class_id = p_class AND ct.school_id = p_school AND ct.teacher_id IS NOT NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  END IF;
  IF v_n = 0 THEN
    INSERT INTO public.notifications (user_id, school_id, title, body, type, link_url, reference_id, reference_table)
    SELECT p.id, p_school, p_title, p_body, 'mentoring', p_link, p_ref, p_table
    FROM public.profiles p
    WHERE p.school_id = p_school AND p.role IN ('principal', 'vice-principal', 'vice_principal') AND coalesce(p.is_active, true);
  END IF;
END
$fn$;

-- Ends a pairing and closes the chat for the students (the teacher keeps the history)
CREATE OR REPLACE FUNCTION public._mentoring_end_pairing(p_pairing uuid, p_by uuid, p_reason text, p_completed boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE g public.mentoring_pairings%rowtype;
BEGIN
  SELECT * INTO g FROM public.mentoring_pairings WHERE id = p_pairing;
  IF NOT found OR g.status NOT IN ('awaiting_teacher', 'active') THEN RETURN; END IF;
  UPDATE public.mentoring_pairings
     SET status = CASE WHEN p_completed THEN 'completed' ELSE 'closed' END,
         closed_by = p_by,
         closed_reason = nullif(trim(coalesce(p_reason, '')), ''),
         grade_after = CASE WHEN p_completed THEN public._mentoring_subject_avg(g.mentee_id, g.subject_id) ELSE grade_after END
   WHERE id = p_pairing;
  IF g.chat_room_id IS NOT NULL THEN
    DELETE FROM public.chat_room_members WHERE room_id = g.chat_room_id AND role <> 'admin';
  END IF;
  IF g.request_id IS NOT NULL THEN
    UPDATE public.mentoring_requests SET status = CASE WHEN p_completed THEN 'done' ELSE 'cancelled' END WHERE id = g.request_id;
  END IF;
END
$fn$;

CREATE OR REPLACE FUNCTION public._mentoring_role_in(p_pairing uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT CASE WHEN g.mentee_id = auth.uid() THEN 'mentee'
              WHEN EXISTS (SELECT 1 FROM public.mentors m WHERE m.id = g.mentor_id AND m.student_id = auth.uid()) THEN 'mentor'
         END
  FROM public.mentoring_pairings g WHERE g.id = p_pairing
$fn$;

-- Audit trail: every approval / rejection / closure lands in portal_audit_log
CREATE OR REPLACE FUNCTION public._mentoring_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.portal_audit_log (actor_id, action, target_table, target_id, metadata)
    VALUES (auth.uid(), 'mentoring.' || TG_TABLE_NAME || '.' || NEW.status, TG_TABLE_NAME, NEW.id,
            jsonb_build_object('from', OLD.status, 'to', NEW.status, 'school_id', NEW.school_id));
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END
$fn$;
CREATE TRIGGER mentors_audit AFTER UPDATE OF status ON public.mentors FOR EACH ROW EXECUTE FUNCTION public._mentoring_audit();
CREATE TRIGGER mentoring_pairings_audit AFTER UPDATE OF status ON public.mentoring_pairings FOR EACH ROW EXECUTE FUNCTION public._mentoring_audit();

-- ── Student actions ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.request_mentoring(p_subject_id uuid, p_topic text, p_preferred_day text DEFAULT NULL, p_preferred_time text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_school uuid; v_role text; v_class uuid; v_name text; v_level text;
  v_subject text; v_req uuid; v_mentor uuid; v_pair uuid;
BEGIN
  SELECT p.school_id, p.role, p.class_id, p.full_name INTO v_school, v_role, v_class, v_name FROM public.profiles p WHERE p.id = v_uid;
  IF v_role IS DISTINCT FROM 'student' THEN RAISE EXCEPTION 'Only students can request mentoring'; END IF;
  v_level := public._mentoring_student_level(v_uid);
  v_class := coalesce(public._mentoring_student_class(v_uid), v_class);
  IF v_level IS NULL THEN RAISE EXCEPTION 'Your class is not set yet. Please ask your teacher.'; END IF;
  SELECT s.name INTO v_subject FROM public.subjects s WHERE s.id = p_subject_id AND s.school_id = v_school;
  IF v_subject IS NULL THEN RAISE EXCEPTION 'Unknown subject'; END IF;
  IF coalesce(trim(p_topic), '') = '' THEN RAISE EXCEPTION 'Tell us what you need help with'; END IF;
  IF p_preferred_day IS NOT NULL AND p_preferred_day NOT IN ('mon','tue','wed','thu','fri','sat','sun') THEN RAISE EXCEPTION 'Invalid day'; END IF;
  IF EXISTS (SELECT 1 FROM public.mentoring_pairings g WHERE g.mentee_id = v_uid AND g.subject_id = p_subject_id AND g.status IN ('awaiting_teacher', 'active')) THEN
    RAISE EXCEPTION 'You already have a mentor or a pending match for this subject';
  END IF;

  SELECT r.id INTO v_req FROM public.mentoring_requests r
   WHERE r.mentee_id = v_uid AND r.subject_id = p_subject_id AND r.status = 'pending' LIMIT 1;
  IF v_req IS NULL THEN
    INSERT INTO public.mentoring_requests (school_id, mentee_id, subject_id, class_level, topic, preferred_day, preferred_time)
    VALUES (v_school, v_uid, p_subject_id, v_level, trim(p_topic), p_preferred_day, nullif(trim(coalesce(p_preferred_time, '')), ''))
    RETURNING id INTO v_req;
  ELSE
    UPDATE public.mentoring_requests
       SET topic = trim(p_topic), preferred_day = p_preferred_day,
           preferred_time = nullif(trim(coalesce(p_preferred_time, '')), ''), class_level = v_level
     WHERE id = v_req;
  END IF;

  -- same school + subject + class level + availability; best rated, then least loaded
  SELECT m.id INTO v_mentor
  FROM public.mentors m
  WHERE m.school_id = v_school AND m.status = 'approved' AND m.subject_id = p_subject_id
    AND v_level = ANY (m.class_levels) AND m.student_id <> v_uid
    AND (p_preferred_day IS NULL OR p_preferred_day = ANY (m.available_days))
    AND (SELECT count(*) FROM public.mentoring_pairings g WHERE g.mentor_id = m.id AND g.status IN ('awaiting_teacher', 'active')) < m.max_mentees
    AND NOT EXISTS (SELECT 1 FROM public.mentoring_pairings g WHERE g.mentor_id = m.id AND g.mentee_id = v_uid AND g.status = 'rejected')
  ORDER BY (SELECT avg(s.rating) FROM public.mentoring_sessions s JOIN public.mentoring_pairings g ON g.id = s.pairing_id WHERE g.mentor_id = m.id AND s.rating IS NOT NULL) DESC NULLS LAST,
           (SELECT count(*) FROM public.mentoring_pairings g WHERE g.mentor_id = m.id AND g.status IN ('awaiting_teacher', 'active')) ASC,
           random()
  LIMIT 1;

  IF v_mentor IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(v_mentor::text));
    IF (SELECT count(*) FROM public.mentoring_pairings g WHERE g.mentor_id = v_mentor AND g.status IN ('awaiting_teacher', 'active'))
       >= (SELECT max_mentees FROM public.mentors WHERE id = v_mentor) THEN
      v_mentor := NULL;
    END IF;
  END IF;

  IF v_mentor IS NULL THEN
    RETURN jsonb_build_object('request_id', v_req, 'matched', false);
  END IF;

  INSERT INTO public.mentoring_pairings (school_id, request_id, mentor_id, mentee_id, subject_id)
  VALUES (v_school, v_req, v_mentor, v_uid, p_subject_id) RETURNING id INTO v_pair;
  UPDATE public.mentoring_requests SET status = 'matched' WHERE id = v_req;

  PERFORM public._mentoring_notify_staff(v_school, v_class, 'Mentoring match needs approval',
    coalesce(v_name, 'A student') || ' asked for ' || v_subject || ' mentoring.', '/dashboard/teacher/mentoring', v_pair, 'mentoring_pairings');

  RETURN jsonb_build_object('request_id', v_req, 'matched', true, 'pairing_id', v_pair);
END
$fn$;

CREATE OR REPLACE FUNCTION public.cancel_mentoring_request(p_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  UPDATE public.mentoring_requests SET status = 'cancelled'
   WHERE id = p_request_id AND mentee_id = auth.uid() AND status = 'pending';
  IF NOT found THEN RAISE EXCEPTION 'Request not found or already matched'; END IF;
END
$fn$;

-- ── Teacher actions ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.review_mentor(p_mentor_id uuid, p_decision text, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_uid uuid := auth.uid(); m public.mentors%rowtype; g record; v_subject text;
BEGIN
  IF NOT public.is_mentoring_moderator() THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF p_decision NOT IN ('approved', 'rejected', 'suspended') THEN RAISE EXCEPTION 'Invalid decision'; END IF;
  SELECT * INTO m FROM public.mentors WHERE id = p_mentor_id AND school_id = public.my_school_id();
  IF NOT found THEN RAISE EXCEPTION 'Mentor not found'; END IF;
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

-- Approve (creates the chat room, teacher = admin/creator) or reject a match
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

-- Close (or complete) a pairing: moderators, or either student in it
CREATE OR REPLACE FUNCTION public.close_mentoring_pairing(p_pairing_id uuid, p_reason text DEFAULT NULL, p_completed boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  g public.mentoring_pairings%rowtype;
  v_mod boolean; v_role text; v_other uuid; v_mentor_student uuid;
BEGIN
  SELECT * INTO g FROM public.mentoring_pairings WHERE id = p_pairing_id FOR UPDATE;
  IF NOT found THEN RAISE EXCEPTION 'Pairing not found'; END IF;
  v_mod := public.is_mentoring_moderator() AND g.school_id = public.my_school_id();
  v_role := public._mentoring_role_in(g.id);
  IF NOT (v_mod OR v_role IS NOT NULL) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF g.status NOT IN ('awaiting_teacher', 'active') THEN RAISE EXCEPTION 'Already closed'; END IF;
  PERFORM public._mentoring_end_pairing(g.id, v_uid, p_reason, p_completed AND (v_mod OR v_role = 'mentor'));

  SELECT m.student_id INTO v_mentor_student FROM public.mentors m WHERE m.id = g.mentor_id;
  FOR v_other IN SELECT unnest(ARRAY[g.mentee_id, v_mentor_student]) LOOP
    IF v_other IS DISTINCT FROM v_uid THEN
      PERFORM public._mentoring_notify(v_other, g.school_id, 'Mentoring ended',
        'A mentoring pairing was closed.' || coalesce(' ' || nullif(trim(p_reason), ''), ''), '/dashboard/student/mentoring', g.id, 'mentoring_pairings');
    END IF;
  END LOOP;
END
$fn$;

-- ── Sessions ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_mentoring_session(p_pairing_id uuid, p_session_date timestamptz, p_goals text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE g public.mentoring_pairings%rowtype; v_role text; v_id uuid; v_other uuid;
BEGIN
  SELECT * INTO g FROM public.mentoring_pairings WHERE id = p_pairing_id;
  v_role := public._mentoring_role_in(p_pairing_id);
  IF NOT found OR v_role IS NULL THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF g.status <> 'active' THEN RAISE EXCEPTION 'This pairing is not active'; END IF;
  IF p_session_date IS NULL THEN RAISE EXCEPTION 'Pick a date and time'; END IF;
  INSERT INTO public.mentoring_sessions (school_id, pairing_id, session_date, goals, created_by)
  VALUES (g.school_id, g.id, p_session_date, nullif(trim(coalesce(p_goals, '')), ''), auth.uid()) RETURNING id INTO v_id;
  v_other := CASE WHEN v_role = 'mentee' THEN (SELECT m.student_id FROM public.mentors m WHERE m.id = g.mentor_id) ELSE g.mentee_id END;
  PERFORM public._mentoring_notify(v_other, g.school_id, 'New mentoring session', 'A session was scheduled.', '/dashboard/student/mentoring', v_id, 'mentoring_sessions');
  RETURN v_id;
END
$fn$;

CREATE OR REPLACE FUNCTION public.update_mentoring_session(p_session_id uuid, p_goals text, p_notes text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE s public.mentoring_sessions%rowtype; g_status text;
BEGIN
  SELECT * INTO s FROM public.mentoring_sessions WHERE id = p_session_id;
  IF NOT found OR public._mentoring_role_in(s.pairing_id) IS NULL THEN RAISE EXCEPTION 'Not allowed'; END IF;
  SELECT status INTO g_status FROM public.mentoring_pairings WHERE id = s.pairing_id;
  IF g_status <> 'active' OR s.status = 'cancelled' THEN RAISE EXCEPTION 'This session can no longer be edited'; END IF;
  UPDATE public.mentoring_sessions
     SET goals = nullif(trim(coalesce(p_goals, '')), ''), notes = nullif(trim(coalesce(p_notes, '')), '')
   WHERE id = p_session_id;
END
$fn$;

CREATE OR REPLACE FUNCTION public.complete_mentoring_session(p_session_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE s public.mentoring_sessions%rowtype; g public.mentoring_pairings%rowtype;
BEGIN
  SELECT * INTO s FROM public.mentoring_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT found OR public._mentoring_role_in(s.pairing_id) IS DISTINCT FROM 'mentor' THEN RAISE EXCEPTION 'Only the mentor can finish a session'; END IF;
  SELECT * INTO g FROM public.mentoring_pairings WHERE id = s.pairing_id;
  IF g.status <> 'active' THEN RAISE EXCEPTION 'This pairing is not active'; END IF;
  IF s.status <> 'scheduled' THEN RAISE EXCEPTION 'Session already finished'; END IF;
  UPDATE public.mentoring_sessions SET status = 'done', completed_at = now() WHERE id = s.id;
  PERFORM public._mentoring_notify(g.mentee_id, g.school_id, 'How did it go?', 'Rate your mentoring session.', '/dashboard/student/mentoring', s.id, 'mentoring_sessions');
END
$fn$;

CREATE OR REPLACE FUNCTION public.rate_mentoring_session(p_session_id uuid, p_rating int, p_comment text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE s public.mentoring_sessions%rowtype; g public.mentoring_pairings%rowtype; v_mentor uuid;
BEGIN
  SELECT * INTO s FROM public.mentoring_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT found OR public._mentoring_role_in(s.pairing_id) IS DISTINCT FROM 'mentee' THEN RAISE EXCEPTION 'Only the mentee can rate a session'; END IF;
  IF s.status <> 'done' THEN RAISE EXCEPTION 'Session is not finished yet'; END IF;
  IF s.rating IS NOT NULL THEN RAISE EXCEPTION 'Already rated'; END IF;
  IF p_rating IS NULL OR p_rating NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'Rating must be 1 to 5'; END IF;
  UPDATE public.mentoring_sessions
     SET rating = p_rating, rating_comment = nullif(trim(coalesce(p_comment, '')), ''), rated_at = now()
   WHERE id = s.id;
  SELECT * INTO g FROM public.mentoring_pairings WHERE id = s.pairing_id;
  SELECT m.student_id INTO v_mentor FROM public.mentors m WHERE m.id = g.mentor_id;
  PERFORM public._mentoring_notify(v_mentor, g.school_id, 'You got a rating', 'A mentee rated your session ' || p_rating || '/5.', '/dashboard/student/mentoring', s.id, 'mentoring_sessions');
END
$fn$;

-- ── Safety ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.report_mentoring(p_pairing_id uuid, p_reason text, p_message_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE g public.mentoring_pairings%rowtype; v_class uuid; v_text text;
BEGIN
  SELECT * INTO g FROM public.mentoring_pairings WHERE id = p_pairing_id;
  IF NOT found OR public._mentoring_role_in(p_pairing_id) IS NULL THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF coalesce(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'Please say what happened'; END IF;
  IF p_message_id IS NOT NULL THEN
    -- only messages from this pairing's own chat can be attached (no reading other chats through a report)
    SELECT m.content INTO v_text FROM public.chat_messages m WHERE m.id = p_message_id AND m.room_id = g.chat_room_id;
    IF NOT found THEN RAISE EXCEPTION 'That message is not part of this mentoring chat'; END IF;
  END IF;
  INSERT INTO public.mentoring_reports (school_id, pairing_id, reported_by, source, reason, message_id, message_text)
  VALUES (g.school_id, g.id, auth.uid(), 'user', trim(p_reason), p_message_id, v_text);
  v_class := public._mentoring_student_class(g.mentee_id);
  PERFORM public._mentoring_notify_staff(g.school_id, v_class, 'Mentoring report', 'A student reported a mentoring chat.', '/dashboard/teacher/mentoring', g.id, 'mentoring_pairings');
END
$fn$;

CREATE OR REPLACE FUNCTION public.resolve_mentoring_report(p_report_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_mentoring_moderator() THEN RAISE EXCEPTION 'Not allowed'; END IF;
  UPDATE public.mentoring_reports
     SET status = 'resolved', resolved_by = auth.uid(), resolved_at = now()
   WHERE id = p_report_id AND school_id = public.my_school_id() AND status = 'open';
END
$fn$;

-- Auto-flag messages in active mentoring chats (phone numbers, outside apps, bad language)
CREATE OR REPLACE FUNCTION public.mentoring_scan_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE g record; v_reasons text[]; v_class uuid;
BEGIN
  IF NEW.content IS NULL OR NEW.content = '' THEN RETURN NEW; END IF;
  SELECT id, school_id, mentee_id INTO g FROM public.mentoring_pairings WHERE chat_room_id = NEW.room_id AND status = 'active' LIMIT 1;
  IF NOT found THEN RETURN NEW; END IF;
  SELECT array_agg(reason) INTO v_reasons FROM public.mentoring_flag_patterns WHERE NEW.content ~* pattern;
  IF v_reasons IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.mentoring_reports (school_id, pairing_id, reported_by, source, reason, message_id, message_text)
  VALUES (g.school_id, g.id, NULL, 'auto', array_to_string(v_reasons, '; '), NEW.id, NEW.content);
  v_class := public._mentoring_student_class(g.mentee_id);
  PERFORM public._mentoring_notify_staff(g.school_id, v_class, 'Mentoring chat flagged', 'A message in a mentoring chat was flagged for review.', '/dashboard/teacher/mentoring', g.id, 'mentoring_pairings');
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;   -- never block a chat message because flagging failed
END
$fn$;
CREATE TRIGGER mentoring_scan_message AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.mentoring_scan_message();

-- ── Read views (names joined in, scoped to the caller) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.mentoring_mentors_view()
RETURNS TABLE (mentor_id uuid, student_id uuid, student_name text, student_level text, subject_id uuid, subject_name text,
  class_levels text[], available_days text[], available_note text, bio text, status text, review_note text,
  subject_avg numeric, active_mentees bigint, avg_rating numeric, sessions_done bigint, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT m.id, m.student_id, p.full_name, public._mentoring_student_level(m.student_id), m.subject_id, s.name,
    m.class_levels, m.available_days, m.available_note, m.bio, m.status, m.review_note,
    CASE WHEN m.student_id = auth.uid() OR public.is_mentoring_moderator() THEN public._mentoring_subject_avg(m.student_id, m.subject_id) END,
    (SELECT count(*) FROM public.mentoring_pairings g WHERE g.mentor_id = m.id AND g.status IN ('awaiting_teacher', 'active')),
    (SELECT round(avg(x.rating), 1) FROM public.mentoring_sessions x JOIN public.mentoring_pairings g ON g.id = x.pairing_id WHERE g.mentor_id = m.id AND x.rating IS NOT NULL),
    (SELECT count(*) FROM public.mentoring_sessions x JOIN public.mentoring_pairings g ON g.id = x.pairing_id WHERE g.mentor_id = m.id AND x.status = 'done'),
    m.created_at
  FROM public.mentors m
  JOIN public.profiles p ON p.id = m.student_id
  JOIN public.subjects s ON s.id = m.subject_id
  WHERE m.school_id = public.my_school_id()
    AND (m.student_id = auth.uid() OR m.status = 'approved' OR public.is_mentoring_moderator())
  ORDER BY m.created_at DESC
$fn$;

CREATE OR REPLACE FUNCTION public.mentoring_pairings_view()
RETURNS TABLE (pairing_id uuid, status text, subject_id uuid, subject_name text, topic text, mentor_id uuid, mentor_student_id uuid,
  mentor_name text, mentee_id uuid, mentee_name text, mentee_level text, chat_room_id uuid, grade_before numeric, grade_after numeric,
  session_count bigint, done_count bigint, avg_rating numeric, open_reports bigint, created_at timestamptz, reviewed_at timestamptz, my_role text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT g.id, g.status, g.subject_id, s.name, r.topic, g.mentor_id, m.student_id, mp.full_name, g.mentee_id, ep.full_name,
    public._mentoring_student_level(g.mentee_id), g.chat_room_id, g.grade_before, g.grade_after,
    (SELECT count(*) FROM public.mentoring_sessions x WHERE x.pairing_id = g.id),
    (SELECT count(*) FROM public.mentoring_sessions x WHERE x.pairing_id = g.id AND x.status = 'done'),
    (SELECT round(avg(x.rating), 1) FROM public.mentoring_sessions x WHERE x.pairing_id = g.id AND x.rating IS NOT NULL),
    (SELECT count(*) FROM public.mentoring_reports rr WHERE rr.pairing_id = g.id AND rr.status = 'open' AND public.is_mentoring_moderator()),
    g.created_at, g.reviewed_at,
    CASE WHEN g.mentee_id = auth.uid() THEN 'mentee' WHEN m.student_id = auth.uid() THEN 'mentor' ELSE 'staff' END
  FROM public.mentoring_pairings g
  JOIN public.mentors m ON m.id = g.mentor_id
  JOIN public.subjects s ON s.id = g.subject_id
  JOIN public.profiles mp ON mp.id = m.student_id
  JOIN public.profiles ep ON ep.id = g.mentee_id
  LEFT JOIN public.mentoring_requests r ON r.id = g.request_id
  WHERE g.school_id = public.my_school_id()
    AND (g.mentee_id = auth.uid() OR m.student_id = auth.uid() OR public.is_mentoring_moderator())
  ORDER BY g.created_at DESC
$fn$;

CREATE OR REPLACE FUNCTION public.mentoring_reports_view()
RETURNS TABLE (report_id uuid, pairing_id uuid, subject_name text, mentor_name text, mentee_name text, source text, reason text,
  message_text text, sender_name text, status text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT rr.id, rr.pairing_id, s.name, mp.full_name, ep.full_name, rr.source, rr.reason,
    coalesce(rr.message_text, cm.content), sp.full_name, rr.status, rr.created_at
  FROM public.mentoring_reports rr
  JOIN public.mentoring_pairings g ON g.id = rr.pairing_id
  JOIN public.mentors m ON m.id = g.mentor_id
  JOIN public.subjects s ON s.id = g.subject_id
  JOIN public.profiles mp ON mp.id = m.student_id
  JOIN public.profiles ep ON ep.id = g.mentee_id
  LEFT JOIN public.chat_messages cm ON cm.id = rr.message_id
  LEFT JOIN public.profiles sp ON sp.id = cm.sender_id
  WHERE public.is_mentoring_moderator() AND rr.school_id = public.my_school_id()
  ORDER BY (rr.status = 'open') DESC, rr.created_at DESC
$fn$;

-- ── Function privileges ────────────────────────────────────────────────────────────────
DO $do$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    '_mentoring_student_level(uuid)', '_mentoring_student_class(uuid)', '_mentoring_subject_avg(uuid,uuid)',
    '_mentoring_notify(uuid,uuid,text,text,text,uuid,text)',
    '_mentoring_notify_staff(uuid,uuid,text,text,text,uuid,text)',
    '_mentoring_end_pairing(uuid,uuid,text,boolean)', '_mentoring_role_in(uuid)',
    '_mentoring_audit()', 'mentoring_scan_message()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM public, anon, authenticated', f);
  END LOOP;
  FOREACH f IN ARRAY ARRAY[
    'is_mentoring_moderator()',
    'request_mentoring(uuid,text,text,text)', 'cancel_mentoring_request(uuid)',
    'review_mentor(uuid,text,text)', 'review_pairing(uuid,boolean,text)',
    'close_mentoring_pairing(uuid,text,boolean)',
    'create_mentoring_session(uuid,timestamptz,text)', 'update_mentoring_session(uuid,text,text)',
    'complete_mentoring_session(uuid)', 'rate_mentoring_session(uuid,int,text)',
    'report_mentoring(uuid,text,uuid)', 'resolve_mentoring_report(uuid)',
    'mentoring_mentors_view()', 'mentoring_pairings_view()', 'mentoring_reports_view()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM public, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END
$do$;
