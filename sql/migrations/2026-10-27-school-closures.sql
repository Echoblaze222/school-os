-- sql/migrations/2026-10-27-school-closures.sql
--
-- School closure / remote-learning mode. When a school has to close (security
-- threat, flooding, outbreak, strike) the principal switches it on once; every
-- student and parent sees a banner, and staff, parents and students are
-- notified.
--
-- Additive and idempotent. Run in the Supabase SQL editor BEFORE deploying
-- the closure pages. The banner is safe without it (it simply shows nothing
-- until the table exists).
--
-- Access model: RLS enabled with NO policies; only /api/principal/closure and
-- the server-rendered banner (service role, scoped to the viewer's school)
-- read or write this table.

create table if not exists public.school_closures (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references public.schools(id) on delete cascade,
  mode            text not null check (mode in ('closed','remote')),
  reason          text not null
                  check (reason in ('security','weather','health','strike','public','other')),
  message         text,
  starts_on       date not null default current_date,
  -- Informational, and the banner stops showing after this date even if the
  -- principal forgets to end the closure.
  expected_end_on date,
  active          boolean not null default true,
  ended_at        timestamptz,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

-- At most one active closure per school.
create unique index if not exists school_closures_one_active
  on public.school_closures (school_id) where active;

create index if not exists school_closures_school_idx
  on public.school_closures (school_id, created_at desc);

alter table public.school_closures enable row level security;
