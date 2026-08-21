-- ============================================================
-- ⚠️ RECONSTRUCTED — REVIEW BEFORE APPLYING, DO NOT BLIND-RUN THIS ⚠️
--
-- The real trigger this repo relies on (referenced by comment in
-- src/app/api/internal/push-on-notification/route.ts as
-- "lib/supabase/notifications_push_trigger.sql") is not checked into
-- this repo — it was applied directly to Supabase and its exact
-- current definition is unknown to me. That's a separate, smaller gap
-- worth fixing on its own (infra-as-code: the live trigger should be
-- pg_dump'd into this repo so it's reproducible), independent of
-- whether you apply the change below.
--
-- This file is my reconstruction of what that trigger must do, based
-- on what api/internal/push-on-notification/route.ts expects to
-- receive (user_id, title, body, url, tag) — PLUS the one addition
-- Lane 3 needs: skip calling the push edge function at all when the
-- new row's category has push disabled in notification_preferences.
--
-- Before running this against production:
--   1. Pull the ACTUAL current trigger definition from Supabase
--      (Dashboard → Database → Triggers, or
--      `select pg_get_triggerdef(oid) from pg_trigger where ...`)
--      and diff it against this file. My version may be missing
--      error handling, retry/timeout tuning, or other details the
--      original author added that aren't visible from the calling
--      route alone.
--   2. Once confirmed correct, commit the real definition to this
--      repo (e.g. as 00-CURRENT-push-trigger-as-deployed.sql) so this
--      stops being undocumented infrastructure.
--   3. Only then apply the preference-check addition below, ideally
--      as a targeted `create or replace function` against the
--      confirmed-correct base rather than this reconstruction.
--
-- ============================================================

-- Trigger function: fires AFTER INSERT on public.notifications, calls
-- the internal push route via pg_net (fire-and-forget HTTP POST) —
-- UNLESS the recipient has push disabled for this notification's
-- category in notification_preferences.
create or replace function public.trigger_push_on_notification()
returns trigger
language plpgsql
security definer
as $$
declare
  v_push_enabled boolean;
  v_project_url text := current_setting('app.settings.project_url', true);
  v_internal_secret text := current_setting('app.settings.internal_secret', true);
begin
  -- Category-level push preference (Lane 3 addition). Defaults to
  -- enabled when no preference row exists, same fallback notifyUser.ts
  -- uses, so behavior is unchanged for anyone who hasn't touched their
  -- notification settings.
  select push_enabled into v_push_enabled
  from public.notification_preferences
  where user_id = NEW.user_id and category = NEW.type;

  if v_push_enabled is false then
    return NEW; -- category muted for this user — skip the push, in-app row already inserted
  end if;

  -- Fire-and-forget HTTP call via pg_net. Adjust the URL/secret lookup
  -- below to however the real trigger currently reads them (Supabase
  -- Vault, a config table, hardcoded project ref — unknown to me,
  -- flagged above).
  perform net.http_post(
    url := v_project_url || '/api/internal/push-on-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', v_internal_secret
    ),
    body := jsonb_build_object(
      'user_id', NEW.user_id,
      'title', NEW.title,
      'body', NEW.body,
      'url', coalesce(NEW.link_url, NEW.action_url, '/dashboard'),
      'tag', NEW.id::text
    )
  );

  return NEW;
end;
$$;

-- Uncomment once the base trigger definition has been confirmed
-- against production and this function is verified correct:
-- drop trigger if exists notifications_push_trigger on public.notifications;
-- create trigger notifications_push_trigger
--   after insert on public.notifications
--   for each row execute function public.trigger_push_on_notification();
