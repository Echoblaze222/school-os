-- docs/lane3-notifications/02-push-trigger.sql
--
-- The real push-notification trigger, pulled directly from the live
-- Supabase project (via `pg_get_functiondef` against the actual
-- function) and confirmed to match exactly what's running in
-- production today. This replaces
-- 02-push-trigger-RECONSTRUCTED-please-review.sql, which was an
-- unverified guess written from what the calling code
-- (api/internal/push-on-notification/route.ts) expected to receive -
-- it turned out to be correct in shape, but was never actually
-- confirmed against the live trigger until now.
--
-- IMPORTANT / FLAGGED, NOT FIXED HERE: the live function has the real
-- internal secret hardcoded in plain text directly in the database
-- (not in an env var, not in Supabase Vault). That's a real exposure
-- risk independent of this file - anyone with SQL access to this
-- project (e.g. via the Supabase dashboard's function editor) can read
-- it in plaintext. Recommend, as a separate follow-up:
--   1. Rotate INTERNAL_SECRET - generate a new value, update it in
--      Vercel's env vars AND in this function's v_internal_secret.
--   2. Consider moving it into Supabase Vault
--      (vault.decrypted_secrets) instead of a hardcoded literal, so
--      it's not sitting in the function's source at all.
-- Not done here since changing a live security-relevant trigger
-- deserves an explicit go-ahead first, not a silent side effect of
-- committing documentation.
--
-- Requires the pg_net extension (for net.http_post) - already enabled
-- on this project since the live function already depends on it.

create or replace function public.push_on_notification_insert()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  -- ▼▼▼ EDIT THESE TWO VALUES ▼▼▼
  v_site_url        text := 'https://school-os-j4bn.vercel.app';
  v_internal_secret text := 'PASTE_YOUR_INTERNAL_SECRET_HERE'; -- must match INTERNAL_SECRET in Vercel env vars
  -- ▲▲▲ EDIT THESE TWO VALUES ▲▲▲
begin
  -- If the secret was never filled in, skip quietly rather than error out
  -- and block the notification insert itself — better to silently miss a
  -- push than to break the feature that actually matters (the notification
  -- existing in the bell).
  if v_internal_secret = 'PASTE_YOUR_INTERNAL_SECRET_HERE' or v_internal_secret is null then
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
                 'url',     coalesce(new.action_url, '/dashboard'),
                 'tag',     coalesce(new.type, 'system')
               )
  );

  return new;
end;
$function$;

drop trigger if exists trg_push_on_notification_insert on public.notifications;

create trigger trg_push_on_notification_insert
  after insert on public.notifications
  for each row
  execute function public.push_on_notification_insert();
