-- sql/migrations/2026-10-27-pickup-authorisation.sql
--
-- Authorised pickup: parents register the people allowed to collect each
-- child and get a one-time 6-digit code per person; the front desk checks the
-- code at the gate and every release / refusal is logged.
--
-- Additive and idempotent. Run in the Supabase SQL editor BEFORE deploying
-- the pickup pages, otherwise they show a "not set up yet" message.
--
-- Access model: RLS is ENABLED with NO policies, so nothing is readable or
-- writable directly. All access goes through /api/parent/pickups and
-- /api/secretary/pickups, which verify the caller and school and use the
-- service role. Codes are stored only as an HMAC (never in plain text), so
-- they cannot be read back from the database.

create table if not exists public.authorized_pickups (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references public.schools(id) on delete cascade,
  student_id   uuid not null references public.profiles(id) on delete cascade,
  created_by   uuid references auth.users(id) on delete set null,
  person_name  text not null,
  relationship text not null,
  phone        text,
  code_hash    text not null,
  valid_until  date,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);
create index if not exists authorized_pickups_student_idx
  on public.authorized_pickups (student_id) where active;

create table if not exists public.pickup_log (
  id                    uuid primary key default gen_random_uuid(),
  school_id             uuid not null references public.schools(id) on delete cascade,
  student_id            uuid not null references public.profiles(id) on delete cascade,
  authorized_pickup_id  uuid references public.authorized_pickups(id) on delete set null,
  person_name           text,
  relationship          text,
  outcome               text not null
                        check (outcome in ('released','denied','failed_code')),
  notes                 text,
  verified_by           uuid references auth.users(id) on delete set null,
  created_at            timestamptz not null default now()
);
create index if not exists pickup_log_student_idx
  on public.pickup_log (student_id, created_at desc);
create index if not exists pickup_log_school_day_idx
  on public.pickup_log (school_id, created_at desc);

alter table public.authorized_pickups enable row level security;
alter table public.pickup_log         enable row level security;
