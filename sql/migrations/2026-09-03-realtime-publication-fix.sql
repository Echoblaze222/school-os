-- 2026-09-03-realtime-publication-fix.sql
--
-- Root cause of the "changes don't show up for other users without a
-- manual reload" problem: the supabase_realtime publication only ever
-- contained the 4 chat tables (chat_messages, chat_room_members,
-- chat_rooms, message_read_receipts). Every other realtime
-- subscription already written in the client (useRealtimeNotifications,
-- AnnouncementsViewer, the useRealtimeTable callers used by the
-- meetings/results/staff/students screens, BursarDashboardClient's
-- payment_claims badge, RoleNav's unread-chat badge on `messages`)
-- was connecting successfully and just never receiving events, because
-- Postgres logical replication only publishes changes for tables
-- explicitly in the publication.
--
-- Applied directly to the "school portal" project on 2026-09-03 via
-- the Supabase migration tool; this file mirrors that change in
-- version control per repo convention. Re-running is a no-op if the
-- tables are already in the publication (guarded below).
--
-- Safety: every table below has RLS enabled with SELECT policies
-- scoped to school_id / auth.uid() / role (verified against
-- pg_policies before applying). Supabase Realtime evaluates each
-- subscriber's SELECT RLS policy per row before broadcasting a
-- postgres_changes event, so this only fixes delivery of events the
-- subscriber could already read via a normal query - it does not
-- expose anything new.

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'announcements') then
    alter publication supabase_realtime add table public.announcements;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'online_meetings') then
    alter publication supabase_realtime add table public.online_meetings;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'profiles') then
    alter publication supabase_realtime add table public.profiles;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'results') then
    alter publication supabase_realtime add table public.results;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'payment_claims') then
    alter publication supabase_realtime add table public.payment_claims;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;
