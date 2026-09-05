-- 2026-09-05-realtime-publication-principal.sql
--
-- The principal dashboard was assumed covered by the earlier
-- notifications/staff/students/results fix, but a re-scan of
-- /dashboard/principal specifically (prompted by a direct question
-- about it) found two more screens with mutations and no refresh path:
--
--   - report-cards: class teachers submit report cards into this
--     approval queue continuously; the principal (the only role that
--     can approve, per RLS) shouldn't need a manual reload to see a
--     new one waiting.
--   - promotions: despite the folder name, this is the public-site
--     marketing/announcements review queue (admissions pushes,
--     scholarships, open days, etc.), not student class promotion.
--     RLS shows principal, secretary, AND admin all manage it - a
--     genuine shared queue, not single-actor.
--
-- Deliberately left alone in the same pass, after checking each is
-- gated to the principal role alone (single actor, no second viewer
-- for realtime to help): certificates, settings, codes, subscriptions.
--
-- Safety: same check as every batch before this - RLS confirmed
-- scoped to school_id plus the specific roles above before applying.

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'report_cards') then
    alter publication supabase_realtime add table public.report_cards;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'school_promotions') then
    alter publication supabase_realtime add table public.school_promotions;
  end if;
end $$;
