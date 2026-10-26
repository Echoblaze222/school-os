-- Security hardening, researched against the live schema (read-only) on 2026-10-26.
-- Not applied anywhere yet. Review, then run in the Supabase SQL editor.
--
-- 1. ai_check_rate_limit: any signed-in user could pass someone else's user id and burn
--    that user's AI quota (the function is SECURITY DEFINER and never checked the caller).
--    /api/ai/chat passes user.id from the session through a user-bound client, so
--    requiring p_user_id = auth.uid() does not affect legitimate use. Service-role and
--    internal callers have auth.uid() = null and are still allowed.

create or replace function public.ai_check_rate_limit(
  p_user_id uuid,
  p_limit integer default 20,
  p_window_seconds integer default 60
)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_row public.ai_rate_limits;
begin
  if auth.uid() is not null and p_user_id is distinct from auth.uid() then
    raise exception 'not authorized';
  end if;

  insert into public.ai_rate_limits (user_id, window_start, request_count)
  values (p_user_id, now(), 1)
  on conflict (user_id) do update
    set request_count = case
          when public.ai_rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
            then 1
          else public.ai_rate_limits.request_count + 1
        end,
        window_start = case
          when public.ai_rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
            then now()
          else public.ai_rate_limits.window_start
        end
  returning * into v_row;

  return v_row.request_count <= p_limit;
end;
$$;

-- Keep the existing grants (authenticated + service_role). Nothing else changes.

-- 2. Deliberately NOT done: revoking anon EXECUTE on my_role(), my_school_id(), is_staff(),
--    current_school_id(), has_active_appointment() and friends.
--    Reason: 300+ RLS policies call them and most policies are TO public (which includes
--    anon). Revoking from anon would make anon requests to schools, school_branding,
--    classes, profiles and others fail with "permission denied for function" instead of
--    returning zero rows, which can break pre-login pages. For anon these helpers return
--    null/false (auth.uid() is null), so the real exposure is near zero.
--    Safe future path: change those policies to TO authenticated first, then revoke.
--
-- 3. Optional, safe: current_role() is referenced by no policy, so anon does not need it.
--    Uncomment only if your app never calls rpc('current_role') before login.
-- revoke execute on function public.current_role() from anon;
