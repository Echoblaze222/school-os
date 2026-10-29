-- docs/notifications/proposed-migration.sql
--
-- PROPOSED, NOT APPLIED. Review each block on its own. Apply one at a time in a
-- Supabase branch or staging project first, and run the checks at the end of
-- each block. Sequence after PR #5 is merged (security items H3/H6 wait on it).

-- ---------------------------------------------------------------------------
-- 1. Stop notification spoofing: recipient must belong to the sender's school.
--
-- Today the INSERT policy is only:  school_id = my_school_id()
-- so a signed-in user can write a row for ANY user_id with any title/link.
-- A plain EXISTS against profiles could silently block legitimate inserts if
-- profiles RLS hides other users from the sender, so use a SECURITY DEFINER
-- helper that reads profiles directly.
-- ---------------------------------------------------------------------------
create or replace function public.user_in_school(p_user_id uuid, p_school_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user_id and p.school_id = p_school_id
  );
$$;

revoke all on function public.user_in_school(uuid, uuid) from public;
grant execute on function public.user_in_school(uuid, uuid) to authenticated;

drop policy if exists notifications_insert_same_school on public.notifications;
create policy notifications_insert_same_school on public.notifications
  for insert to authenticated
  with check (
    school_id = (select my_school_id())
    and public.user_in_school(user_id, school_id)
  );

-- Check: as a student, try to insert a row for a user in ANOTHER school. It must fail.
-- Check: send a normal announcement, bursar fee reminder, and a chat message. All must still work.

-- ---------------------------------------------------------------------------
-- 2. Index cleanup on notifications.
--
-- Keep: pkey, idx_notifications_dedupe_key (unique), idx_notifications_unread
-- (partial, serves the unread count), idx_notifications_school_id,
-- idx_notifications_created, idx_notifications_user_unread.
-- Add one index that matches the real list query (user, newest first).
-- Drop three that are fully covered by others.
-- ---------------------------------------------------------------------------
create index concurrently if not exists idx_notifications_user_created
  on public.notifications (user_id, created_at desc);

drop index concurrently if exists public.idx_notifications_is_read;
drop index concurrently if exists public.notifications_user_id_idx;
drop index concurrently if exists public.notifications_user_unread_idx;

-- ---------------------------------------------------------------------------
-- 3. Seen versus read.
--
-- seen_at: set when the bell panel is opened (badge acknowledged).
-- read_at: set when the item itself is opened. is_read stays as is.
-- Additive and nullable, so nothing existing breaks.
-- ---------------------------------------------------------------------------
alter table public.notifications add column if not exists seen_at timestamptz;
alter table public.notifications add column if not exists read_at timestamptz;

-- ---------------------------------------------------------------------------
-- 4. Retention: drop read notifications older than 90 days.
-- Run from a scheduled job (pg_cron or the existing cron route), not a trigger.
-- ---------------------------------------------------------------------------
-- delete from public.notifications
-- where is_read = true and created_at < now() - interval '90 days';

-- ---------------------------------------------------------------------------
-- 5. Push trigger: secret out of the function body, link_url fallback.
--
-- Do these in order:
--   a) Generate a NEW INTERNAL_SECRET. Put it in Vercel env vars.
--   b) Store the same value in Supabase Vault:
--        select vault.create_secret('<new value>', 'internal_push_secret');
--   c) Replace the function so it reads the secret from Vault instead of a literal.
--      (Keep v_site_url pointing at the project that is really production.)
-- ---------------------------------------------------------------------------
create or replace function public.push_on_notification_insert()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_site_url        text := 'https://school-os-j4bn.vercel.app';
  v_internal_secret text;
begin
  select decrypted_secret into v_internal_secret
  from vault.decrypted_secrets
  where name = 'internal_push_secret'
  limit 1;

  -- Never block the notification insert itself because push is unavailable.
  if v_internal_secret is null then
    return new;
  end if;

  perform net.http_post(
    url     := v_site_url || '/api/internal/push-on-notification',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-internal-secret', v_internal_secret
               ),
    body    := jsonb_build_object(
                 'user_id', new.user_id,
                 'title',   new.title,
                 'body',    new.body,
                 'url',     coalesce(new.action_url, new.link_url, '/dashboard'),
                 'tag',     coalesce(new.type, 'system')
               )
  );

  return new;
end;
$function$;
