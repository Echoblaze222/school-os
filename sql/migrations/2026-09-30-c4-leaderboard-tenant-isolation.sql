-- C4 (security audit): get_class_leaderboard tenant isolation + overload cleanup.
-- Applied to production as Supabase migration 20260930081948
-- (c4_get_class_leaderboard_tenant_isolation_and_overload_cleanup).
--
-- Drops the unused SECURITY INVOKER 2-arg overload (caused 42725 "not unique" on every
-- 2-arg call), re-creates the 3-arg SECURITY DEFINER function with the same logic plus
-- '#variable_conflict use_column' (fixes 42702 ambiguous student_id) and a hardened
-- tenant guard (signed-in caller must have a school and it must equal p_school_id),
-- and makes grants explicit: authenticated + service_role only.
-- Note: the earlier live-only migration 20260920052003 (guard patched in place) had no
-- file in this repo; this migration supersedes it.

DROP FUNCTION IF EXISTS public.get_class_leaderboard(uuid, integer);

CREATE OR REPLACE FUNCTION public.get_class_leaderboard(
  p_school_id uuid,
  p_limit     integer DEFAULT 20,
  p_class_id  uuid    DEFAULT NULL::uuid
)
RETURNS TABLE(
  student_id uuid,
  full_name text,
  avatar_url text,
  class_level text,
  class_id uuid,
  quiz_avg numeric,
  assignment_avg numeric,
  result_avg numeric,
  quizzes_taken integer,
  assignments_done integer,
  results_count integer,
  total_score integer,
  quiz_contribution integer,
  assignment_contribution integer,
  result_contribution integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
BEGIN
  IF auth.uid() IS NOT NULL
     AND (public.my_school_id() IS NULL
          OR p_school_id IS DISTINCT FROM public.my_school_id()) THEN
    RAISE EXCEPTION 'not authorized for this school' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH
    students AS (
      SELECT
        p.id AS student_id,
        p.full_name,
        p.avatar_url,
        sp.class_id,
        COALESCE(c.class_level, c.name, 'Unknown') AS class_level
      FROM profiles p
      JOIN student_profiles sp ON sp.id = p.id
      LEFT JOIN classes c ON c.id = sp.class_id
      WHERE p.school_id = p_school_id
        AND p.role = 'student'
        AND (p_class_id IS NULL OR sp.class_id = p_class_id)
    ),
    quiz_best AS (
      SELECT
        qa.student_id,
        qa.quiz_id,
        MAX(
          CASE
            WHEN NULLIF(COALESCE(qa.max_score, 100), 0) IS NOT NULL
              THEN (qa.score / NULLIF(COALESCE(qa.max_score, 100), 0)) * 100
            ELSE 0
          END
        ) AS pct
      FROM quiz_attempts qa
      JOIN quizzes q ON q.id = qa.quiz_id
      WHERE q.school_id = p_school_id
        AND qa.score IS NOT NULL
        AND (p_class_id IS NULL OR q.class_id = p_class_id)
      GROUP BY qa.student_id, qa.quiz_id
    ),
    quiz_stats AS (
      SELECT
        qb.student_id,
        ROUND(AVG(qb.pct)::numeric, 2) AS quiz_avg,
        COUNT(*)::integer              AS quizzes_taken
      FROM quiz_best qb
      GROUP BY qb.student_id
    ),
    assignment_stats AS (
      SELECT
        asub.student_id,
        ROUND(
          AVG(
            CASE
              WHEN NULLIF(COALESCE(a.max_score, 100), 0) IS NOT NULL
                THEN (asub.score / NULLIF(COALESCE(a.max_score, 100), 0)) * 100
              ELSE 0
            END
          )::numeric, 2
        )                 AS assignment_avg,
        COUNT(*)::integer AS assignments_done
      FROM assignment_submissions asub
      JOIN assignments a ON a.id = asub.assignment_id
      WHERE a.school_id = p_school_id
        AND asub.status = 'graded'
        AND asub.score IS NOT NULL
        AND (p_class_id IS NULL OR a.class_id = p_class_id)
      GROUP BY asub.student_id
    ),
    result_stats AS (
      SELECT
        r.student_id,
        ROUND(
          AVG(
            CASE
              WHEN NULLIF(COALESCE(r.max_score, 100), 0) IS NOT NULL
                THEN (r.score / NULLIF(COALESCE(r.max_score, 100), 0)) * 100
              ELSE 0
            END
          )::numeric, 2
        )                 AS result_avg,
        COUNT(*)::integer AS results_count
      FROM results r
      JOIN class_subjects cs ON cs.id = r.class_subject_id
      WHERE r.school_id = p_school_id
        AND r.approved = true
        AND r.score IS NOT NULL
        AND (p_class_id IS NULL OR cs.class_id = p_class_id)
      GROUP BY r.student_id
    ),
    scored AS (
      SELECT
        s.student_id,
        s.full_name,
        s.avatar_url,
        s.class_level,
        s.class_id,
        COALESCE(qs.quiz_avg,        0) AS quiz_avg,
        COALESCE(ass.assignment_avg, 0) AS assignment_avg,
        COALESCE(rs.result_avg,      0) AS result_avg,
        COALESCE(qs.quizzes_taken,     0) AS quizzes_taken,
        COALESCE(ass.assignments_done, 0) AS assignments_done,
        COALESCE(rs.results_count,     0) AS results_count,
        ROUND(
          COALESCE(qs.quiz_avg,        0) * 4.00 +
          COALESCE(ass.assignment_avg, 0) * 3.50 +
          COALESCE(rs.result_avg,      0) * 2.50
        )::integer AS total_score,
        ROUND(COALESCE(qs.quiz_avg,        0) * 4.00)::integer AS quiz_contribution,
        ROUND(COALESCE(ass.assignment_avg, 0) * 3.50)::integer AS assignment_contribution,
        ROUND(COALESCE(rs.result_avg,      0) * 2.50)::integer AS result_contribution
      FROM students s
      LEFT JOIN quiz_stats       qs  ON qs.student_id  = s.student_id
      LEFT JOIN assignment_stats ass ON ass.student_id = s.student_id
      LEFT JOIN result_stats     rs  ON rs.student_id  = s.student_id
    )
  SELECT * FROM scored
  ORDER BY total_score DESC, full_name ASC
  LIMIT p_limit;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_class_leaderboard(uuid, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_class_leaderboard(uuid, integer, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_class_leaderboard(uuid, integer, uuid) IS
  'School leaderboard. SECURITY DEFINER; signed-in callers may only request their own school (my_school_id()). Single overload by design (C4).';
