-- C4 regression test: get_class_leaderboard tenant isolation.
-- Read-only (no writes). Picks two existing schools that each have a student with a
-- student_profiles row, plus one existing user in each. Raises on any failure.
-- Covers: A same school, B cross-school, C manipulated school/class ids, D single overload
-- + grants, E anon, F the app's 2-named-arg call shape and the service_role path.
DO $do$
DECLARE
  sa uuid; sb uuid; ua uuid; ub uuid; cb uuid;
  a_ids uuid[]; b_ids uuid[]; ids uuid[]; n int; cols boolean;
  fails text[] := '{}';
BEGIN
  SELECT p.school_id INTO sa FROM profiles p JOIN student_profiles sp ON sp.id = p.id
    WHERE p.role = 'student' AND p.school_id IS NOT NULL GROUP BY p.school_id ORDER BY count(*) DESC, p.school_id LIMIT 1;
  SELECT p.school_id INTO sb FROM profiles p JOIN student_profiles sp ON sp.id = p.id
    WHERE p.role = 'student' AND p.school_id IS NOT NULL AND p.school_id <> sa GROUP BY p.school_id ORDER BY count(*) DESC, p.school_id LIMIT 1;
  IF sa IS NULL OR sb IS NULL THEN RAISE EXCEPTION 'C4 test needs two schools with students'; END IF;
  SELECT id INTO ua FROM profiles WHERE school_id = sa ORDER BY (role = 'student'), id LIMIT 1;
  SELECT id INTO ub FROM profiles WHERE school_id = sb ORDER BY (role = 'student'), id LIMIT 1;
  SELECT array_agg(p.id) INTO a_ids FROM profiles p JOIN student_profiles sp ON sp.id = p.id WHERE p.school_id = sa AND p.role = 'student';
  SELECT array_agg(p.id) INTO b_ids FROM profiles p JOIN student_profiles sp ON sp.id = p.id WHERE p.school_id = sb AND p.role = 'student';
  SELECT sp.class_id INTO cb FROM student_profiles sp JOIN profiles p ON p.id = sp.id WHERE p.school_id = sb AND sp.class_id IS NOT NULL LIMIT 1;

  -- D: exactly one overload (3-arg); no anon/PUBLIC execute
  IF (SELECT count(*) FROM pg_proc WHERE proname = 'get_class_leaderboard' AND pronamespace = 'public'::regnamespace) <> 1
     OR to_regprocedure('public.get_class_leaderboard(uuid,integer)') IS NOT NULL
     OR to_regprocedure('public.get_class_leaderboard(uuid,integer,uuid)') IS NULL THEN fails := fails || 'D overload'; END IF;
  IF has_function_privilege('anon', 'public.get_class_leaderboard(uuid,integer,uuid)', 'EXECUTE')
     OR EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a WHERE p.oid = 'public.get_class_leaderboard(uuid,integer,uuid)'::regprocedure AND a.grantee = 0)
     THEN fails := fails || 'grants'; END IF;

  -- A/F: user of school A, app-style call (2 named args) returns only school A, expected shape
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', ua::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  EXECUTE 'SELECT count(*)::int, coalesce(array_agg(x.student_id), ''{}''::uuid[]), coalesce(bool_and(to_jsonb(x) ? ''class_id'' AND to_jsonb(x) ? ''avatar_url''), false) FROM public.get_class_leaderboard(p_school_id => $1, p_limit => 50) x'
    INTO n, ids, cols USING sa;
  IF n <> cardinality(a_ids) OR NOT (ids <@ a_ids) OR ids && b_ids OR NOT cols THEN fails := fails || 'A/F own school'; END IF;

  -- B/C: same user asks for school B, NULL school, or school B + B class -> denied
  BEGIN PERFORM * FROM public.get_class_leaderboard(p_school_id => sb, p_limit => 50); fails := fails || 'B cross-school not denied';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM * FROM public.get_class_leaderboard(p_school_id => NULL::uuid, p_limit => 50); fails := fails || 'C null school not denied';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM * FROM public.get_class_leaderboard(sb, 50, cb); fails := fails || 'C school+class B not denied';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  SELECT count(*) INTO n FROM public.get_class_leaderboard(sa, 50, cb);  -- own school + other school's class
  IF n <> 0 THEN fails := fails || 'C foreign class leaked rows'; END IF;

  -- reverse direction
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', ub::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM * FROM public.get_class_leaderboard(p_school_id => sa, p_limit => 50); fails := fails || 'B reverse not denied';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- E: anonymous
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN PERFORM * FROM public.get_class_leaderboard(sa, 5, NULL); fails := fails || 'E anon allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- backend path: service_role (no auth.uid()) still works for any school
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  EXECUTE 'SET LOCAL ROLE service_role';
  SELECT count(*) INTO n FROM public.get_class_leaderboard(sb, 50);
  IF n <> cardinality(b_ids) THEN fails := fails || 'service_role path'; END IF;
  EXECUTE 'RESET ROLE';

  IF cardinality(fails) > 0 THEN RAISE EXCEPTION 'C4 TESTS FAILED: %', array_to_string(fails, '; '); END IF;
  RAISE NOTICE 'C4 tests passed';
END
$do$;
