-- 2026-09-05-realtime-publication-coach-librarian-nurse-admissions.sql
--
-- Third batch, same root cause as the two 2026-09-03 migrations: wires
-- up realtime for the remaining priority screens identified in the
-- 48-screen mutation-without-refresh scan - coach (teams/roster,
-- matches, training sessions/attendance), librarian (checkouts +
-- catalog, since checkout/return decrements library_books.available_copies
-- that the catalog screen displays), nurse (health-records, inventory,
-- medications, visits), and secretary admissions review. Client side,
-- these use the useRealtimeRefresh hook from the earlier hostel/ICT work.
--
-- Also covered here without a new migration (already in the
-- publication from prior work): the student-facing hostel-roll-call
-- prefect screen, which shares hostel_roll_call_entries/sessions with
-- the staff roll-call screen fixed on 2026-09-03; and the VP
-- department detail screen, whose four tables were already published
-- for reasons unrelated to this project.
--
-- Safety, as with every batch before this: RLS is enabled on all 13
-- tables with SELECT policies scoped through school/appointment/role
-- checks (verified against pg_policies before applying - the nurse
-- tables got particular scrutiny given the data involved: scoped to
-- the school's active nurse appointment holder(s), the specific
-- student's parent, the student themselves, or the student's own
-- class teacher - never broader). Realtime evaluates each subscriber's
-- SELECT policy per row, so this only fixes delivery of events a user
-- could already read via a normal query.

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'sports_teams') then
    alter publication supabase_realtime add table public.sports_teams;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'sports_team_members') then
    alter publication supabase_realtime add table public.sports_team_members;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'sports_matches') then
    alter publication supabase_realtime add table public.sports_matches;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'training_sessions') then
    alter publication supabase_realtime add table public.training_sessions;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'training_attendance') then
    alter publication supabase_realtime add table public.training_attendance;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'library_loans') then
    alter publication supabase_realtime add table public.library_loans;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'library_books') then
    alter publication supabase_realtime add table public.library_books;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'student_medical_records') then
    alter publication supabase_realtime add table public.student_medical_records;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'clinic_inventory') then
    alter publication supabase_realtime add table public.clinic_inventory;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'medication_administrations') then
    alter publication supabase_realtime add table public.medication_administrations;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'clinic_visits') then
    alter publication supabase_realtime add table public.clinic_visits;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'admission_applications') then
    alter publication supabase_realtime add table public.admission_applications;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'admission_status_events') then
    alter publication supabase_realtime add table public.admission_status_events;
  end if;
end $$;
