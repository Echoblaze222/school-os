-- Shared guard for every role-analytics RPC: returns the caller's school_id if
-- their role is in p_roles, otherwise raises 42501. School is never client-supplied.
create or replace function public.analytics_guard(p_roles text[])
returns uuid language plpgsql stable security invoker set search_path = public as $$
declare v_school uuid; v_role text;
begin
  select school_id, role into v_school, v_role from profiles where id = auth.uid();
  if v_school is null or v_role is null or not (v_role = any(p_roles)) then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  return v_school;
end $$;
revoke all on function public.analytics_guard(text[]) from public, anon;
grant execute on function public.analytics_guard(text[]) to authenticated;
