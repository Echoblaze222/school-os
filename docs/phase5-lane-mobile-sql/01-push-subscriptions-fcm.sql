-- ============================================================
-- SchoolOS, Lane 5: Android app, push-notification groundwork
--
-- push_subscriptions currently only stores Web Push (VAPID)
-- subscriptions: endpoint (a URL) + p256dh/auth keys. A native
-- Capacitor Android app doesn't have any of those — it registers
-- with Firebase Cloud Messaging and gets back a single opaque
-- token string instead.
--
-- Rather than create a second, disconnected table (device_tokens)
-- that every future "send to this user" call site would need to
-- remember to also check, this extends the existing table with a
-- platform column and reuses `endpoint` as the unique conflict key
-- for both: web rows keep their real HTTPS endpoint URL, android
-- rows store `fcm:<token>` there, which is guaranteed to never
-- collide with a real URL and keeps the existing
-- `upsert(..., { onConflict: 'endpoint' })` logic in
-- api/push/subscribe/route.ts working unchanged for web, and
-- reusable as-is for the new android subscribe path.
--
-- p256dh/auth are web-only fields and were NOT NULL before this;
-- android rows never populate them, so that constraint is relaxed
-- here. fcm_token duplicates the token that's also embedded in
-- `endpoint` as `fcm:<token>` — kept as its own column too so the
-- FCM send path can read a clean token value without string-parsing
-- `endpoint` every time.
--
-- Not yet run against the live database, same caveat as every other
-- schema file in this repo: review against the live table before
-- applying, this repo has no migration history to diff against.
-- ============================================================

alter table public.push_subscriptions
  add column if not exists platform   text not null default 'web' check (platform in ('web', 'android')),
  add column if not exists fcm_token  text;

alter table public.push_subscriptions
  alter column p256dh drop not null,
  alter column auth   drop not null;

-- A web row must have its VAPID keys; an android row must have its
-- FCM token. Enforced here so a bad insert from either subscribe
-- path fails loudly at the database instead of silently producing a
-- row sendPushToUsers can't actually deliver to.
alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_platform_fields_check,
  add constraint push_subscriptions_platform_fields_check check (
    (platform = 'web'     and p256dh is not null and auth is not null) or
    (platform = 'android' and fcm_token is not null)
  );

create index if not exists idx_push_subscriptions_platform
  on public.push_subscriptions (platform);
