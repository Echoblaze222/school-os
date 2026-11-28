-- SchoolOS offline sync fixes. Follows 2026-11-25-offline-read-sync.sql.
-- Target project: "school portal" (hgoasuqnuhltxocbcjnr)
-- ALREADY APPLIED to the live project on 2026-11-28 as migration offline_sync_fixes_2026_11_28.
-- Idempotent and additive: safe to run again, no existing data is changed.
--
-- Why: a check of the live database showed it was running revision 1 of the read-sync
-- migration (no profiles tombstones, no NULL school_id guard, no prune job), and that
-- profiles and class_teachers had an updated_at column with no trigger maintaining it, so
-- edits to those rows would never have moved a device's delta cursor.

-- 1. Tombstone function: revision 2 NULL school_id guard (a delete must never fail because of it)
create or replace function public.record_sync_deletion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.school_id is not null then
    insert into public.sync_deletions (table_name, row_id, school_id)
    values (tg_table_name, old.id, old.school_id);
  end if;
  return old;
end;
$$;

revoke all on function public.record_sync_deletion() from public, anon, authenticated;

-- 2. Tombstones for profiles (missing in the live database)
drop trigger if exists trg_profiles_record_deletion on public.profiles;
create trigger trg_profiles_record_deletion after delete on public.profiles
  for each row execute function public.record_sync_deletion();

-- 3. class_teachers: updates must move the delta cursor
drop trigger if exists trg_class_teachers_set_updated_at on public.class_teachers;
create trigger trg_class_teachers_set_updated_at before update on public.class_teachers
  for each row execute function public.set_updated_at();

-- 4. profiles: bump updated_at only for meaningful changes, so the heartbeat columns
--    (last_activity, last_action) do not make every active user re-download their row.
create or replace function public.profiles_touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if (to_jsonb(new) - 'updated_at' - 'last_activity' - 'last_action')
     is distinct from
     (to_jsonb(old) - 'updated_at' - 'last_activity' - 'last_action') then
    new.updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_touch_updated_at on public.profiles;
create trigger trg_profiles_touch_updated_at before update on public.profiles
  for each row execute function public.profiles_touch_updated_at();

-- 5. Prune tombstones older than 90 days, daily (pg_cron is installed)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'prune-sync-deletions';
    perform cron.schedule(
      'prune-sync-deletions', '17 3 * * *',
      $cron$delete from public.sync_deletions where deleted_at < now() - interval '90 days'$cron$);
  end if;
end $$;
