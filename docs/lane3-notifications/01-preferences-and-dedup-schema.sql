-- ============================================================
-- Lane 3: Notification preferences (§64) + deduplication (§67)
--
-- Two independent additions to the existing `notifications` /
-- `notification_deliveries` tables — neither changes their existing
-- columns or behavior for callers that don't use the new fields.
-- ============================================================

-- ---- 1. Category-level preferences --------------------------------
-- The existing `profiles.notify_whatsapp` / `notify_sms` booleans are
-- ALL-OR-NOTHING per channel — no way to say "fee reminders yes,
-- promotional no" (§64's actual example). This table adds category
-- granularity on top; notifyUser() falls back to the profiles booleans
-- when no row exists here, so nothing breaks for users who've never
-- touched their preferences.
create table if not exists public.notification_preferences (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  category     text not null,   -- matches notifications.type convention: 'fee_reminder', 'attendance', 'announcement', etc.
  push_enabled     boolean not null default true,
  in_app_enabled   boolean not null default true,  -- almost never turned off; here for completeness, not for enforcing (see notifyUser.ts comment)
  whatsapp_enabled boolean not null default true,
  sms_enabled      boolean not null default true,
  updated_at   timestamptz not null default now(),
  unique (user_id, category)
);

create index if not exists idx_notification_prefs_user
  on public.notification_preferences (user_id);

-- Mandatory categories that ignore user preference — security/critical
-- school-safety notifications stay on regardless (§64: "Critical
-- school/security notifications may remain mandatory where justified").
-- Enforced in application code (src/lib/notify/notifyUser.ts), listed
-- here as the single source of truth both sides read from.
comment on table public.notification_preferences is
  'Per-user, per-category channel preferences. Categories not present here fall back to profiles.notify_whatsapp/notify_sms for SMS/WhatsApp, and default to push+in-app enabled. Mandatory categories (see MANDATORY_CATEGORIES in src/lib/notify/notifyUser.ts) bypass this table entirely.';

alter table public.notification_preferences enable row level security;

drop policy if exists "notification_preferences_own_row" on public.notification_preferences;
create policy "notification_preferences_own_row"
  on public.notification_preferences
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---- 2. Deduplication key -------------------------------------------
-- §67: "A payment webhook may be delivered multiple times. It must not
-- produce 5 payment notifications." Callers that can be retried
-- (webhooks, cron re-runs, queue job retries) pass a stable
-- `dedupeKey` (e.g. `paystack:${reference}` or `job:${jobId}`);
-- notifyUser() checks this before inserting. Nullable + partial unique
-- index so callers that don't pass one (most UI-triggered sends,
-- which aren't retried) are unaffected.
alter table public.notifications
  add column if not exists dedupe_key text;

create unique index if not exists idx_notifications_dedupe_key
  on public.notifications (user_id, dedupe_key)
  where dedupe_key is not null;

-- Same for the SMS/WhatsApp delivery log — the in-app row and the
-- external-channel send are dedup'd independently, since an in-app
-- duplicate is much cheaper than a duplicate billed SMS.
alter table public.notification_deliveries
  add column if not exists dedupe_key text;

create unique index if not exists idx_notification_deliveries_dedupe_key
  on public.notification_deliveries (recipient_id, channel, dedupe_key)
  where dedupe_key is not null;
